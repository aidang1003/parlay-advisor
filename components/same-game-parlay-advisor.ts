import * as dotenv from 'dotenv';
import { NBAGame } from "@balldontlie/sdk";
import { getCachedUpcomingGames } from "./get-games.js";
import { getCachedOdds } from "./get-odds.js";
import { buildGameAnalysis, formatGameAnalysis } from "./optimize-game-structure.js";
import { aiCall } from "./Open-0g-Ai-Call.js";
dotenv.config();

// ── Team Lookup ────────────────────────────────────────────────────────────────

function teamMatches(team: NBAGame['home_team'], query: string): boolean {
    const q = query.toLowerCase();
    return (
        team.city.toLowerCase().includes(q) ||
        team.name.toLowerCase().includes(q) ||
        team.full_name.toLowerCase().includes(q) ||
        team.abbreviation.toLowerCase() === q
    );
}

function findGame(games: NBAGame[], teamA: string, teamB: string): NBAGame | null {
    return games.find(game =>
        (teamMatches(game.home_team, teamA) && teamMatches(game.visitor_team, teamB)) ||
        (teamMatches(game.home_team, teamB) && teamMatches(game.visitor_team, teamA))
    ) ?? null;
}

// ── Odds Conversion ───────────────────────────────────────────────────────────
// Polymarket prices odds as shares: a $0.52 share pays $1.00 if correct.
// This is equivalent to implied probability (0–1 scale).
// American odds → implied probability (pre-vig, rounded to 4 decimal places):
//   Negative (e.g. -110): prob = |odds| / (|odds| + 100)
//   Positive (e.g. +130): prob = 100 / (odds + 100)

const ODDS_FIELDS = [
    'spread_home_odds', 'spread_away_odds',
    'moneyline_home_odds', 'moneyline_away_odds',
    'total_over_odds', 'total_under_odds',
] as const;

function americanToShares(american: number): number {
    const prob = american < 0
        ? -american / (-american + 100)
        : 100 / (american + 100);
    return Math.round(prob * 10000) / 10000; // 4 decimal places
}

function convertOddsToShares(odd: any): any {
    const converted = { ...odd };
    for (const field of ODDS_FIELDS) {
        if (typeof converted[field] === 'number') {
            converted[field] = americanToShares(converted[field]);
        }
    }
    return converted;
}

// ── Same-Game Parlay Advisor ───────────────────────────────────────────────────

export async function sameGameParlayAdvice(teamA: string, teamB: string): Promise<string> {
    const games = await getCachedUpcomingGames();
    const game = findGame(games, teamA, teamB);

    if (!game) {
        return `No upcoming game found between "${teamA}" and "${teamB}". Check spelling or try team city, name, or abbreviation (e.g. "Thunder", "Oklahoma City", "OKC").`;
    }

    const homeLabel = `${game.home_team.city} ${game.home_team.name}`;
    const visitorLabel = `${game.visitor_team.city} ${game.visitor_team.name}`;
    console.log(`Found game: ${homeLabel} vs ${visitorLabel} on ${game.date}`);

    // Fetch game analysis and odds concurrently
    const [analysis, oddsData] = await Promise.all([
        buildGameAnalysis(game),
        getCachedOdds(),
    ]);

    const gameContext = formatGameAnalysis(analysis);
    const gameOdds = oddsData.data
        .filter((odd: any) => odd.game_id === game.id && odd.vendor === 'polymarket')
        .map(convertOddsToShares);
    const oddsBlock = gameOdds.length > 0 ? JSON.stringify(gameOdds, null, 2) : '(No Polymarket odds posted yet for this game)';

    const prompt = `You are an expert NBA same-game parlay (SGP) analyst. Your goal is to identify correlated, high-value legs for a same-game parlay on the following matchup.

A same-game parlay combines multiple bets from a single game. Strong legs are positively correlated — for example, a pace-up game boosts both a team moneyline and the over, while a defensive slug favors the under and a short spread.
DO NOT BUILD A PARLAY WITH INCOMPATIBLE LEGS SUCH AS A MONELYING AND A SPREAD FOR THE SAME TEAM.

===== GAME CONTEXT =====
${gameContext}

===== POLYMARKET ODDS FOR THIS GAME =====
All bets must use the lines below — these are the only odds available on the platform.
Odds fields are expressed as Polymarket share prices (implied probability, 0–1 scale). A share costs that amount and pays $1.00 if correct. Lower price = longer odds; higher = shorter. E.g. 0.52 means the market implies a 52% chance.
Schema: id, game_id, spread_home_value, spread_home_odds, spread_away_value, spread_away_odds, moneyline_home_odds, moneyline_away_odds, total_value, total_over_odds, total_under_odds
${oddsBlock}

===== OUTPUT FORMAT =====
Respond with ONLY a valid JSON object. No markdown, no explanation outside the JSON. Use this exact structure:
{
    "game": "The full matchup label, e.g. Detroit Pistons vs Oklahoma City Thunder",
    "date": "Game date in YYYY-MM-DD format",
    "confidence": "Your overall SGP confidence rating — one of: Low, Medium, High",
    "summary": "One sentence describing the core thesis for this parlay",
    "key_factors": ["Array of the most important injury, lineup, or matchup factors driving your recommendation"],
    "legs": [
        {
            "type": "Bet type — one of: moneyline, spread, total, player_prop",
            "bet": "Human-readable bet description using the Polymarket line, e.g. Over 224.5 or Detroit Pistons +5.5",
            "shares": "The Polymarket share price for this leg as a decimal, e.g. 0.52 (taken directly from the odds data above)",
            "rationale": "Why this leg fits the parlay and how it correlates with the other legs"
        }
    ]
}`;

    console.log("Sending same-game parlay request to AI...");
    return aiCall(prompt);
}

// ── CLI entry point ────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
    const teamA = "Thunder";
    const teamB = "Pistons";

    sameGameParlayAdvice(teamA, teamB).then(result => {
        console.log("\n=== Same-Game Parlay Advice ===\n");
        console.log(result);
    }).catch(err => {
        console.error("Error:", err);
        process.exit(1);
    });
}
