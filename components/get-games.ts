import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { BalldontlieAPI, NBAGame } from "@balldontlie/sdk";
dotenv.config();

const api = new BalldontlieAPI({ apiKey: process.env.BALLDONTLIE_API_KEY }); // Init API client with API key from .env
const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "../cache/.bdl-games.json"); // Cache location
const CACHE_TTL_MS = 10 * 1000; // Update every 10 seconds

async function getUpcomingGames(): Promise<NBAGame[]> {
    try {
        // Pull back from yesterday to catch games that may still be in-progress
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const games = await api.nba.getGames({ start_date: yesterday });

        // Filter out completed games (keep only upcoming/in-progress)
        return games.data.filter((game: NBAGame) =>
            game.status && game.status !== 'Final' && game.status !== 'Completed'
        );
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

export async function getCachedUpcomingGames(): Promise<NBAGame[]> {
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

export async function formatGames(): Promise<string> {
    const games = await getCachedUpcomingGames();
    const formatted = games.map(game => ({
        game_id: game.id,
        date: game.date,
        status: game.status,
        home_team: `${game.home_team.city} ${game.home_team.name}`,
        visitor_team: `${game.visitor_team.city} ${game.visitor_team.name}`,
        home_team_score: game.home_team_score,
        visitor_team_score: game.visitor_team_score,
        postseason: game.postseason,
    }));
    return JSON.stringify(formatted, null, 2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    formatGames().then(games => {
        console.log(games);
    });
}