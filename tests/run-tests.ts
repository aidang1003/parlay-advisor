import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(path.dirname(new URL(import.meta.url).pathname), '../.env') });

import { getCachedTeams } from '../list-teams.js';
import { getCachedUpcomingGames } from '../get-games.js';
import { getCachedOdds } from '../get-odds.js';
import { getCachedPlayers } from '../get-players.js';
import { getCachedPlayerInjuries } from '../get-player-injuries.js';
import { getCachedSeasonAverages } from '../get-season-averages.js';
import { getCachedTeamSeasonAverages } from '../get-team-season-averages.js';
import { getCachedLineups } from '../get-lineups.js';
import { getCachedPlayerProps } from '../get-player-props.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type TestResult = {
    module: string;
    passed: boolean;
    message: string;
    firstItem: unknown;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateShape(obj: any, requiredKeys: string[], label: string) {
    for (const key of requiredKeys) {
        if (obj == null || !(key in obj) || obj[key] === undefined) {
            throw new Error(`Missing or invalid field: "${label}.${key}"`);
        }
    }
}

function pass(module: string, firstItem: unknown, detail: string): TestResult {
    console.log(`  ✓  ${module.padEnd(28)} ${detail}`);
    return { module, passed: true, message: detail, firstItem };
}

function fail(module: string, error: Error): TestResult {
    console.log(`  ✗  ${module.padEnd(28)} ${error.message}`);
    return { module, passed: false, message: error.message, firstItem: null };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Shared state derived from earlier tests and passed forward
let teamId = 0;
let gameId = 0;
let playerIds: number[] = [];
const SEASON = 2026;
const DATE = '2026-02-25';

async function testTeams(): Promise<TestResult> {
    const teams = await getCachedTeams();
    if (teams.length === 0) throw new Error('teams array is empty');
    // NBATeam shape (SDK)
    validateShape(teams[0], ['id', 'conference', 'division', 'city', 'name', 'full_name', 'abbreviation'], 'NBATeam');
    teamId = teams[0].id;
    return pass('list-teams', teams[0], `${teams.length} teams · first: ${teams[0].full_name}`);
}

async function testGames(): Promise<TestResult> {
    const games = await getCachedUpcomingGames();
    if (games.length === 0) throw new Error('games array is empty');
    // NBAGame shape (SDK)
    validateShape(games[0], ['id', 'date', 'season', 'status', 'home_team', 'visitor_team', 'home_team_score', 'visitor_team_score'], 'NBAGame');
    if (typeof games[0].home_team !== 'object') throw new Error('NBAGame.home_team must be an object');
    gameId = games[0].id;
    teamId = games[0].home_team.id; // override with a real game team
    return pass('get-games', games[0], `${games.length} games · first: ${games[0].home_team.city} vs ${games[0].visitor_team.city}`);
}

async function testOdds(): Promise<TestResult> {
    const oddsData = await getCachedOdds();
    if (!Array.isArray(oddsData.data)) throw new Error('odds.data must be an array');
    if (oddsData.data.length > 0) {
        // NBAOdds shape (SDK)
        validateShape(oddsData.data[0], ['id', 'game_id', 'vendor', 'moneyline_home_odds', 'moneyline_away_odds'], 'NBAOdds');
    }
    return pass('get-odds', oddsData.data[0] ?? null, `${oddsData.data.length} odds entries`);
}

async function testPlayers(): Promise<TestResult> {
    const players = await getCachedPlayers(teamId);
    if (players.length === 0) throw new Error(`players array is empty for team ${teamId}`);
    // NBAPlayer shape (SDK)
    validateShape(players[0], ['id', 'first_name', 'last_name', 'position', 'team'], 'NBAPlayer');
    if (typeof players[0].team !== 'object') throw new Error('NBAPlayer.team must be an object');
    playerIds = players.map(p => p.id);
    return pass('get-players', players[0], `${players.length} players · first: ${players[0].first_name} ${players[0].last_name}`);
}

async function testPlayerInjuries(): Promise<TestResult> {
    const injuries = await getCachedPlayerInjuries(teamId);
    if (injuries.length > 0) {
        // NBAPlayerInjury shape (SDK)
        validateShape(injuries[0], ['player', 'status'], 'NBAPlayerInjury');
        if (typeof injuries[0].player !== 'object') throw new Error('NBAPlayerInjury.player must be an object');
    }
    return pass('get-player-injuries', injuries[0] ?? null, `${injuries.length} injuries for team ${teamId}`);
}

async function testSeasonAverages(): Promise<TestResult> {
    const averages = await getCachedSeasonAverages(teamId, playerIds, SEASON);
    if (averages.length > 0) {
        // NBASeasonAverage shape (local)
        validateShape(averages[0], ['player', 'season', 'season_type', 'stats'], 'NBASeasonAverage');
        if (typeof averages[0].stats !== 'object') throw new Error('NBASeasonAverage.stats must be an object');
    }
    return pass('get-season-averages', averages[0] ?? null, `${averages.length} averages · team ${teamId} season ${SEASON}`);
}

async function testTeamSeasonAverages(): Promise<TestResult> {
    const avg = await getCachedTeamSeasonAverages(teamId, SEASON);
    if (avg) {
        // NBATeamSeasonAverage shape (local)
        validateShape(avg, ['team', 'season', 'season_type', 'stats'], 'NBATeamSeasonAverage');
        if (typeof avg.stats !== 'object') throw new Error('NBATeamSeasonAverage.stats must be an object');
    }
    return pass('get-team-season-averages', avg ?? null, avg ? `team ${teamId} season ${SEASON}` : 'no data available');
}

async function testLineups(): Promise<TestResult> {
    const lineups = await getCachedLineups([gameId], teamId);
    if (lineups.length > 0) {
        // NBALineup shape (local)
        validateShape(lineups[0], ['id', 'game_id', 'starter', 'position', 'player', 'team'], 'NBALineup');
        if (typeof lineups[0].player !== 'object') throw new Error('NBALineup.player must be an object');
    }
    return pass('get-lineups', lineups[0] ?? null, `${lineups.length} lineup entries · game ${gameId} team ${teamId}`);
}

async function testPlayerProps(): Promise<TestResult> {
    const props = await getCachedPlayerProps(DATE);
    if (props.length > 0) {
        // NBAPlayerProp shape (local)
        validateShape(props[0], ['id', 'game_id', 'player_id', 'vendor', 'prop_type', 'line_value', 'market'], 'NBAPlayerProp');
        if (typeof props[0].market !== 'object') throw new Error('NBAPlayerProp.market must be an object');
    }
    return pass('get-player-props', props[0] ?? null, `${props.length} props for ${DATE}`);
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runAll() {
    console.log('\n=== NBA Module Smoke Tests ===\n');

    // Tests run sequentially — later tests depend on teamId/gameId/playerIds
    // resolved by the games and players tests.
    const suite: Array<() => Promise<TestResult>> = [
        testTeams,
        testGames,
        testOdds,
        testPlayers,
        testPlayerInjuries,
        testSeasonAverages,
        testTeamSeasonAverages,
        testLineups,
        testPlayerProps,
    ];

    const results: TestResult[] = [];
    for (const test of suite) {
        try {
            results.push(await test());
        } catch (e) {
            results.push(fail(test.name, e as Error));
        }
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const passed = results.filter(r => r.passed).length;
    console.log(`\n=== ${passed}/${results.length} passed ===\n`);

    // ── Write sample.json ─────────────────────────────────────────────────────
    const sample: Record<string, unknown> = {};
    for (const r of results) {
        sample[r.module] = r.firstItem;
    }
    const samplePath = path.join(path.dirname(new URL(import.meta.url).pathname), 'sample.json');
    fs.writeFileSync(samplePath, JSON.stringify(sample, null, 2), 'utf-8');
    console.log(`Sample written → tests/sample.json`);

    if (passed < results.length) process.exit(1);
}

runAll().catch(err => {
    console.error('Test runner crashed:', err);
    process.exit(1);
});
