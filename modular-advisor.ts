import { formatOdds } from "./game-odds.js";
import { formatGames } from "./get-games.js";
import { aiCall } from "./Open-0g-Ai-Call.js";

async function main() {
    const oddsBlock = await formatOdds();
    const gamesBlock = await formatGames();
    const prompt = `You are an NBA betting advisor. Analyze the following upcoming game odds and provide betting recommendations. Consider spreads, moneylines, and totals across different sportsbooks to identify value.
    You will be given an odds object like this - here is how this data is structured:
    {
        "id": "The unique identifier for this odds entry",
        "game_id": "The unique identifier for the game. Associates this odds data with a specific game found in the gamesBlock.",
        "vendor": "The sportsbook or platform providing these odds",
        "spread_home_value": "The point spread for the home team",
        "spread_home_odds": "The odds for the home team spread",
        "spread_away_value": "The point spread for the away team",
        "spread_away_odds": "The odds for the away team spread",
        "moneyline_home_odds": "The odds for the home team moneyline",
        "moneyline_away_odds": "The odds for the away team moneyline",
        "total_value": "The total points line for the game",
        "total_over_odds": "The odds for the over on the total points line",
        "total_under_odds": "The odds for the under on the total points line",
        "updated_at": "The timestamp when these odds were last updated"
    }
    \n\n
    ***ODDS DATA:***
    ${oddsBlock}
    
    ***GAMES DATA:***
    Build the odds data into a human-readable format and analyze it to provide betting recommendations.
    ${gamesBlock}
    `;
    // console.log("Prompt for AI:");
    // console.log(prompt);
    console.log("Sending odds to AI for analysis...");
    const response = await aiCall(prompt);
    console.log("\nAI Betting Analysis:\n");
    console.log(response);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
