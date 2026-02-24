# NBA Module Testing Guide

## Overview

`tests/run-tests.ts` is a sequential smoke-test suite. Each test:

1. Calls the module's `getCached*` function (reads cache if fresh, fetches from API otherwise)
2. Takes the **first returned item**
3. Validates its shape against the **BDL SDK type** for that resource
4. Asserts the response is **non-empty** (or logs a warning for endpoints that may legitimately return zero results, e.g. injuries, lineups for upcoming games)

Results are written to `tests/sample.json` — one first-item per module.

---

## Running the Tests

```bash
npx tsx tests/run-tests.ts
```

Exit code `0` = all passed. Exit code `1` = one or more failures.

---

## Test Sequence

Tests run **sequentially** because later tests depend on `teamId`, `gameId`, and `playerIds` resolved from the games and players tests.

| # | Test function | Module | SDK/Local type | Required fields validated |
|---|--------------|--------|---------------|--------------------------|
| 1 | `testTeams` | `list-teams.ts` | `NBATeam` (SDK) | `id`, `conference`, `division`, `city`, `name`, `full_name`, `abbreviation` |
| 2 | `testGames` | `get-games.ts` | `NBAGame` (SDK) | `id`, `date`, `season`, `status`, `home_team`, `visitor_team`, `home_team_score`, `visitor_team_score` |
| 3 | `testOdds` | `get-odds.ts` | `NBAOdds` (SDK) | `id`, `game_id`, `vendor`, `moneyline_home_odds`, `moneyline_away_odds` |
| 4 | `testPlayers` | `get-players.ts` | `NBAPlayer` (SDK) | `id`, `first_name`, `last_name`, `position`, `team` |
| 5 | `testPlayerInjuries` | `get-player-injuries.ts` | `NBAPlayerInjury` (SDK) | `player`, `status` |
| 6 | `testSeasonAverages` | `get-season-averages.ts` | `NBASeasonAverage` (local) | `player`, `season`, `season_type`, `stats` |
| 7 | `testTeamSeasonAverages` | `get-team-season-averages.ts` | `NBATeamSeasonAverage` (local) | `team`, `season`, `season_type`, `stats` |
| 8 | `testLineups` | `get-lineups.ts` | `NBALineup` (local) | `id`, `game_id`, `starter`, `position`, `player`, `team` |
| 9 | `testPlayerProps` | `get-player-props.ts` | `NBAPlayerProp` (local) | `id`, `game_id`, `player_id`, `vendor`, `prop_type`, `line_value`, `market` |

---

## Output: `tests/sample.json`

After a run, `tests/sample.json` holds the first item from each module keyed by module name:

```json
{
  "list-teams":               { "id": 1, "full_name": "Atlanta Hawks", ... },
  "get-games":                { "id": 18447660, "date": "2026-02-25", ... },
  "get-odds":                 { "id": 155952008, "vendor": "polymarket", ... },
  "get-players":              { "id": 12345, "first_name": "...", ... },
  "get-player-injuries":      null,
  "get-season-averages":      { "player": { ... }, "stats": { ... }, ... },
  "get-team-season-averages": { "team": { ... }, "stats": { ... }, ... },
  "get-lineups":              null,
  "get-player-props":         { "id": ..., "prop_type": "points", ... }
}
```

A `null` value means zero records were returned for that module (not a failure).

---

## Notes on Empty Results

These modules may legitimately return zero items and will not fail the test:

- **`get-player-injuries`** — no injuries reported for a team
- **`get-lineups`** — lineups are only populated for completed games; upcoming games will return empty
- **`get-season-averages`** / **`get-team-season-averages`** — early in a season or no data for the given parameters
- **`get-player-props`** / **`get-odds`** — not yet posted for a future date

---

## Adding a New Module Test

1. Export `getCached{Resource}()` from the module (per MODULARNBA.md spec)
2. Add a `test{Resource}` function in `tests/run-tests.ts` following the existing pattern:
   - call `getCached{Resource}()`
   - check `length > 0` or handle empty
   - call `validateShape(first, ['field1', 'field2', ...], 'TypeName')`
   - return `pass(...)` or let the error bubble to `fail(...)`
3. Add it to the `suite` array in `runAll()`
4. Document the required fields in the table above
