/**
 * NBA Same-Game Parlay Advisor
 * Main entry point
 */

import * as dotenv from 'dotenv';
dotenv.config();

export { sameGameParlayAdvice } from './components/same-game-parlay-advisor.js';
export { buildGameAnalysis, formatGameAnalysis } from './components/optimize-game-structure.js';
export { getCachedOdds, formatOdds } from './components/get-odds.js';
export { getCachedUpcomingGames, formatGames } from './components/get-games.js';
export { aiCall } from './components/Open-0g-Ai-Call.js';

// Main CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const { sameGameParlayAdvice } = await import('./components/same-game-parlay-advisor.js');

    const teamA = 'Thunder';
    const teamB = 'Pistons';

    try {
      console.log(`\n🏀 NBA Same-Game Parlay Advisor\n`);
      console.log(`Analyzing: ${teamA} vs ${teamB}\n`);

      const result = await sameGameParlayAdvice(teamA, teamB);

      if (result.includes('No upcoming')) {
        console.log(`❌ ${result}`);
      } else {
        console.log(`✅ Recommendation:\n`);
        console.log(result);
      }
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  })();
}
