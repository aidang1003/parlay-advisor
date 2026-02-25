import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { BalldontlieAPI, NBAPlayerInjury } from "@balldontlie/sdk";
dotenv.config();

const api = new BalldontlieAPI({ apiKey: process.env.BALLDONTLIE_API_KEY }); // Init API client with API key from .env
const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "../cache/.bdl-player-injuries.json"); // Cache location
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — injury reports change frequently

type PlayerInjuriesCache = Record<string, { timestamp: number; injuries: NBAPlayerInjury[] }>;

async function getPlayerInjuries(teamId: number): Promise<NBAPlayerInjury[]> {
    try {
        const injuries: NBAPlayerInjury[] = [];
        let cursor: number | undefined = undefined;
        do {
            const result = await api.nba.getPlayerInjuries({
                team_ids: [teamId],
                per_page: 100,
                ...(cursor !== undefined ? { cursor } : {})
            });
            injuries.push(...result.data);
            cursor = (result.meta as any)?.next_cursor ?? undefined;
        } while (cursor !== undefined);
        return injuries;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

function updatePlayerInjuriesCache(teamId: number, injuries: NBAPlayerInjury[]) {
    let cache: PlayerInjuriesCache = {};
    if (fs.existsSync(CACHE_PATH)) {
        cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
    cache[String(teamId)] = { timestamp: Date.now(), injuries };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
}

function loadPlayerInjuriesCache(teamId: number): NBAPlayerInjury[] | null {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const cache: PlayerInjuriesCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    const entry = cache[String(teamId)];
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.injuries;
    return null;
}

export async function getCachedPlayerInjuries(teamId: number): Promise<NBAPlayerInjury[]> {
    const cached = loadPlayerInjuriesCache(teamId);
    if (cached) {
        console.log(`Loaded player injuries for team ${teamId} from cache.`);
        return cached;
    }
    const injuries = await getPlayerInjuries(teamId);
    updatePlayerInjuriesCache(teamId, injuries);
    console.log(`Fetched player injuries for team ${teamId} from API and updated cache.`);
    return injuries;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const teamId = parseInt(process.argv[2] ?? "1");
    getCachedPlayerInjuries(teamId).then(injuries => {
        console.log(injuries);
    });
}
