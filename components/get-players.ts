import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { BalldontlieAPI, NBAPlayer } from "@balldontlie/sdk";
dotenv.config();

const api = new BalldontlieAPI({ apiKey: process.env.BALLDONTLIE_API_KEY }); // Init API client with API key from .env
const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "../cache/.bdl-players.json"); // Cache location
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — rosters change infrequently

type PlayersCache = Record<string, { timestamp: number; players: NBAPlayer[] }>;

async function getPlayers(teamId: number): Promise<NBAPlayer[]> {
    try {
        const players: NBAPlayer[] = [];
        let cursor: number | undefined = undefined;
        do {
            const result = await api.nba.getActivePlayers({
                team_ids: [teamId],
                per_page: 100,
                ...(cursor !== undefined ? { cursor } : {})
            });
            players.push(...result.data);
            cursor = (result.meta as any)?.next_cursor ?? undefined;
        } while (cursor !== undefined);
        // Filter to only players currently on this team (removes traded/released players)
        return players.filter(p => p.team.id === teamId);
    } catch (error) {
        console.error(error);
        throw error;
    }
}

function updatePlayersCache(teamId: number, players: NBAPlayer[]) {
    let cache: PlayersCache = {};
    if (fs.existsSync(CACHE_PATH)) {
        cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
    cache[String(teamId)] = { timestamp: Date.now(), players };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
}

function loadPlayersCache(teamId: number): NBAPlayer[] | null {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const cache: PlayersCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    const entry = cache[String(teamId)];
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.players;
    return null;
}

export async function getCachedPlayers(teamId: number): Promise<NBAPlayer[]> {
    const cached = loadPlayersCache(teamId);
    if (cached) {
        console.log(`Loaded players for team ${teamId} from cache.`);
        return cached;
    }
    const players = await getPlayers(teamId);
    updatePlayersCache(teamId, players);
    console.log(`Fetched players for team ${teamId} from API and updated cache.`);
    return players;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const teamId = parseInt(process.argv[2] ?? "1");
    getCachedPlayers(teamId).then(players => {
        console.log(players);
    });
}
