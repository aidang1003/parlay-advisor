# Parlay & Betting Analysis Use Cases

This document tracks the intended use cases for the NBA betting advisor. Each use case describes the betting scenario, the data needed, and the functions/modules that support it.

---

## Use Case 1 — Single Game Analysis ✅ Implemented

**Scenario:** Analyze one upcoming game in depth to identify value on the moneyline, spread, total, or player props.

**Entry point:** `optimize-game-structure.ts`

**Data assembled per game:**

| Layer           | Source module                 | Data                                                                                 |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| Game schedule   | `get-games.ts`                | Date, teams, season, game ID                                                         |
| Roster          | `get-players.ts`              | Active players on each team                                                          |
| Injuries        | `get-player-injuries.ts`      | Status, return date, description per player                                          |
| Player averages | `get-season-averages.ts`      | pts, ast, reb, stl, blk, fg%, 3fg%, to                                               |
| Team averages   | `get-team-season-averages.ts` | Team-level pts, ast, reb, pace, opp_pts, fg%                                         |
| Lineups         | `get-lineups.ts`              | Starters + bench (populated once the game is live)                                   |
| Odds            | `get-odds.ts`                 | Moneyline, spread, total per vendor _(assembled separately in `modular-advisor.ts`)_ |

**Key functions:**

```ts
buildGameAnalysis(game: NBAGame): Promise<GameAnalysis>
formatGameAnalysis(analysis: GameAnalysis): string   // AI-ready text block
```

**Typical prompt flow:**

```
formatGameAnalysis(analysis) + formatOdds() → aiCall(prompt)
```

---

## Use Case 2 — Daily Slate Analysis 🔲 Planned

**Scenario:** Quickly assess all games on a given day to find the highest-value legs across the full slate for a same-game or cross-game parlay.

**Data needed:** All games for the day + per-game analysis from Use Case 1

**Key functions (planned):**

```ts
buildAllGameAnalyses(): Promise<GameAnalysis[]>   // already implemented
formatSlateAnalysis(analyses: GameAnalysis[]): string
```

**Notes:**

- Should surface cross-game correlation risks (e.g. two teams with poor defense both going over)
- Consider a token budget — summarize each game rather than full depth

---

## Use Case 3 — Player Prop Targeting 🔲 Planned

**Scenario:** Focus on a specific player (or set of players) to identify over/under value on points, rebounds, assists, etc.

**Data needed:**

- Player season averages (`get-season-averages.ts`)
- Player injury status (`get-player-injuries.ts`)
- Recent lineups to confirm starter status (`get-lineups.ts`)
- Player prop lines (`get-player-props.ts`)
- Opponent team defensive stats (`get-team-season-averages.ts` for the opposing team)

**Key functions (planned):**

```ts
buildPlayerPropContext(playerId: number, gameId: number): Promise<PlayerPropAnalysis>
formatPlayerPropContext(ctx: PlayerPropAnalysis): string
```

**Notes:**

- Only propose props for players confirmed in the starting lineup
- Surface opponent defensive weaknesses (e.g. "OKC gives up the 3rd-most assists allowed")

---

## Use Case 4 — Head-to-Head Matchup History 🔲 Planned

**Scenario:** Use historical games between two teams to spot trends (e.g. "these teams go over 60% of the time").

**Data needed:**

- Historical games between the two teams (`get-games.ts` filtered by team IDs)
- Historical box scores or team stats for context

**Key functions (planned):**

```ts
buildH2HAnalysis(homeTeamId: number, visitorTeamId: number, season: number): Promise<H2HAnalysis>
```

**Notes:**

- BDL `/v1/games` supports `team_ids[]` — filter both teams in one call, then match pairings
- Limit history lookback to current + 1 prior season to stay relevant

---

## Data Flow Diagram

```
getCachedUpcomingGames()
        │
        ▼
  for each NBAGame
        │
   ┌────┴─────────────────────────────────────┐
   │                                          │
   ▼  home_team                               ▼  visitor_team
getCachedPlayers(teamId)             getCachedPlayers(teamId)
        │                                     │
   ┌────┴──┬─────────┬──────────┐        (same)
   ▼       ▼         ▼          ▼
injuries  playerAvg  teamAvg  lineups
   │       │         │          │
   └───────┴─────────┴──────────┘
                │
         TeamAnalysis { team, roster, injuries,
                        playerAverages, teamAverages, lineups }
                │
         GameAnalysis { game, home, visitor }
                │
         formatGameAnalysis() ──► AI prompt
```
