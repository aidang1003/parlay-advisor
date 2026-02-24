import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { NBATeam } from "@balldontlie/sdk";
dotenv.config();

// The v1/team_season_averages/{category} endpoint is not covered by the SDK.
// Raw fetch is used here instead.
const BDL_BASE_URL = "https://api.balldontlie.io/v1";
const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "/cache/.bdl-team-season-averages.json"); // Cache location
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface NBATeamSeasonAverage {
    team: NBATeam;
    season: number;
    season_type: string;
    stats: Record<string, number | string>;
}

type TeamSeasonAveragesCache = Record<string, { timestamp: number; average: NBATeamSeasonAverage }>;

async function getTeamSeasonAverages(
    teamId: number,
    season: number,
    category: string = "general",
    seasonType: string = "regular",
    type: string = "base"
): Promise<NBATeamSeasonAverage | null> {
    try {
        const url = new URL(`${BDL_BASE_URL}/team_season_averages/${category}`);
        url.searchParams.set("season", season.toString());
        url.searchParams.set("season_type", seasonType);
        if (category !== "hustle") {
            url.searchParams.set("type", type);
        }
        url.searchParams.append("team_ids[]", teamId.toString());
        const response = await fetch(url.toString(), {
            headers: { Authorization: process.env.BALLDONTLIE_API_KEY! }
        });
        if (!response.ok) throw new Error(`BDL API error: ${response.status} ${response.statusText}`);
        const data: { data: NBATeamSeasonAverage[] } = await response.json();
        return data.data[0] ?? null;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

function updateTeamSeasonAveragesCache(teamId: number, season: number, average: NBATeamSeasonAverage) {
    let cache: TeamSeasonAveragesCache = {};
    if (fs.existsSync(CACHE_PATH)) {
        cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
    cache[`${teamId}-${season}`] = { timestamp: Date.now(), average };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
}

function loadTeamSeasonAveragesCache(teamId: number, season: number): NBATeamSeasonAverage | null {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const cache: TeamSeasonAveragesCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    const entry = cache[`${teamId}-${season}`];
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.average;
    return null;
}

export async function getCachedTeamSeasonAverages(
    teamId: number,
    season: number
): Promise<NBATeamSeasonAverage | null> {
    const cached = loadTeamSeasonAveragesCache(teamId, season);
    if (cached) {
        console.log(`Loaded team season averages for team ${teamId} season ${season} from cache.`);
        return cached;
    }
    const average = await getTeamSeasonAverages(teamId, season);
    if (average) {
        updateTeamSeasonAveragesCache(teamId, season, average);
        console.log(`Fetched team season averages for team ${teamId} season ${season} from API and updated cache.`);
    }
    return average;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const teamId = parseInt(process.argv[2] ?? "1");
    const season = parseInt(process.argv[3] ?? "2026");
    getCachedTeamSeasonAverages(teamId, season).then(average => {
        console.log(average);
    });
}
