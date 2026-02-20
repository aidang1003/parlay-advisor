import { aiCall } from "./advisor";
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), ".bdl-cache.json");

interface CacheData {
    teams?: BDLTeam[];
    rosters: Record<string, BDLPlayer[]>;                    // keyed by team ID
    seasonAverages: Record<string, PlayerSeasonAverage[]>;   // keyed by "teamId-season"
    teamSeasonAverages: Record<string, TeamSeasonAverage>;   // keyed by "teamId-season"
}

function loadCache(): CacheData {
    if (fs.existsSync(CACHE_PATH)) {
        console.log("Loading from cache...");
        return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    }
    return { rosters: {}, seasonAverages: {}, teamSeasonAverages: {} };
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
    season: 2026,
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

interface PlayerInjury {
    player: {
        id: number;
        first_name: string;
        last_name: string;
        position: string;
        team_id: number;
    };
    status: string;       // "Out", "Day-To-Day", "Questionable"
    return_date: string;   // e.g. "Nov 17"
    description: string;
}

interface BDLGame {
    id: number;
    date: string;
    season: number;
    status: string;
    home_team_score: number;
    visitor_team_score: number;
    home_team_id: number;
    visitor_team_id: number;
}

interface LineupEntry {
    id: number;
    game_id: number;
    starter: boolean;
    position: string;
    player: {
        id: number;
        first_name: string;
        last_name: string;
        position: string;
        team_id: number;
    };
    team: BDLTeam;
}

interface TeamSeasonAverage {
    team: BDLTeam;
    season: number;
    season_type: string;
    stats: Record<string, number | string>;
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

    // Filter to only players whose CURRENT team matches — removes traded/released players
    const currentPlayers = players.filter((p) => p.team.id === teamId);
    console.log(`Fetched ${players.length} players, ${currentPlayers.length} currently on team ${teamId}`);
    cache.rosters[key] = currentPlayers;
    saveCache(cache);
    return currentPlayers;
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

async function fetchTeamSeasonAverages(
    teamId: number,
    season: number,
    cache: CacheData,
    category: string = "general",
    seasonType: string = "regular",
    type: string = "base",
): Promise<TeamSeasonAverage | null> {
    const key = `${teamId}-${season}`;
    if (cache.teamSeasonAverages[key]) {
        console.log(`Using cached team season averages for team ${teamId}, season ${season}`);
        return cache.teamSeasonAverages[key];
    }

    console.log(`Fetching team season averages from API for team ${teamId}...`);
    const url = new URL(`${BDL_BASE_URL}/team_season_averages/${category}`);
    url.searchParams.set("season", season.toString());
    url.searchParams.set("season_type", seasonType);
    if (category !== "hustle") {
        url.searchParams.set("type", type);
    }
    url.searchParams.append("team_ids[]", teamId.toString());

    const response = await fetch(url.toString(), {
        headers: { Authorization: BDL_API_KEY! },
    });
    if (!response.ok) {
        console.warn(`Team season averages API error: ${response.status} ${response.statusText}`);
        return null;
    }
    const data: { data: TeamSeasonAverage[] } = await response.json();
    const entry = data.data[0] ?? null;
    if (entry) {
        cache.teamSeasonAverages[key] = entry;
        saveCache(cache);
    }
    return entry;
}

async function fetchRecentGames(teamId: number, season: number, count: number = 5): Promise<BDLGame[]> {
    // Not cached — we want the most recent games each run
    console.log(`Fetching recent games for team ${teamId}...`);
    const { data } = await bdlFetch<{ data: BDLGame[] }>("/games", {
        "team_ids[]": teamId.toString(),
        "seasons[]": season.toString(),
        per_page: count.toString(),
    });
    // API returns games in chronological order; filter to completed games only
    const completed = data.filter((g) => g.status === "Final");
    console.log(`Found ${completed.length} completed recent games for team ${teamId}`);
    return completed;
}

async function fetchLineups(gameIds: number[], teamId: number): Promise<LineupEntry[]> {
    if (gameIds.length === 0) return [];
    console.log(`Fetching lineups for ${gameIds.length} games (team ${teamId})...`);

    // Build URL manually since we need multiple game_ids[] params
    const url = new URL(`${BDL_BASE_URL}/lineups`);
    for (const id of gameIds) {
        url.searchParams.append("game_ids[]", id.toString());
    }
    url.searchParams.set("per_page", "100");

    const allEntries: LineupEntry[] = [];
    let cursor: number | null = null;

    do {
        if (cursor !== null) {
            url.searchParams.set("cursor", cursor.toString());
        }
        const response = await fetch(url.toString(), {
            headers: { Authorization: BDL_API_KEY! },
        });
        if (!response.ok) {
            console.warn(`Lineups API error: ${response.status} ${response.statusText}`);
            return [];
        }
        const res: { data: LineupEntry[]; meta: { next_cursor: number | null } } = await response.json();
        allEntries.push(...res.data);
        cursor = res.meta.next_cursor ?? null;
    } while (cursor !== null);

    // Filter to only entries for our team
    const teamEntries = allEntries.filter((e) => e.team.id === teamId);
    console.log(`Found ${teamEntries.length} lineup entries for team ${teamId}`);
    return teamEntries;
}

function formatLineupsForPrompt(label: string, lineups: LineupEntry[], games: BDLGame[]): string {
    if (lineups.length === 0) return `${label}: No recent lineup data available.`;

    // Group by game, show starters for each
    const byGame = new Map<number, LineupEntry[]>();
    for (const entry of lineups) {
        const list = byGame.get(entry.game_id) ?? [];
        list.push(entry);
        byGame.set(entry.game_id, list);
    }

    const gameLines: string[] = [];
    for (const game of games) {
        const entries = byGame.get(game.id);
        if (!entries) continue;
        const starters = entries.filter((e) => e.starter);
        const starterNames = starters
            .map((e) => `${e.player.first_name} ${e.player.last_name} (${e.position})`)
            .join(", ");
        gameLines.push(`  ${game.date}: Starters: ${starterNames}`);
    }
    return `${label}:\n${gameLines.join("\n")}`;
}

async function fetchInjuries(teamId: number): Promise<PlayerInjury[]> {
    // Injuries are NOT cached — they change daily
    console.log(`Fetching injuries for team ${teamId} from API...`);
    const injuries: PlayerInjury[] = [];
    let cursor: number | null = null;

    do {
        const params: Record<string, string> = {
            "team_ids[]": teamId.toString(),
            per_page: "100",
        };
        if (cursor !== null) {
            params.cursor = cursor.toString();
        }
        const res = await bdlFetch<{ data: PlayerInjury[]; meta: { next_cursor: number | null } }>(
            "/player_injuries", params
        );
        injuries.push(...res.data);
        cursor = res.meta.next_cursor ?? null;
    } while (cursor !== null);

    console.log(`Found ${injuries.length} injuries for team ${teamId}`);
    return injuries;
}

function formatInjuriesForPrompt(label: string, injuries: PlayerInjury[]): string {
    if (injuries.length === 0) return `${label}: No injuries reported.`;
    const lines = injuries.map((inj) => {
        const name = `${inj.player.first_name} ${inj.player.last_name} (${inj.player.position})`;
        return `  ${name} — ${inj.status} (return: ${inj.return_date || "unknown"}) — ${inj.description}`;
    });
    return `${label}:\n${lines.join("\n")}`;
}

function formatTeamStatsForPrompt(label: string, teamStats: TeamSeasonAverage | null): string {
    if (!teamStats) return `${label}: No team stats available.`;
    const statLines = Object.entries(teamStats.stats)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join("\n");
    return `${label}:\n${statLines}`;
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

    // 3. Fetch team stats, player stats, injuries, and recent games
    console.log("Fetching season averages, injuries, and recent games...");
    const [homeStats, awayStats, homeTeamStats, awayTeamStats, homeInjuries, awayInjuries, homeGames, awayGames] = await Promise.all([
        fetchSeasonAverages(homeTeam.id, homeIds, MATCHUP.season, cache),
        fetchSeasonAverages(awayTeam.id, awayIds, MATCHUP.season, cache),
        fetchTeamSeasonAverages(homeTeam.id, MATCHUP.season, cache),
        fetchTeamSeasonAverages(awayTeam.id, MATCHUP.season, cache),
        fetchInjuries(homeTeam.id),
        fetchInjuries(awayTeam.id),
        fetchRecentGames(homeTeam.id, MATCHUP.season),
        fetchRecentGames(awayTeam.id, MATCHUP.season),
    ]);

    // 4. Fetch lineups for recent games
    console.log("Fetching recent lineups...");
    const [homeLineups, awayLineups] = await Promise.all([
        fetchLineups(homeGames.map((g) => g.id), homeTeam.id),
        fetchLineups(awayGames.map((g) => g.id), awayTeam.id),
    ]);

    console.log(`Home stats: ${homeStats.length} players, Away stats: ${awayStats.length} players`);

    const homeTeamBlock = formatTeamStatsForPrompt(
        `${homeTeam.full_name} (${homeTeam.abbreviation}) — Team Stats`,
        homeTeamStats,
    );
    const awayTeamBlock = formatTeamStatsForPrompt(
        `${awayTeam.full_name} (${awayTeam.abbreviation}) — Team Stats`,
        awayTeamStats,
    );
    const homeBlock = formatStatsForPrompt(
        `${homeTeam.full_name} (${homeTeam.abbreviation}) — Player Averages`,
        homeStats,
    );
    const awayBlock = formatStatsForPrompt(
        `${awayTeam.full_name} (${awayTeam.abbreviation}) — Player Averages`,
        awayStats,
    );
    const homeInjuryBlock = formatInjuriesForPrompt(
        `${homeTeam.full_name} (${homeTeam.abbreviation}) — Injuries`,
        homeInjuries,
    );
    const awayInjuryBlock = formatInjuriesForPrompt(
        `${awayTeam.full_name} (${awayTeam.abbreviation}) — Injuries`,
        awayInjuries,
    );
    const homeLineupBlock = formatLineupsForPrompt(
        `${homeTeam.full_name} (${homeTeam.abbreviation}) — Recent Starters`,
        homeLineups,
        homeGames,
    );
    const awayLineupBlock = formatLineupsForPrompt(
        `${awayTeam.full_name} (${awayTeam.abbreviation}) — Recent Starters`,
        awayLineups,
        awayGames,
    );

    // 5. Send to AI for analysis
    const prompt = `You are a concise NBA betting analyst. Build a parlay of 3-5 legs for ${homeTeam.full_name} vs ${awayTeam.full_name} (${MATCHUP.polymarketUrl}).

Pick from these bet types only: moneyline, spread, over/under (team total), player points, player assists, player rebounds.

CRITICAL RULES:
- You MUST return exactly 3, 4, or 5 legs. Never fewer than 3.
- NEVER pick a player prop for an injured/out player. Only use healthy, active players.
- Prefer player props for consistent starters shown in the recent lineups below.
- Factor injuries AND lineup changes into team-level bets: a team missing key starters is weaker on offense/defense.
- NO CORRELATED LEGS THAT WOULD NOT STACK ODDS IN A PARLEY. Correlated examples that offer no value to a parley:
  * Moneyline + spread on the same team (one implies the other)
  * Team under + moneyline on the same team (high-scoring team is more likely to win)
  * Spread + total points (margin and total are correlated)
- Good parlay diversity and correlation: Correlated examples that add value to a parlay include:
  * Mix player props across DIFFERENT players from BOTH teams with at most one team-level bet (moneyline, spread, or over/under).
  * Two player props from the same player (e.g. points + assists for the same player)


RECENT STARTING LINEUPS (last 5 games):
${homeLineupBlock}
${awayLineupBlock}

INJURY REPORT:
${homeInjuryBlock}
${awayInjuryBlock}

TEAM STATS (${MATCHUP.season}):
${homeTeamBlock}
${awayTeamBlock}

PLAYER AVERAGES (${MATCHUP.season}):
${homeBlock}
${awayBlock}

Respond in this exact JSON format, no other text:
{
  "parlay": [
    {"leg": "bet description", "type": "moneyline|spread|over_under|player_points|player_assists|player_rebounds", "reason": "one sentence"},
    ...
  ],
  "confidence": "percent confidence in the parlay",
  "summary": "one sentence overall reasoning"
}`;

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
