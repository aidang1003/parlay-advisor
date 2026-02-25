/**
 * NBA Same-Game Parlay Advisor
 * Express server + exports
 */

import * as dotenv from 'dotenv';
import Express from 'express';
dotenv.config();

export { sameGameParlayAdvice } from './components/same-game-parlay-advisor.js';
export { buildGameAnalysis, formatGameAnalysis } from './components/optimize-game-structure.js';
export { getCachedOdds, formatOdds } from './components/get-odds.js';
export { getCachedUpcomingGames, formatGames } from './components/get-games.js';
export { aiCall } from './components/Open-0g-Ai-Call.js';

// Server entry
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const { sameGameParlayAdvice } = await import('./components/same-game-parlay-advisor.js');
    const { getCachedUpcomingGames } = await import('./components/get-games.js');

    const app = Express();
    const PORT = 3000;

    app.use(Express.json());
    app.use(Express.static('public'));

    // Frontend HTML
    app.get('/', (_req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>NBA SGP Advisor</title>
          <style>
            :root {
              --bg: #080812;
              --card: #110f15;
              --card-85: rgba(17,15,21,.85);
              --border: #27232f;
              --muted: #1f1c26;
              --muted-fg: #7b738c;
              --pink: #ff1a8c;
              --pink-glow: #ff55b8;
              --purple: #9200e1;
              --purple-1: #b75fff;
              --purple-2: #cb8aff;
              --gold: #ffb800;
              --green: #22c55e;
              --red: #ef4444;
            }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
              background: var(--bg);
              color: #e5e5e5;
              min-height: 100vh;
              -webkit-font-smoothing: antialiased;
            }
            .bg-glow {
              position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0;
            }
            .bg-glow .g1 {
              position: absolute; left: -200px; top: -200px;
              width: 700px; height: 700px; border-radius: 50%;
              background: var(--pink); opacity: 0.07; filter: blur(150px);
            }
            .bg-glow .g2 {
              position: absolute; right: -150px; top: 100px;
              width: 600px; height: 600px; border-radius: 50%;
              background: var(--purple); opacity: 0.06; filter: blur(130px);
            }
            .bg-glow .g3 {
              position: absolute; left: 100px; bottom: -100px;
              width: 500px; height: 500px; border-radius: 50%;
              background: var(--purple-1); opacity: 0.04; filter: blur(150px);
            }
            .container {
              position: relative; z-index: 10;
              max-width: 800px; margin: 0 auto; padding: 48px 24px;
            }
            h1 {
              font-size: 2.5rem; font-weight: 900; letter-spacing: -0.025em; text-align: center;
            }
            .gradient-text {
              background-image: linear-gradient(135deg, var(--pink), var(--purple-1));
              -webkit-background-clip: text; background-clip: text;
              -webkit-text-fill-color: transparent;
            }
            .subtitle {
              text-align: center; color: var(--muted-fg); font-size: 0.875rem; margin-top: 8px;
            }
            .glass-card {
              background: var(--card-85);
              border: 1px solid var(--border);
              border-radius: 1rem;
              backdrop-filter: blur(20px);
              padding: 24px;
              margin-top: 32px;
            }
            .input-group { display: flex; gap: 12px; margin-bottom: 16px; }
            .input-group input {
              flex: 1; padding: 12px 16px;
              background: var(--muted); border: 1px solid var(--border);
              border-radius: 0.5rem; color: #e5e5e5; font-size: 0.95rem;
              outline: none; transition: border-color 0.2s;
            }
            .input-group input::placeholder { color: var(--muted-fg); }
            .input-group input:focus { border-color: var(--purple-1); }
            .btn-primary {
              width: 100%; padding: 12px 24px;
              background: linear-gradient(135deg, var(--pink), var(--purple));
              color: white; border: none; border-radius: 0.5rem;
              font-size: 1rem; font-weight: 600; cursor: pointer;
              transition: box-shadow 0.2s, transform 0.1s;
            }
            .btn-primary:hover {
              box-shadow: 0 0 20px rgba(255,26,140,0.3);
              transform: translateY(-1px);
            }
            .btn-primary:active { transform: translateY(0); }
            .result {
              margin-top: 24px; padding: 20px;
              background: var(--muted); border: 1px solid var(--border);
              border-radius: 0.75rem;
            }
            .result h2 { color: var(--purple-2); font-size: 1.25rem; margin-bottom: 12px; }
            .result strong { color: var(--purple-1); }
            .result ul { padding-left: 20px; margin: 8px 0; }
            .result li { margin: 4px 0; color: #d1d1d1; }
            .error { color: var(--red); }
            .loading { color: var(--gold); }
            .games-section {
              margin-top: 32px;
            }
            .games-section h2 {
              font-size: 1.25rem; font-weight: 700; margin-bottom: 16px; color: #e5e5e5;
            }
            .game-card {
              padding: 14px 18px; margin: 8px 0;
              background: var(--card-85);
              border: 1px solid var(--border);
              border-radius: 0.75rem;
              cursor: pointer;
              transition: border-color 0.2s, box-shadow 0.2s, transform 0.1s;
              backdrop-filter: blur(20px);
            }
            .game-card:hover {
              border-color: var(--pink);
              box-shadow: 0 0 12px rgba(255,26,140,0.15);
              transform: translateY(-1px);
            }
            .game-card strong { color: #f0f0f0; }
            .game-card.live {
              border-color: var(--green);
              box-shadow: 0 0 10px rgba(34,197,94,0.15);
            }
            .game-card.live:hover {
              border-color: var(--green);
              box-shadow: 0 0 18px rgba(34,197,94,0.3);
            }
            .game-header { display: flex; align-items: center; justify-content: space-between; }
            .live-badge {
              display: flex; align-items: center; gap: 5px;
              font-size: 0.75rem; font-weight: 700; color: var(--green);
              text-transform: uppercase; letter-spacing: 0.05em;
            }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
            .live-dot {
              width: 7px; height: 7px; border-radius: 50%;
              background: var(--red); animation: pulse 1.2s ease-in-out infinite;
            }
            .game-time { color: var(--muted-fg); font-size: 0.85rem; margin-top: 4px; }
            @keyframes flashHighlight {
              0% { border-color: var(--pink); box-shadow: 0 0 12px rgba(255,26,140,0.4); }
              50% { border-color: var(--purple-1); box-shadow: 0 0 8px rgba(183,95,255,0.3); }
              100% { border-color: var(--border); box-shadow: none; }
            }
            .highlight-flash { animation: flashHighlight 0.6s ease-in-out; }
          </style>
        </head>
        <body>
          <div class="bg-glow">
            <div class="g1"></div>
            <div class="g2"></div>
            <div class="g3"></div>
          </div>
          <div class="container">
            <h1><span class="gradient-text">NBA Same-Game Parlay Advisor</span></h1>
            <p class="subtitle">AI-powered parlay recommendations with live odds</p>

            <div class="glass-card">
              <div class="input-group">
                <input type="text" id="teamA" placeholder="Team A (e.g., Thunder)" value="Thunder" />
                <input type="text" id="teamB" placeholder="Team B (e.g., Pistons)" value="Pistons" />
              </div>
              <button class="btn-primary" onclick="getRecommendation()">Get Recommendation</button>
              <div id="result" class="result" style="display:none;"></div>
            </div>

            <div class="games-section">
              <h2>Upcoming Games</h2>
              <div id="gamesList"></div>
            </div>
          </div>

          <script>
            async function loadGames() {
              try {
                const response = await fetch('/api/games');
                const data = await response.json();
                const gamesList = document.getElementById('gamesList');

                if (!data.games || data.games.length === 0) {
                  gamesList.innerHTML = '<p style="color:var(--muted-fg)">No upcoming games available</p>';
                  return;
                }

                gamesList.innerHTML = data.games.map(game => \`
                  <div class="game-card\${game.is_live ? ' live' : ''}" onclick="selectGame('\${game.home_team}', '\${game.away_team}')">
                    <div class="game-header">
                      <strong>\${game.away_team} @ \${game.home_team}</strong>
                      \${game.is_live ? '<span class="live-badge"><span class="live-dot"></span>Live</span>' : ''}
                    </div>
                    <div class="game-time">\${game.game_date}</div>
                  </div>
                \`).join('');
              } catch (error) {
                document.getElementById('gamesList').innerHTML = \`<p class="error">Error loading games: \${error.message}</p>\`;
              }
            }

            function selectGame(awayTeam, homeTeam) {
              const teamAInput = document.getElementById('teamA');
              const teamBInput = document.getElementById('teamB');

              teamAInput.value = awayTeam;
              teamBInput.value = homeTeam;

              window.scrollTo({ top: 0, behavior: 'smooth' });

              teamAInput.classList.remove('highlight-flash');
              teamBInput.classList.remove('highlight-flash');
              void teamAInput.offsetWidth;
              teamAInput.classList.add('highlight-flash');
              teamBInput.classList.add('highlight-flash');

              setTimeout(() => {
                teamAInput.classList.remove('highlight-flash');
                teamBInput.classList.remove('highlight-flash');
              }, 600);
            }

            async function getRecommendation() {
              const teamA = document.getElementById('teamA').value;
              const teamB = document.getElementById('teamB').value;
              const resultDiv = document.getElementById('result');

              if (!teamA || !teamB) {
                resultDiv.innerHTML = '<p class="error">Please enter both team names</p>';
                resultDiv.style.display = 'block';
                return;
              }

              resultDiv.innerHTML = '<p class="loading">Analyzing matchup...</p>';
              resultDiv.style.display = 'block';

              try {
                const response = await fetch('/api/sgp', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ teamA, teamB })
                });

                const data = await response.json();

                if (!response.ok) {
                  resultDiv.innerHTML = \`<p class="error">\${data.error}</p>\`;
                  return;
                }

                const rec = data.recommendation;
                resultDiv.innerHTML = \`
                  <h2>\${rec.game}</h2>
                  <p><strong>Date:</strong> \${rec.date}</p>
                  <p><strong>Confidence:</strong> \${rec.confidence}</p>
                  <p><strong>Summary:</strong> \${rec.summary}</p>
                  <p><strong>Key Factors:</strong></p>
                  <ul>\${rec.key_factors.map(f => \`<li>\${f}</li>\`).join('')}</ul>
                  <p><strong>Recommended Legs:</strong></p>
                  <ul>\${rec.legs.map(leg => \`<li><strong>\${leg.bet}</strong> (\${leg.type}) @ \${leg.shares} - \${leg.rationale}</li>\`).join('')}</ul>
                \`;
              } catch (error) {
                resultDiv.innerHTML = \`<p class="error">Error: \${error.message}</p>\`;
              }
            }

            document.addEventListener('DOMContentLoaded', loadGames);
          </script>
        </body>
        </html>
      `);
    });

    // Games list endpoint
    app.get('/api/games', async (_req, res) => {
      try {
        const games = await getCachedUpcomingGames();
        const formattedGames = games.map((game: any) => {
          // Always show the scheduled start time from datetime (UTC)
          const startTime = new Date(game.datetime).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          });
          // For live games, also show current quarter + clock from game.time
          const liveLabel = game.period > 0 && game.time ? ` · ${game.time}` : '';
          const gameLabel = `${startTime}${liveLabel}`;
          return {
            home_team: game.home_team?.name || 'Unknown',
            away_team: game.visitor_team?.name || 'Unknown',
            game_date: gameLabel,
            is_live: game.period > 0,
          };
        });
        res.json({ games: formattedGames });
      } catch (error) {
        console.error('[games-api]', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Error fetching games'
        });
      }
    });

    // SGP recommendation endpoint
    app.post('/api/sgp', async (req, res) => {
      const { teamA, teamB } = req.body;

      if (!teamA || !teamB) {
        return res.status(400).json({ error: 'Missing teamA or teamB' });
      }

      try {
        const result = await sameGameParlayAdvice(teamA, teamB);

        if (result.includes('No upcoming')) {
          return res.status(404).json({ error: result });
        }

        const recommendation = JSON.parse(result);
        res.json({ success: true, recommendation });
      } catch (error) {
        console.error('[sgp-api]', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    app.listen(PORT, () => {
      console.log(`\n🏀 NBA SGP Advisor running at http://localhost:${PORT}\n`);
    });
  })();
}
