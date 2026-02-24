import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

// The v1/season_averages/{category} endpoint returns a richer shape (player object +
// stats record) not covered by the SDK's getSeasonAverages() which only supports
// the basic v1 format keyed by player_id. Raw fetch is used here instead.
const BDL_BASE_URL = "https://api.balldontlie.io/v1";
const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "/cache/.bdl-season-averages.json"); // Cache location
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface NBASeasonAverage {
    player: { id: number; first_name: string; last_name: string };
    season: number;
    season_type: string;
    stats: Record<string, number | string>;
}

type SeasonAveragesCache = Record<string, { timestamp: number; averages: NBASeasonAverage[] }>;

async function getSeasonAverages(
    playerIds: number[],
    season: number,
    category: string = "general",
    seasonType: string = "regular",
    type: string = "base"
): Promise<NBASeasonAverage[]> {
    try {
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
            headers: { Authorization: process.env.BALLDONTLIE_API_KEY! }
        });
        if (!response.ok) throw new Error(`BDL API error: ${response.status} ${response.statusText}`);
        const data: { data: NBASeasonAverage[] } = await response.json();
        return data.data;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

function updateSeasonAveragesCache(teamId: number, season: number, averages: NBASeasonAverage[]) {
    let cache: SeasonAveragesCache = {};
    if (fs.existsSync(CACHE_PATH)) {
        cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
    cache[`${teamId}-${season}`] = { timestamp: Date.now(), averages };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
}

function loadSeasonAveragesCache(teamId: number, season: number): NBASeasonAverage[] | null {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const cache: SeasonAveragesCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    const entry = cache[`${teamId}-${season}`];
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.averages;
    return null;
}

export async function getCachedSeasonAverages(
    teamId: number,
    playerIds: number[],
    season: number
): Promise<NBASeasonAverage[]> {
    const cached = loadSeasonAveragesCache(teamId, season);
    if (cached) {
        console.log(`Loaded season averages for team ${teamId} season ${season} from cache.`);
        return cached;
    }
    const averages = await getSeasonAverages(playerIds, season);
    updateSeasonAveragesCache(teamId, season, averages);
    console.log(`Fetched season averages for team ${teamId} season ${season} from API and updated cache.`);
    return averages;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const teamId = parseInt(process.argv[2] ?? "1");
    const season = parseInt(process.argv[3] ?? "2026");
    getCachedSeasonAverages(teamId, [], season).then(averages => {
        console.log(averages);
    });
}
