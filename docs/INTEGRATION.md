# Integration Guide

## Folder Structure

```
packages/services/src/premium/
├── index.ts                 (copy SIMPLE_INDEX.ts)
└── components/
    ├── nba-sgp.ts          (copy COMPONENT_PATTERNS.ts)
    ├── game-finder.ts
    ├── odds-fetcher.ts
    ├── game-analyzer.ts
    └── ai-advisor.ts
```

## Setup Steps

### 1. Create Folders
```bash
mkdir -p packages/services/src/premium/components
```

### 2. Add Environment Variables

Add to `.env` and `.env.example`:
```bash
BALLDONTLIE_API_KEY=your_key
PRIVATE_KEY=your_0g_key
NETWORK=mainnet
MAINNET_NETWORK_RPC=https://...
MAINNET_MODEL=claude-opus-4-6
```

### 3. Update .gitignore

Add to root `.gitignore`:
```
cache/
.bdl-*.json
```

### 4. Configure Module Imports

Add to `packages/services/tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@advisor/*": ["../../../polymarket-advisor/*"]
    }
  }
}
```

Now import from anywhere:
```typescript
import { getCachedUpcomingGames } from '@advisor/get-games.js';
import { getCachedOdds } from '@advisor/get-odds.js';
import { buildGameAnalysis, formatGameAnalysis } from '@advisor/optimize-game-structure.js';
import { aiCall } from '@advisor/Open-0g-Ai-Call.js';
```

**Alternative:** Copy functions directly into components if module imports don't work.

### 5. Create Express Router

Use the `index.ts` pattern from the repo root as reference. Create `packages/services/src/premium/index.ts`:
- Import `sameGameParlayAdvice` from components
- Export as Express router at `POST /nba-sgp`
- Handle request/response validation

See working example at `../../index.ts` for CLI pattern (adapt for Express).

### 6. Mount Router

In `packages/services/src/index.ts`:
```typescript
import nbaSgpRouter from './premium/index.js';

app.use(createX402Middleware());  // Payment middleware
app.use('/premium', nbaSgpRouter);  // POST /premium/nba-sgp
```

## Test

```bash
curl -X POST http://localhost:3001/premium/nba-sgp \
  -H "Content-Type: application/json" \
  -d '{"teamA":"Thunder","teamB":"Pistons"}'
```

Response:
```json
{
  "success": true,
  "recommendation": {
    "game": "Oklahoma City Thunder vs Detroit Pistons",
    "date": "2026-02-25",
    "confidence": "High",
    "summary": "...",
    "key_factors": [...],
    "legs": [...]
  }
}
```

## That's It

- 5 env vars (existing 0G setup)
- 1 folder
- 2 files to copy
- 1 tsconfig entry
- Done
