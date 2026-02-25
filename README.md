# NBA Same-Game Parlay Advisor

AI-powered NBA parlay recommendations using BallDontLie data and 0G AI inference.

## Setup

### Install

```bash
pnpm install
```

### Environment

Create a `.env` file in the project root:

```
BALLDONTLIE_API_KEY=your_balldontlie_api_key
PRIVATE_KEY=your_0g_wallet_private_key
NETWORK=mainnet
MAINNET_NETWORK_RPC=https://evmrpc-testnet.0g.ai
MAINNET_MODEL=gpt-oss-120b
```

`BALLDONTLIE_API_KEY` is required for all game/player/odds data. The rest are only needed for AI recommendations via 0G.

## Run

Start the web server:

```bash
npx ts-node index.ts
```

Opens at `http://localhost:3000`. Select an upcoming game or enter two teams manually, then click **Get Recommendation**.

## Tests

Smoke tests validate every data-fetching component (teams, games, odds, players, injuries, season averages, lineups, props):

```bash
npx ts-node tests/run-tests.ts
```

Writes a `tests/sample.json` with one example response per module.

## Debug Individual Components

Each component in `components/` can be run standalone:

```bash
npx ts-node components/get-games.ts        # upcoming/live games
npx ts-node components/get-odds.ts         # game odds
npx ts-node components/list-teams.ts       # all NBA teams
npx ts-node components/get-players.ts      # players by team
npx ts-node components/get-lineups.ts      # game lineups
npx ts-node components/get-player-injuries.ts
npx ts-node components/get-season-averages.ts
npx ts-node components/get-team-season-averages.ts
npx ts-node components/get-player-props.ts
```

## Project Structure

```
├── index.ts                  # Express server + frontend
├── components/
│   ├── get-games.ts          # Games (cached, 10s TTL)
│   ├── get-odds.ts           # Odds with share price conversion
│   ├── get-players.ts        # Players by team
│   ├── get-lineups.ts        # Game lineups
│   ├── get-player-injuries.ts
│   ├── get-player-props.ts
│   ├── get-season-averages.ts
│   ├── get-team-season-averages.ts
│   ├── list-teams.ts
│   ├── optimize-game-structure.ts  # Builds AI-readable game analysis
│   ├── Open-0g-Ai-Call.ts         # 0G AI inference
│   ├── same-game-parlay-advisor.ts # Orchestrates the full SGP flow
│   ├── modular-advisor.ts
│   └── monolithic-call.ts
├── cache/                    # Auto-generated JSON cache files
├── tests/
│   ├── run-tests.ts          # Smoke test suite
│   └── sample.json           # Sample output from last test run
└── docs/                     # Integration docs for ParlayCity
```
