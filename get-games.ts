import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { BalldontlieAPI, NBAGame } from "@balldontlie/sdk";
dotenv.config();

const api = new BalldontlieAPI({ apiKey: process.env.BALLDONTLIE_API_KEY }); // Init API client with API key from .env
const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "/cache/.bdl-upcoming-games.json"); // Cache location
const CACHE_TTL_MS = 10 * 60 * 1000; // How long cached data stays fresh (ms). Lower this in production.

async function getUpcomingGames(): Promise<NBAGame[]> {
    try {
        const games = await api.nba.getGames({ start_date: "2026-02-25" });
        return games.data;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

function updateGamesCache(games: NBAGame[]) {
    const cacheData = {
        timestamp: Date.now(),
        games: games
    };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cacheData), 'utf-8');
}

function loadGamesCache(): NBAGame[] | null {
    if (fs.existsSync(CACHE_PATH)) {
        const cacheContent = fs.readFileSync(CACHE_PATH, 'utf-8');
        const cacheData = JSON.parse(cacheContent);
        if (Date.now() - cacheData.timestamp < CACHE_TTL_MS) {
            return cacheData.games;
        }
    }
    return null;
}

async function getCachedUpcomingGames(): Promise<NBAGame[]> {
    const cached = loadGamesCache();
    if (cached) {
        console.log("Loaded games from cache.");
        return cached;
    }
    const games = await getUpcomingGames();
    updateGamesCache(games);
    console.log("Fetched games from API and updated cache.");
    return games;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    getCachedUpcomingGames().then(games => {
        console.log(games);
    });
}