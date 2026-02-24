import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { BalldontlieAPI, NBAOdds } from "@balldontlie/sdk";
import { getCachedUpcomingGames } from "./get-games.js";
dotenv.config();

const api = new BalldontlieAPI({ apiKey: process.env.BALLDONTLIE_API_KEY }); // Init API client with API key from .env
const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "/cache/.bdl-odds.json"); // Cache location
const CACHE_TTL_MS = 10 * 60 * 1000; // How long cached data stays fresh (ms). Lower this in production.

async function getOdds() {
    try {
        const odds = await api.nba.getOdds({ date: "2026-02-25" });
        console.log("Fetched odds from API:", odds);
        // return odds.data;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

async function getOddsV2() {
    const BASE_URL = "https://api.balldontlie.io/v2/odds";
    const DATE = "2026-02-25";
    const url = `${BASE_URL}?dates[]=${DATE}`;

    try {
        const response = await fetch(url, {
            headers: { "Authorization": process.env.BALLDONTLIE_API_KEY! }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const odds = await response.json();
        return odds;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

function updateOddsCache(odds: any) {
    const cacheData = {
        timestamp: Date.now(),
        odds: odds
    };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cacheData), 'utf-8');
}

function loadOddsCache(): any | null {
    if (fs.existsSync(CACHE_PATH)) {
        const cacheContent = fs.readFileSync(CACHE_PATH, 'utf-8');
        const cacheData = JSON.parse(cacheContent);
        if (Date.now() - cacheData.timestamp < CACHE_TTL_MS) {
            return cacheData.odds;
        }
    }
    return null;
}

function clearOddsCache() {
    if (fs.existsSync(CACHE_PATH)) {
        fs.unlinkSync(CACHE_PATH);
    }
}

export async function getCachedOdds(): Promise<{ data: any[] }> {
    const cachedOdds = loadOddsCache();
    if (cachedOdds) {
        return cachedOdds;
    }
    clearOddsCache();
    const oddsData = await getOddsV2();
    updateOddsCache(oddsData);
    return oddsData;
}

export async function formatOdds(): Promise<string> {
    const oddsData = await getCachedOdds();
    const upcomingGames = await getCachedUpcomingGames();
    const upcomingGameIds = new Set(upcomingGames.map(game => game.id));
    const filtered = { ...oddsData, data: oddsData.data.filter((odd: any) => upcomingGameIds.has(odd.game_id)) };
    return JSON.stringify(filtered, null, 2);
}

async function main() {
    const oddsBlock = await formatOdds();
    console.log(oddsBlock);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
