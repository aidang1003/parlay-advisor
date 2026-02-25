import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { BalldontlieAPI, NBATeam } from "@balldontlie/sdk";
dotenv.config();

const api = new BalldontlieAPI({ apiKey: process.env.BALLDONTLIE_API_KEY }); // Init API client with API key from .env
const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "../cache/.bdl-teams.json"); // Cache location
const CACHE_TTL_MS = 100 * 24 * 60 * 60 * 1000; // How long cached data stays fresh (100 days)


async function getTeams(): Promise<NBATeam[]> {
    try {
        const teams = await api.nba.getTeams();
        return teams.data;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

function updateTeamCache(teams: NBATeam[]) {
    const cacheData = {
        timestamp: Date.now(),
        teams: teams
    };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cacheData), 'utf-8');
}

function loadTeamCache(): NBATeam[] | null {
    if (fs.existsSync(CACHE_PATH)) {
        const cacheContent = fs.readFileSync(CACHE_PATH, 'utf-8');
        const cacheData = JSON.parse(cacheContent);
        if (Date.now() - cacheData.timestamp < CACHE_TTL_MS) {
            return cacheData.teams;
        }
    }
    return null;
}

export async function getCachedTeams(): Promise<NBATeam[]> {
    const cached = loadTeamCache();
    if (cached) {
        console.log("Loaded teams from cache.");
        return cached;
    }
    const teams = await getTeams();
    updateTeamCache(teams);
    console.log("Fetched teams from API and updated cache.");
    return teams;
}

function main() {
    const cachedTeams = loadTeamCache();
    if (cachedTeams) {
        console.log("Loaded teams from cache:");
        console.log(cachedTeams);
    } else {
        getTeams().then(teams => {
            updateTeamCache(teams);
            console.log("Fetched teams from API and updated cache:");
            console.log(teams);
        }).catch(error => {
            console.error("Failed to fetch teams from API:", error);
        });
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}