import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { NBATeam } from "@balldontlie/sdk";
dotenv.config();

// The v1/lineups endpoint is not covered by the SDK. Raw fetch is used here instead.
const BDL_BASE_URL = "https://api.balldontlie.io/v1";
const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "../cache/.bdl-lineups.json"); // Cache location
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface NBALineup {
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
    team: NBATeam;
}

type LineupsCache = Record<string, { timestamp: number; lineups: NBALineup[] }>;

async function getLineups(gameIds: number[], teamId: number): Promise<NBALineup[]> {
    if (gameIds.length === 0) return [];
    try {
        const url = new URL(`${BDL_BASE_URL}/lineups`);
        for (const id of gameIds) {
            url.searchParams.append("game_ids[]", id.toString());
        }
        url.searchParams.set("per_page", "100");

        const allLineups: NBALineup[] = [];
        let cursor: number | null = null;

        do {
            if (cursor !== null) url.searchParams.set("cursor", cursor.toString());
            const response = await fetch(url.toString(), {
                headers: { Authorization: process.env.BALLDONTLIE_API_KEY! }
            });
            if (!response.ok) throw new Error(`BDL API error: ${response.status} ${response.statusText}`);
            const data: { data: NBALineup[]; meta: { next_cursor: number | null } } = await response.json();
            allLineups.push(...data.data);
            cursor = data.meta.next_cursor ?? null;
        } while (cursor !== null);

        // Filter to only entries for the requested team
        return allLineups.filter(e => e.team.id === teamId);
    } catch (error) {
        console.error(error);
        throw error;
    }
}

function updateLineupsCache(teamId: number, gameIds: number[], lineups: NBALineup[]) {
    let cache: LineupsCache = {};
    if (fs.existsSync(CACHE_PATH)) {
        cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
    cache[`${teamId}-${gameIds.join(",")}`] = { timestamp: Date.now(), lineups };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
}

function loadLineupsCache(teamId: number, gameIds: number[]): NBALineup[] | null {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const cache: LineupsCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    const entry = cache[`${teamId}-${gameIds.join(",")}`];
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.lineups;
    return null;
}

export async function getCachedLineups(gameIds: number[], teamId: number): Promise<NBALineup[]> {
    const cached = loadLineupsCache(teamId, gameIds);
    if (cached) {
        console.log(`Loaded lineups for team ${teamId} from cache.`);
        return cached;
    }
    const lineups = await getLineups(gameIds, teamId);
    updateLineupsCache(teamId, gameIds, lineups);
    console.log(`Fetched lineups for team ${teamId} from API and updated cache.`);
    return lineups;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const teamId = parseInt(process.argv[2] ?? "1");
    const gameIds = (process.argv[3] ?? "").split(",").map(Number).filter(Boolean);
    getCachedLineups(gameIds, teamId).then(lineups => {
        console.log(lineups);
    });
}
