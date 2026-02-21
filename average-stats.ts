import { aiCall } from "./advisor";
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), ".bdl-cache.json");

// How long cached data stays fresh (ms). Lower this in production.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

interface CacheEntry<T> {
    data: T;
    timestamp: number; // Date.now() when cached
}

interface CacheData {
    teams?: CacheEntry<BDLTeam[]>;
    rosters: Record<string, CacheEntry<BDLPlayer[]>>;
    seasonAverages: Record<string, CacheEntry<PlayerSeasonAverage[]>>;
    teamSeasonAverages: Record<string, CacheEntry<TeamSeasonAverage>>;
    injuries: Record<string, CacheEntry<PlayerInjury[]>>;
    recentGames: Record<string, CacheEntry<BDLGame[]>>;
    lineups: Record<string, CacheEntry<LineupEntry[]>>;
    gameOdds: Record<string, CacheEntry<GameOdds[]>>;
    playerProps: Record<string, CacheEntry<PlayerProp[]>>;
    todaysGameId: Record<string, CacheEntry<number | null>>;
    formattedGameOdds: Record<string, CacheEntry<string>>;
}

function loadCache(): CacheData {
    if (fs.existsSync(CACHE_PATH)) {
        console.log("Loading from cache...");
        return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    }
    return {
        rosters: {}, seasonAverages: {}, teamSeasonAverages: {},
        injuries: {}, recentGames: {}, lineups: {},
        gameOdds: {}, playerProps: {}, todaysGameId: {}, formattedGameOdds: {},
    };
}

function saveCache(cache: CacheData): void {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
    if (!entry) return false;
    return (Date.now() - entry.timestamp) < CACHE_TTL_MS;
}

function cached<T>(data: T): CacheEntry<T> {
    return { data, timestamp: Date.now() };
}

const BDL_V1_BASE = "https://api.balldontlie.io/v1";
const BDL_V2_BASE = "https://api.balldontlie.io/v2";
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY;

// ── Configure matchup here ──────────────────────────────────────────
const MATCHUP = { // TODO: Feed in data here from the frontend/polymarket API
    away: "ORL",       // team abbreviation
    home: "PHX",       // team abbreviation (e.g. "HOU", "LAL", "BOS")
    date: "2026-02-21", // game date YYYY-MM-DD (used for odds lookup)
    season: 2026,
    polymarketUrl: "https://polymarket.com/sports/nba/nba-orl-phx-2026-02-21",
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

interface GameOdds {
    id: number;
    game_id: number;
    vendor: string;
    spread_home_value: string;
    spread_home_odds: number;
    spread_away_value: string;
    spread_away_odds: number;
    moneyline_home_odds: number;
    moneyline_away_odds: number;
    total_value: string;
    total_over_odds: number;
    total_under_odds: number;
    updated_at: string;
}

interface PlayerPropMarket {
    type: string;           // "over_under" or "milestone"
    over_odds?: number;
    under_odds?: number;
    odds?: number;          // for milestone markets
}

interface PlayerProp {
    id: number;
    game_id: number;
    player_id: number;
    vendor: string;
    prop_type: string;      // "points", "rebounds", "assists", etc.
    line_value: string;
    market: PlayerPropMarket;
    updated_at: string;
}

async function bdlFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    if (!BDL_API_KEY) {
        throw new Error("BALLDONTLIE_API_KEY is not set in .env");
    }
    const url = new URL(`${BDL_V1_BASE}${path}`);
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
    if (!isFresh(cache.teams)) {
        console.log("Fetching teams from API...");
        const { data } = await bdlFetch<{ data: BDLTeam[] }>("/teams");
        cache.teams = cached(data);
        saveCache(cache);
    }
    const team = cache.teams.data.find(
        (t: BDLTeam) => t.abbreviation.toUpperCase() === abbreviation.toUpperCase()
    );
    if (!team) {
        throw new Error(`Team not found for abbreviation: ${abbreviation}`);
    }
    console.log(`Resolved ${abbreviation} → ${team.full_name} (id ${team.id})`);
    return team;
}

async function fetchRoster(teamId: number, cache: CacheData): Promise<BDLPlayer[]> {
    const key = String(teamId);
    if (isFresh(cache.rosters[key])) {
        console.log(`Using cached roster for team ${teamId} (${cache.rosters[key].data.length} players)`);
        return cache.rosters[key].data;
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
    cache.rosters[key] = cached(currentPlayers);
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
    if (isFresh(cache.seasonAverages[key])) {
        console.log(`Using cached season averages for team ${teamId}, season ${season}`);
        return cache.seasonAverages[key].data;
    }

    console.log(`Fetching season averages from API for team ${teamId}...`);
    const url = new URL(`${BDL_V1_BASE}/season_averages/${category}`);
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
    cache.seasonAverages[key] = cached(data.data);
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
    if (isFresh(cache.teamSeasonAverages[key])) {
        console.log(`Using cached team season averages for team ${teamId}, season ${season}`);
        return cache.teamSeasonAverages[key].data;
    }

    console.log(`Fetching team season averages from API for team ${teamId}...`);
    const url = new URL(`${BDL_V1_BASE}/team_season_averages/${category}`);
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
        cache.teamSeasonAverages[key] = cached(entry);
        saveCache(cache);
    }
    return entry;
}

async function fetchRecentGames(teamId: number, season: number, cache: CacheData, count: number = 5): Promise<BDLGame[]> {
    const key = `${teamId}-${season}`;
    if (isFresh(cache.recentGames[key])) {
        console.log(`Using cached recent games for team ${teamId}`);
        return cache.recentGames[key].data;
    }

    console.log(`Fetching recent games for team ${teamId}...`);
    const { data } = await bdlFetch<{ data: BDLGame[] }>("/games", {
        "team_ids[]": teamId.toString(),
        "seasons[]": season.toString(),
        per_page: count.toString(),
    });
    const completed = data.filter((g) => g.status === "Final");
    console.log(`Found ${completed.length} completed recent games for team ${teamId}`);
    cache.recentGames[key] = cached(completed);
    saveCache(cache);
    return completed;
}

async function fetchLineups(gameIds: number[], teamId: number, cache: CacheData): Promise<LineupEntry[]> {
    if (gameIds.length === 0) return [];
    const key = `${teamId}-${gameIds.join(",")}`;
    if (isFresh(cache.lineups[key])) {
        console.log(`Using cached lineups for team ${teamId}`);
        return cache.lineups[key].data;
    }

    console.log(`Fetching lineups for ${gameIds.length} games (team ${teamId})...`);

    // Build URL manually since we need multiple game_ids[] params
    const url = new URL(`${BDL_V1_BASE}/lineups`);
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
    cache.lineups[key] = cached(teamEntries);
    saveCache(cache);
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

async function bdlV2Fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    if (!BDL_API_KEY) {
        throw new Error("BALLDONTLIE_API_KEY is not set in .env");
    }
    const url = new URL(`${BDL_V2_BASE}${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
    }
    const response = await fetch(url.toString(), {
        headers: { Authorization: BDL_API_KEY },
    });
    if (!response.ok) {
        throw new Error(`BDL v2 API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
}

async function findTodaysGameId(homeTeamId: number, awayTeamId: number, date: string): Promise<number | null> {
    console.log(`Looking up game on ${date}...`);
    const { data } = await bdlFetch<{ data: BDLGame[] }>("/games", {
        "dates[]": date,
        per_page: "100",
    });
    const game = data.find(
        (g) =>
            (g.home_team_id === homeTeamId && g.visitor_team_id === awayTeamId) ||
            (g.home_team_id === awayTeamId && g.visitor_team_id === homeTeamId)
    );
    if (!game) {
        console.warn(`No game found for teams ${homeTeamId} vs ${awayTeamId} on ${date}`);
        return null;
    }
    console.log(`Found game ID ${game.id} for ${date}`);
    return game.id;
}

async function fetchGameOdds(gameId: number, homeTeamId?: number, awayTeamId?: number): Promise<GameOdds[]> {
    console.log(`Fetching game odds for game ${gameId}...`);
    const allOdds: GameOdds[] = [];
    let cursor: number | null = null;

    do {
        const params: Record<string, string> = {
            game_id: gameId.toString(),
            per_page: "100",
        };
        if (homeTeamId !== undefined) {
            params.home_team_id = homeTeamId.toString();
        }
        if (awayTeamId !== undefined) {
            params.away_team_id = awayTeamId.toString();
        }
        if (cursor !== null) {
            params.cursor = cursor.toString();
        }
        const res = await bdlV2Fetch<{ data: GameOdds[]; meta: { next_cursor: number | null } }>(
            "/odds", params
        );
        allOdds.push(...res.data);
        cursor = res.meta.next_cursor ?? null;
    } while (cursor !== null);

    console.log(`Found ${allOdds.length} odds entries for game ${gameId}`);
    return allOdds;
}

async function fetchPlayerProps(gameId: number): Promise<PlayerProp[]> {
    console.log(`Fetching player props for game ${gameId}...`);
    try {
        const { data } = await bdlV2Fetch<{ data: PlayerProp[] }>("/odds/player_props", {
            game_id: gameId.toString(),
        });
        console.log(`Found ${data.length} player props for game ${gameId}`);
        return data;
    } catch (e) {
        console.warn(`Player props API error:`, e);
        return [];
    }
}

async function formatGameOddsForPrompt(odds: GameOdds[], homeTeam: BDLTeam, awayTeam: BDLTeam, cache: CacheData): Promise<string> {
    if (odds.length === 0) return "BETTING ODDS: No odds available.";

    // Create cache key based on odds data
    const cacheKey = `${odds.map(o => o.id).join(",")}`;
    if (isFresh(cache.formattedGameOdds[cacheKey])) {
        console.log("Using cached formatted game odds");
        return cache.formattedGameOdds[cacheKey].data;
    }

    // Group by vendor, show the latest from each
    const byVendor = new Map<string, GameOdds>();
    for (const o of odds) {
        const existing = byVendor.get(o.vendor);
        if (!existing || o.updated_at > existing.updated_at) {
            byVendor.set(o.vendor, o);
        }
    }

    const lines: string[] = [];
    byVendor.forEach((o, vendor) => {
        lines.push(`  ${vendor}:`);
        lines.push(`    Spread: ${homeTeam.abbreviation} ${o.spread_home_value} (${o.spread_home_odds}), ${awayTeam.abbreviation} ${o.spread_away_value} (${o.spread_away_odds})`);
        lines.push(`    Moneyline: ${homeTeam.abbreviation} ${o.moneyline_home_odds}, ${awayTeam.abbreviation} ${o.moneyline_away_odds}`);
        lines.push(`    Total: ${o.total_value} (Over ${o.total_over_odds}, Under ${o.total_under_odds})`);
    });

    const result = `BETTING ODDS (live market lines):\n${lines.join("\n")}`;
    cache.formattedGameOdds[cacheKey] = cached(result);
    saveCache(cache);
    return result;
}

function formatPlayerPropsForPrompt(props: PlayerProp[], roster: BDLPlayer[]): string {
    if (props.length === 0) return "";

    // Build player ID → name lookup
    const playerNames = new Map<number, string>();
    for (const p of roster) {
        playerNames.set(p.id, `${p.first_name} ${p.last_name}`);
    }

    // Group by player, then by prop type — show one vendor per prop (latest)
    const byPlayer = new Map<number, Map<string, PlayerProp>>();
    for (const prop of props) {
        if (!byPlayer.has(prop.player_id)) {
            byPlayer.set(prop.player_id, new Map());
        }
        const playerProps = byPlayer.get(prop.player_id)!;
        const existing = playerProps.get(prop.prop_type);
        if (!existing || prop.updated_at > existing.updated_at) {
            playerProps.set(prop.prop_type, prop);
        }
    }

    const lines: string[] = [];
    byPlayer.forEach((propMap, playerId) => {
        const name = playerNames.get(playerId) ?? `Player #${playerId}`;
        const propLines: string[] = [];
        propMap.forEach((p) => {
            if (p.market.type === "over_under") {
                propLines.push(`    ${p.prop_type}: ${p.line_value} (O ${p.market.over_odds}, U ${p.market.under_odds})`);
            } else {
                propLines.push(`    ${p.prop_type}: ${p.line_value} (${p.market.odds})`);
            }
        });
        lines.push(`  ${name}:\n${propLines.join("\n")}`);
    });
    return lines.join("\n");
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
        fetchRecentGames(homeTeam.id, MATCHUP.season, cache),
        fetchRecentGames(awayTeam.id, MATCHUP.season, cache)
    ]);

    // 4. Fetch lineups for recent games + find today's game for odds
    console.log("Fetching recent lineups and looking up today's game...");
    const [homeLineups, awayLineups, todaysGameId] = await Promise.all([
        fetchLineups(homeGames.map((g) => g.id), homeTeam.id, cache),
        fetchLineups(awayGames.map((g) => g.id), awayTeam.id, cache),
        findTodaysGameId(homeTeam.id, awayTeam.id, MATCHUP.date),
    ]);

    // 5. Fetch live odds and player props if we found the game
    let gameOdds: GameOdds[] = [];
    let playerProps: PlayerProp[] = [];
    if (todaysGameId) {
        console.log("Fetching live odds and player props...");
        [gameOdds, playerProps] = await Promise.all([
            fetchGameOdds(todaysGameId, homeTeam.id, awayTeam.id),
            fetchPlayerProps(todaysGameId),
        ]);
    } else {
        console.warn("Skipping odds — could not find today's game.");
    }

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
    const oddsBlock = await formatGameOddsForPrompt(gameOdds, homeTeam, awayTeam, cache);
    const allRoster = [...homeRoster, ...awayRoster];
    const propsBlock = playerProps.length > 0
        ? `PLAYER PROP LINES (live market):\n${formatPlayerPropsForPrompt(playerProps, allRoster)}`
        : "PLAYER PROP LINES: No player props available.";

    // 6. Send to AI for analysis
    const prompt = `You are a concise NBA betting analyst. Build a parlay of 3-5 legs for ${homeTeam.full_name} vs ${awayTeam.full_name} (${MATCHUP.polymarketUrl}).
Select a bet in the game market defined in the "BETTING ODDS (live market lines):" section.
Pick from these bet types only: moneyline, spread, over/under (team total), player points, player assists, player rebounds.
Use the live betting odds below as reference for fair market lines. Your parlay legs should reference specific lines based on what the market offers.
ONLY GIVE PLAYER PROPS FOR HEALTHY, ACTIVE PLAYERS in the starting lineup — check the recent lineups and injury report carefully.
Use the actual betting line provided by the market data. DO NOT JUST MAKE YOUR OWN

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

Odds Block: iF THERE IS NOTHING AVAILABLE IN THE ODDS MARKET, YOU MUST SAY "No odds available" AND THEN YOU CAN REFERENCE THE STATS TO MAKE YOUR BEST GUESS AT A GOOD PARLAY, BUT YOU MUST STILL FOLLOW ALL THE RULES ABOVE ABOUT CORRELATION AND ONLY PICKING HEALTHY STARTERS FOR PLAYER PROPS.
${oddsBlock}

${propsBlock}

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
    {"leg": "Bet Outcome (*IMPORTANT TO GET DIRECTIONALLY CORRECT)", "type": "moneyline|spread|over_under|player_points|player_assists|player_rebounds", "reason": "one sentence"},
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
