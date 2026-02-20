import { aiCall } from "./advisor";
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), ".bdl-cache.json");

interface CacheData {
    teams?: BDLTeam[];
    rosters: Record<string, BDLPlayer[]>;          // keyed by team ID
    seasonAverages: Record<string, PlayerSeasonAverage[]>; // keyed by "teamId-season"
}

function loadCache(): CacheData {
    if (fs.existsSync(CACHE_PATH)) {
        console.log("Loading from cache...");
        return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    }
    return { rosters: {}, seasonAverages: {} };
}

function saveCache(cache: CacheData): void {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

const BDL_BASE_URL = "https://api.balldontlie.io/v1";
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY;

// ── Configure matchup here ──────────────────────────────────────────
const MATCHUP = { // TODO: Feed in data here from the frontend/polymarket API
    home: "MEM",       // team abbreviation (e.g. "HOU", "LAL", "BOS")
    away: "UTA",       // team abbreviation
    season: 2025,
    polymarketUrl: "https://polymarket.com/sports/nba/nba-uta-mem-2026-02-20",
};
// ─────────────────────────────────────────────────────────────────────

interface BDLTeam {
    id: number;
    conference: string;
    division: string;
    city: string;
    name: string;
    full_name: string;
    abbreviation: string;
}

interface BDLPlayer {
    id: number;
    first_name: string;
    last_name: string;
    position: string;
    team: BDLTeam;
}

interface PlayerSeasonAverage {
    player: {
        id: number;
        first_name: string;
        last_name: string;
    };
    season: number;
    season_type: string;
    stats: Record<string, number | string>;
}

interface SeasonAveragesResponse {
    data: PlayerSeasonAverage[];
    meta: { per_page: number };
}

async function bdlFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    if (!BDL_API_KEY) {
        throw new Error("BALLDONTLIE_API_KEY is not set in .env");
    }
    const url = new URL(`${BDL_BASE_URL}${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
    }
    const response = await fetch(url.toString(), {
        headers: { Authorization: BDL_API_KEY },
    });
    if (!response.ok) {
        throw new Error(`BDL API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
}

async function lookupTeam(abbreviation: string, cache: CacheData): Promise<BDLTeam> {
    if (!cache.teams) {
        console.log("Fetching teams from API...");
        const { data } = await bdlFetch<{ data: BDLTeam[] }>("/teams");
        cache.teams = data;
        saveCache(cache);
    }
    const team = cache.teams.find(
        (t) => t.abbreviation.toUpperCase() === abbreviation.toUpperCase()
    );
    if (!team) {
        throw new Error(`Team not found for abbreviation: ${abbreviation}`);
    }
    console.log(`Resolved ${abbreviation} → ${team.full_name} (id ${team.id})`);
    return team;
}

async function fetchRoster(teamId: number, cache: CacheData): Promise<BDLPlayer[]> {
    const key = String(teamId);
    if (cache.rosters[key]) {
        console.log(`Using cached roster for team ${teamId} (${cache.rosters[key].length} players)`);
        return cache.rosters[key];
    }

    console.log(`Fetching roster for team ${teamId} from API...`);
    const players: BDLPlayer[] = [];
    let cursor: number | null = null;

    do {
        const params: Record<string, string> = {
            "team_ids[]": teamId.toString(),
            per_page: "100",
        };
        if (cursor !== null) {
            params.cursor = cursor.toString();
        }
        const res = await bdlFetch<{ data: BDLPlayer[]; meta: { next_cursor: number | null } }>(
            "/players", params
        );
        players.push(...res.data);
        cursor = res.meta.next_cursor ?? null;
    } while (cursor !== null);

    console.log(`Fetched ${players.length} players for team ${teamId}`);
    cache.rosters[key] = players;
    saveCache(cache);
    return players;
}

async function fetchSeasonAverages(
    teamId: number,
    playerIds: number[],
    season: number,
    cache: CacheData,
    category: string = "general",
    seasonType: string = "regular",
    type: string = "base",
): Promise<PlayerSeasonAverage[]> {
    const key = `${teamId}-${season}`;
    if (cache.seasonAverages[key]) {
        console.log(`Using cached season averages for team ${teamId}, season ${season}`);
        return cache.seasonAverages[key];
    }

    console.log(`Fetching season averages from API for team ${teamId}...`);
    const url = new URL(`${BDL_BASE_URL}/season_averages/${category}`);
    url.searchParams.set("season", season.toString());
    url.searchParams.set("season_type", seasonType);
    if (category !== "hustle") {
        url.searchParams.set("type", type);
    }
    for (const id of playerIds) {
        url.searchParams.append("player_ids[]", id.toString());
    }

    const response = await fetch(url.toString(), {
        headers: { Authorization: BDL_API_KEY! },
    });
    if (!response.ok) {
        throw new Error(`BDL API error: ${response.status} ${response.statusText}`);
    }
    const data: SeasonAveragesResponse = await response.json();
    cache.seasonAverages[key] = data.data;
    saveCache(cache);
    return data.data;
}

function formatStatsForPrompt(
    label: string,
    players: PlayerSeasonAverage[],
): string {
    if (players.length === 0) return `${label}: No stats available.`;

    const lines = players.map((p) => {
        const name = `${p.player.first_name} ${p.player.last_name}`;
        const statLines = Object.entries(p.stats)
            .map(([key, value]) => `    ${key}: ${value}`)
            .join("\n");
        return `  ${name}:\n${statLines}`;
    });
    return `${label}:\n${lines.join("\n\n")}`;
}

async function analyzeMatchup(): Promise<string> {
    const cache = loadCache();

    // 1. Resolve team abbreviations → team objects
    console.log("Looking up teams...");
    const [homeTeam, awayTeam] = await Promise.all([
        lookupTeam(MATCHUP.home, cache),
        lookupTeam(MATCHUP.away, cache),
    ]);

    // 2. Fetch rosters for both teams
    console.log("Fetching rosters...");
    const [homeRoster, awayRoster] = await Promise.all([
        fetchRoster(homeTeam.id, cache),
        fetchRoster(awayTeam.id, cache),
    ]);

    const homeIds = homeRoster.map((p) => p.id);
    const awayIds = awayRoster.map((p) => p.id);

    // 3. Fetch season averages for both rosters
    console.log("Fetching season averages...");
    const [homeStats, awayStats] = await Promise.all([
        fetchSeasonAverages(homeTeam.id, homeIds, MATCHUP.season, cache),
        fetchSeasonAverages(awayTeam.id, awayIds, MATCHUP.season, cache),
    ]);

    console.log(`Home stats: ${homeStats.length} players, Away stats: ${awayStats.length} players`);

    const homeBlock = formatStatsForPrompt(
        `${homeTeam.full_name} (${homeTeam.abbreviation})`,
        homeStats,
    );
    const awayBlock = formatStatsForPrompt(
        `${awayTeam.full_name} (${awayTeam.abbreviation})`,
        awayStats,
    );

    // 4. Send to AI for analysis
    const prompt = `You are an NBA betting analyst. Use the following team rosters and season averages to analyze the Polymarket bet at ${MATCHUP.polymarketUrl}.

${homeTeam.full_name} vs ${awayTeam.full_name}

SEASON AVERAGES (${MATCHUP.season}):

${homeBlock}

${awayBlock}

Based on these stats, identify which bet has the best risk-adjusted value. Consider:
- Player performance trends and consistency
- Team strengths and weaknesses relative to each other
- How the stats compare to the betting lines

Format your answer as: {bet:'the specific bet', reason:'your analysis', confidence:'percent confidence'}`;

    console.log("Sending analysis request to AI...");
    const result = await aiCall(prompt);
    console.log("Analysis complete.");
    return result;
}

analyzeMatchup()
    .then((result) => {
        console.log("\n=== BETTING ANALYSIS ===");
        console.log(result);
    })
    .catch((error) => {
        console.error("Analysis failed:", error);
    });
