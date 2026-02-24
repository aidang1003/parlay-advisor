# Modular NBA Data Architecture

Each module is a standalone TypeScript file that owns one BDL API resource: it fetches, caches, and exports clean typed data. Modules can be imported independently or composed in an orchestrator (e.g. `modular-advisor.ts`).

---

## Naming Rules (strict)

| Thing | Pattern | Example |
|-------|---------|---------|
| Source file | `get-{resource}.ts` · `list-{resource}.ts` | `get-odds.ts` |
| Cache file | `.bdl-{resource}.json` | `.bdl-odds.json` |
| Fetch function | `get{Resource}(params)` | `getOdds()` |
| Cache write | `update{Resource}Cache(...)` | `updateOddsCache(data)` |
| Cache read | `load{Resource}Cache(...)` | `loadOddsCache()` |
| Public export | `getCached{Resource}(params)` | `getCachedOdds()` |
| Format export | `format{Resource}()` | `formatOdds()` |

**Rules:**
- `{resource}` is the **plural noun** matching the BDL endpoint path segment (e.g. `/v1/players` → `players`, `/v2/odds` → `odds`).
- Source file name and cache file name must use the **same resource token** — no qualifiers like `upcoming-` or `game-`.
- `list-` prefix is reserved for static reference data (teams). All other modules use `get-`.
- Cache files live exclusively in `/cache/` and are dot-prefixed (`.bdl-*.json`) to mark them as generated.
- Internal functions (`get*`, `update*Cache`, `load*Cache`) are **not exported**. Only `getCached*` and `format*` are public.

---

## File Inventory

| Source file | BDL Endpoint | Cache file | TTL | SDK type | Cache key |
|-------------|-------------|------------|-----|----------|-----------|
| `list-teams.ts` | `GET /v1/teams` | `.bdl-teams.json` | 100 days | `NBATeam` | — (full list) |
| `get-games.ts` | `GET /v1/games` | `.bdl-games.json` | 1 hour | `NBAGame` | — (full list) |
| `get-odds.ts` | `GET /v2/odds` | `.bdl-odds.json` | 10 min | local | — (full list) |
| `get-players.ts` | `GET /v1/players/active` | `.bdl-players.json` | 24 hours | `NBAPlayer` | `teamId` |
| `get-season-averages.ts` | `GET /v1/season_averages/{category}` | `.bdl-season-averages.json` | 24 hours | `NBASeasonAverage` (local) | `teamId-season` |
| `get-team-season-averages.ts` | `GET /v1/team_season_averages/{category}` | `.bdl-team-season-averages.json` | 24 hours | `NBATeamSeasonAverage` (local) | `teamId-season` |
| `get-player-injuries.ts` | `GET /v1/player_injuries` | `.bdl-player-injuries.json` | 1 hour | `NBAPlayerInjury` | `teamId` |
| `get-lineups.ts` | `GET /v1/lineups` | `.bdl-lineups.json` | 24 hours | `NBALineup` (local) | `teamId-gameIds` |
| `get-player-props.ts` | `GET /v2/odds/player_props` | `.bdl-player-props.json` | 10 min | `NBAPlayerProp` (local) | `date` |

---

## Per-File Function Structure

Every module follows this layout in order:

```
1.  imports + dotenv.config()
2.  const api  (SDK)  or  const BDL_BASE_URL  (raw fetch)
3.  const CACHE_PATH
4.  const CACHE_TTL_MS          ← inline comment explaining the TTL choice
5.  local interface definitions  (only when SDK type does not cover the endpoint)
6.  async function get{Resource}(...)     ← raw API call, throws on error, NOT exported
7.  function update{Resource}Cache(...)   ← writes to CACHE_PATH, NOT exported
8.  function load{Resource}Cache(...)     ← returns data if fresh, null otherwise, NOT exported
9.  export async function getCached{Resource}(...)   ← public: orchestrates 6-8, logs source
10. export async function format{Resource}()         ← public: returns AI-ready string (where applicable)
11. if (import.meta.url === `file://${process.argv[1]}`) { ... }  ← CLI debug entry point
```

---

## Cache Structure

**Flat list** (teams, games, odds) — single object per file:
```json
{ "timestamp": 1234567890, "{resource}": [ ... ] }
```

**Keyed by parameter** (players, injuries, lineups, season averages, props) — record so multiple teams/dates share one file:
```json
{
  "14":       { "timestamp": 1234567890, "{resource}": [ ... ] },
  "22":       { "timestamp": 1234567890, "{resource}": [ ... ] }
}
```

Compound keys: `"{teamId}-{season}"` for averages · `"{teamId}-{gameId1},{gameId2}"` for lineups · `"{date}"` for props.

---

## SDK vs. Raw Fetch

SDK types (`NBATeam`, `NBAPlayer`, `NBAGame`, `NBAPlayerInjury`) are used wherever the endpoint is covered by `@balldontlie/sdk`. Raw `fetch` is used otherwise:

| Endpoint | Reason |
|----------|--------|
| `/v1/season_averages/{category}` | SDK's `getSeasonAverages()` only handles basic v1 (player_id + season); category/type variants require manual URL building |
| `/v1/team_season_averages/{category}` | Not in SDK |
| `/v1/lineups` | Not in SDK |
| `/v2/odds` | SDK's `getOdds()` targets v1; v2 adds per-vendor breakdowns |
| `/v2/odds/player_props` | Not in SDK |

---

## Exports Summary

| Module | Exported symbols |
|--------|----------------|
| `list-teams.ts` | _(none — add `getCachedTeams()` if team lookup by abbreviation is needed)_ |
| `get-games.ts` | `getCachedUpcomingGames()`, `formatGames()` |
| `get-odds.ts` | `formatOdds()` |
| `get-players.ts` | `getCachedPlayers(teamId)` |
| `get-season-averages.ts` | `getCachedSeasonAverages(teamId, playerIds, season)`, `NBASeasonAverage` |
| `get-team-season-averages.ts` | `getCachedTeamSeasonAverages(teamId, season)`, `NBATeamSeasonAverage` |
| `get-player-injuries.ts` | `getCachedPlayerInjuries(teamId)` |
| `get-lineups.ts` | `getCachedLineups(gameIds, teamId)`, `NBALineup` |
| `get-player-props.ts` | `getCachedPlayerProps(date)`, `NBAPlayerProp`, `NBAPlayerPropMarket` |
