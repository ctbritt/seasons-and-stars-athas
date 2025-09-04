Seasons & Stars - Athas (Dark Sun Calendar Pack)
================================================

Dark Sun calendar pack for the Seasons & Stars module (Foundry VTT v13+). Provides the Calendar of Tyr with King’s Age utilities, named-year handling, moon phases, and minimal chat commands.

Features
--------

- Dark Sun calendar (Calendar of Tyr) with intercalary periods and two moons (Ral, Guthay)
- King’s Age utilities (single API):
  - `window.SSAthas.getYearInfo(year?)` → `{ year, kingsAge, yearInAge, yearName }`
- Minimal chat commands (via Chat Commander):
  - `/day` (alias `/ds-day`) — show current date, time, weekday, season, King’s Age, year name
  - `/season` — show current season
  - `/moons [YYYY-M-D]` — phases for Ral and Guthay (age, days until Full/New)
  - `/eclipse [next|previous]` — simple eclipse heuristic (both moons New on the same day)

Requirements
------------

- Foundry VTT v13+
- Seasons & Stars (`seasons-and-stars`) v0.7.0+

Installation
------------

1. Install and enable Seasons & Stars.
2. Copy this folder to your Foundry data directory:
   - `Data/modules/seasons-and-stars-athas`
3. Enable “Seasons & Stars - Athas” in your world.

Usage
-----

- API (console or macros):

```
// Current year
await window.SSAthas.getYearInfo();
// Specific year
await window.SSAthas.getYearInfo(14656);
```

- Chat (Chat Commander):
  - `/day`
  - `/season`
  - `/moons 14656-1-1`
  - `/eclipse next`

Notes
-----

- King’s Age math is a pure 77-year cycle:
  - `kingsAge = Math.floor((year - 1) / 77) + 1`
  - `yearInAge = ((year - 1) % 77) + 1`
- Named years are composed algorithmically ("Endlean's Seofean") when an explicit 77-name list is not present.
- Moon phases are computed from the active calendar’s `moons` config; eclipse detection is a simple heuristic for when both moons are New on the same day.

Development
-----------

- Code lives under `scripts/main.js`. Minimal changes; no dependencies on the old `dsr-calendar` module.
- PRs, bug reports, and improvements are welcome.

License
-------

MIT — see `LICENSE`.

