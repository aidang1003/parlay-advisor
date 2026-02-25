/**
 * packages/services/src/premium/components/
 *
 * Each component is a thin wrapper around the existing functions
 * Copy these patterns into their own files
 */

// ─── components/game-finder.ts ───
export async function findGameByTeams(teamA: string, teamB: string) {
  // Option 1: Import from existing module (if available)
  // const { getCachedUpcomingGames } = await import('@advisor/get-games.js');

  // Option 2: Copy the function here
  // (See same-game-parlay-advisor.ts for implementation)

  // For now, placeholder that would be filled in
  throw new Error('Not implemented - choose integration strategy');
}

// ─── components/odds-fetcher.ts ───
export async function getGameOdds(gameId: number) {
  // Option 1: Import
  // const { getCachedOdds } = await import('@advisor/get-odds.js');

  // Option 2: Copy convertOddsToShares + filtering logic here
  throw new Error('Not implemented');
}

// ─── components/game-analyzer.ts ───
export async function analyzeGame(game: any) {
  // Option 1: Import
  // const { buildGameAnalysis, formatGameAnalysis } = await import('@advisor/optimize-game-structure.js');

  // Option 2: Copy those functions here
  throw new Error('Not implemented');
}

// ─── components/ai-advisor.ts ───
export async function getParlaySuggestion(gameContext: string, odds: any[]) {
  // Option 1: Import
  // const { aiCall } = await import('@advisor/Open-0g-Ai-Call.js');

  // Option 2: Copy aiCall implementation here

  const oddsBlock = odds.length > 0 ? JSON.stringify(odds) : '(No odds)';

  const prompt = `You are an expert NBA same-game parlay analyst...

===== GAME CONTEXT =====
${gameContext}

===== POLYMARKET ODDS =====
${oddsBlock}

Respond with ONLY valid JSON (no markdown). Use this exact structure:
{
  "game": "...",
  "date": "...",
  "confidence": "Low|Medium|High",
  "summary": "...",
  "key_factors": [...],
  "legs": [
    {
      "type": "moneyline|spread|total|player_prop",
      "bet": "...",
      "shares": 0.52,
      "rationale": "..."
    }
  ]
}`;

  throw new Error('Not implemented - needs aiCall()');
}

// ─── components/nba-sgp.ts ───
export async function sameGameParlayAdvice(teamA: string, teamB: string): Promise<string> {
  const game = await findGameByTeams(teamA, teamB);

  if (!game) {
    return `No upcoming game found between "${teamA}" and "${teamB}".`;
  }

  const [gameContext, odds] = await Promise.all([
    analyzeGame(game),
    getGameOdds(game.id),
  ]);

  const recommendation = await getParlaySuggestion(gameContext, odds);
  return recommendation;
}
