import * as dotenv from 'dotenv';
import { NBATeam, NBAPlayer, NBAGame, NBAPlayerInjury } from "@balldontlie/sdk";
import { getCachedUpcomingGames } from "./get-games.js";
import { getCachedPlayers } from "./get-players.js";
import { getCachedPlayerInjuries } from "./get-player-injuries.js";
import { getCachedSeasonAverages, NBASeasonAverage } from "./get-season-averages.js";
import { getCachedTeamSeasonAverages, NBATeamSeasonAverage } from "./get-team-season-averages.js";
import { getCachedLineups, NBALineup } from "./get-lineups.js";
dotenv.config();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeamAnalysis {
    team: NBATeam;
    roster: NBAPlayer[];
    injuries: NBAPlayerInjury[];
    playerAverages: NBASeasonAverage[];
    teamAverages: NBATeamSeasonAverage | null;
    lineups: NBALineup[];      // starters + bench from the game; empty if not yet available
}

export interface GameAnalysis {
    game: NBAGame;
    home: TeamAnalysis;
    visitor: TeamAnalysis;
}

// ── Builders ──────────────────────────────────────────────────────────────────

async function buildTeamAnalysis(team: NBATeam, game: NBAGame): Promise<TeamAnalysis> {
    const roster = await getCachedPlayers(team.id);
    const playerIds = roster.map(p => p.id);

    // Fetch all team-level data concurrently once we have the roster
    const [injuries, playerAverages, teamAverages, lineups] = await Promise.all([
        getCachedPlayerInjuries(team.id),
        getCachedSeasonAverages(team.id, playerIds, game.season),
        getCachedTeamSeasonAverages(team.id, game.season),
        getCachedLineups([game.id], team.id),
    ]);

    return { team, roster, injuries, playerAverages, teamAverages, lineups };
}

export async function buildGameAnalysis(game: NBAGame): Promise<GameAnalysis> {
    // Fetch both teams concurrently
    const [home, visitor] = await Promise.all([
        buildTeamAnalysis(game.home_team, game),
        buildTeamAnalysis(game.visitor_team, game),
    ]);
    return { game, home, visitor };
}

export async function buildAllGameAnalyses(): Promise<GameAnalysis[]> {
    const games = await getCachedUpcomingGames();
    return Promise.all(games.map(game => buildGameAnalysis(game)));
}

// ── Formatters ────────────────────────────────────────────────────────────────

const KEY_PLAYER_STATS = ['pts', 'ast', 'reb', 'stl', 'blk', 'fg_pct', 'fg3_pct', 'turnover'];
const KEY_TEAM_STATS   = ['pts', 'ast', 'reb', 'stl', 'blk', 'fg_pct', 'fg3_pct', 'opp_pts', 'pace'];

function formatStatLine(stats: Record<string, number | string>, keys: string[]): string {
    return keys
        .filter(k => stats[k] !== undefined && stats[k] !== null)
        .map(k => `${k}: ${stats[k]}`)
        .join(' | ');
}

function formatTeamBlock(ta: TeamAnalysis): string {
    const lines: string[] = [];
    lines.push(`--- ${ta.team.city} ${ta.team.name} (${ta.team.abbreviation}) ---`);

    // Injury report
    if (ta.injuries.length > 0) {
        lines.push(`\nINJURY REPORT (${ta.injuries.length}):`);
        for (const inj of ta.injuries) {
            const name = `${inj.player.first_name} ${inj.player.last_name} (${inj.player.position})`;
            lines.push(`  ${name} — ${inj.status} | Return: ${inj.return_date ?? 'unknown'} — ${inj.description ?? ''}`);
        }
    } else {
        lines.push(`\nINJURY REPORT: None reported`);
    }

    // Lineup
    const starters = ta.lineups.filter(e => e.starter);
    if (starters.length > 0) {
        lines.push(`\nSTARTING LINEUP:`);
        for (const s of starters) {
            lines.push(`  ${s.player.first_name} ${s.player.last_name} (${s.position})`);
        }
    } else {
        lines.push(`\nSTARTING LINEUP: Not yet available`);
    }

    // Team stats
    if (ta.teamAverages) {
        lines.push(`\nTEAM STATS (season ${ta.teamAverages.season}, ${ta.teamAverages.season_type}):`);
        lines.push(`  ${formatStatLine(ta.teamAverages.stats, KEY_TEAM_STATS)}`);
    } else {
        lines.push(`\nTEAM STATS: Not available`);
    }

    // Player averages
    if (ta.playerAverages.length > 0) {
        lines.push(`\nPLAYER AVERAGES (${ta.playerAverages.length} players):`);
        for (const p of ta.playerAverages) {
            const name = `${p.player.first_name} ${p.player.last_name}`;
            lines.push(`  ${name}: ${formatStatLine(p.stats, KEY_PLAYER_STATS)}`);
        }
    } else {
        lines.push(`\nPLAYER AVERAGES: Not available`);
    }

    return lines.join('\n');
}

export function formatGameAnalysis(ga: GameAnalysis): string {
    const { game, home, visitor } = ga;
    const header = [
        `=== GAME: ${home.team.city} ${home.team.name} vs ${visitor.team.city} ${visitor.team.name} ===`,
        `Date: ${game.date} | Season: ${game.season} | Game ID: ${game.id}`,
        `Status: ${game.status ?? 'Scheduled'}`,
        '',
    ].join('\n');

    return [header, formatTeamBlock(home), '', formatTeamBlock(visitor)].join('\n');
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
    const gameIndex = parseInt(process.argv[2] ?? '0');
    getCachedUpcomingGames().then(async games => {
        if (games.length === 0) { console.log('No upcoming games found.'); return; }
        const game = games[gameIndex] ?? games[0];
        const analysis = await buildGameAnalysis(game);
        console.log(formatGameAnalysis(analysis));
    });
}
