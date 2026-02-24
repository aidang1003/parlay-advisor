import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

// The v2/odds/player_props endpoint is not covered by the SDK. Raw fetch is used here instead.
const BDL_BASE_URL = "https://api.balldontlie.io/v2";
const CACHE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "/cache/.bdl-player-props.json"); // Cache location
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — live betting lines change frequently

export interface NBAPlayerPropMarket {
    type: string;        // "over_under" or "milestone"
    over_odds?: number;
    under_odds?: number;
    odds?: number;       // for milestone markets
}

export interface NBAPlayerProp {
    id: number;
    game_id: number;
    player_id: number;
    vendor: string;
    prop_type: string;   // "points", "rebounds", "assists", etc.
    line_value: string;
    market: NBAPlayerPropMarket;
    updated_at: string;
}

type PlayerPropsCache = Record<string, { timestamp: number; props: NBAPlayerProp[] }>;

async function getPlayerProps(date: string): Promise<NBAPlayerProp[]> {
    try {
        const url = new URL(`${BDL_BASE_URL}/odds/player_props`);
        url.searchParams.set("date", date);
        const response = await fetch(url.toString(), {
            headers: { Authorization: process.env.BALLDONTLIE_API_KEY! }
        });
        if (!response.ok) {
            console.warn(`Player props unavailable for ${date}: ${response.status} ${response.statusText}`);
            return [];
        }
        const data: { data: NBAPlayerProp[] } = await response.json();
        return data.data;
    } catch (error) {
        console.warn(`Player props fetch failed:`, error);
        return [];
    }
}

function updatePlayerPropsCache(date: string, props: NBAPlayerProp[]) {
    let cache: PlayerPropsCache = {};
    if (fs.existsSync(CACHE_PATH)) {
        cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
    cache[date] = { timestamp: Date.now(), props };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
}

function loadPlayerPropsCache(date: string): NBAPlayerProp[] | null {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const cache: PlayerPropsCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    const entry = cache[date];
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.props;
    return null;
}

export async function getCachedPlayerProps(date: string): Promise<NBAPlayerProp[]> {
    const cached = loadPlayerPropsCache(date);
    if (cached) {
        console.log(`Loaded player props for ${date} from cache.`);
        return cached;
    }
    const props = await getPlayerProps(date);
    updatePlayerPropsCache(date, props);
    console.log(`Fetched player props for ${date} from API and updated cache.`);
    return props;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const date = process.argv[2] ?? "2026-02-25";
    getCachedPlayerProps(date).then(props => {
        console.log(props);
    });
}
