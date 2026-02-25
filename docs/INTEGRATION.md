# Integration Guide

## Folder Structure

**This repo (polymarket-advisor):**
```
├── index.ts                          # Express server + frontend
├── package.json
├── tsconfig.json
├── .env
├── README.md
├── components/
│   ├── same-game-parlay-advisor.ts   # Main orchestrator
│   ├── optimize-game-structure.ts    # Game analysis builder
│   ├── Open-0g-Ai-Call.ts           # 0G AI inference
│   ├── get-games.ts                 # Upcoming/live games
│   ├── get-odds.ts                  # Game odds
│   ├── get-players.ts
│   ├── get-lineups.ts
│   ├── get-player-injuries.ts
│   ├── get-player-props.ts
│   ├── get-season-averages.ts
│   ├── get-team-season-averages.ts
│   └── list-teams.ts
├── cache/                           # Auto-generated JSON caches
├── tests/
│   ├── run-tests.ts
│   └── sample.json
└── docs/

**Integration target (ParlayCity services):**
```
packages/services/src/premium/
├── index.ts                         # Copy from polymarket-advisor/index.ts
└── components/
    ├── same-game-parlay-advisor.ts  # Copy from polymarket-advisor/components/
    ├── optimize-game-structure.ts
    ├── Open-0g-Ai-Call.ts
    ├── get-games.ts
    ├── get-odds.ts
    ├── (and all other components)
```

## Setup Steps

### 1. Create Folders
```bash
mkdir -p packages/services/src/premium/components
mkdir -p packages/services/src/premium/cache
```

### 2. Copy Files

```bash
cp polymarket-advisor/index.ts packages/services/src/premium/
cp -r polymarket-advisor/components/* packages/services/src/premium/components/
```

### 3. Add Environment Variables

```bash
BALLDONTLIE_API_KEY=your_key
PRIVATE_KEY=your_0g_key
NETWORK=mainnet
MAINNET_NETWORK_RPC=https://evmrpc-testnet.0g.ai
MAINNET_MODEL=gpt-oss-120b
```

### 4. Update .gitignore

```
packages/services/src/premium/cache/
.bdl-*.json
```

## Test

```bash
curl -X POST http://localhost:3000/api/sgp \
  -H "Content-Type: application/json" \
  -d '{"teamA":"Thunder","teamB":"Pistons"}'
```
