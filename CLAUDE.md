# APEX Advisory Dashboard

APEX (Advisory Portfolio EXpert) — a Pi-backed stock advisory dashboard that scores ~490 stocks with data-driven conviction ratings, monitors holdings for structure breakdowns, and sends phone notifications via ntfy.sh. Evolved from an autonomous AI trading system; the analytical engine was preserved while autonomous execution was replaced with manual trade entry and human decision-making.

## Architecture

```
Raspberry Pi 5 (always-on)
├── Node.js server (Express)
│   ├── core/           — analytical engine (extracted from legacy trader.js)
│   ├── server/         — REST API, SQLite, scheduler, ntfy.sh, Claude proxy
│   ├── public/         — dashboard (index.html built from src/)
│   └── data/apex.db    — SQLite (single source of truth)
├── .env               — API keys (Polygon, Anthropic, ntfy topic)
├── Cloudflare Tunnel  — remote access (apex.yourdomain.com)
├── Cloudflare Access  — email-based auth gate
├── pm2                — process management (auto-restart on reboot)
└── Local backup       — daily SQLite backup (rotated on-disk)
```

```
Browser (any device, via Cloudflare Tunnel + Access)
├── Fetches pre-computed scan results from Pi REST API
├── Manual trade entry → POST /api/trades
├── Alerts, learning insights, watchlist from Pi API
├── Charts (Chart.js), Chat (Pi proxies → Anthropic API)
└── Pi required — no offline fallback
```

**No Cloudflare Worker.** Pi handles everything: Claude API proxy (key in .env), VIX (direct Yahoo fetch), market data (Polygon), notifications (ntfy.sh).

## Project Structure

```
core/
  screener.js       — screenStocks(), ~490 stocks across 12 sectors
  scoring.js        — calculateCompositeScore(), deriveConvictionRating()
  structure.js      — detectStructure() (ICT/SMC), checkStructureBreakdowns()
  indicators.js     — RSI, MACD, SMA, momentum, RS, volume ratio
  sectors.js        — detectSectorRotation(), sector mappings
  data.js           — Polygon API fetches + request throttle (20 concurrent max)
  learning.js       — formatPerformanceInsights(), deriveTradingRules()
  calibration.js    — runCalibrationSweep()

server/
  index.js          — Express entry point
  api.js            — REST endpoints
  db.js             — SQLite schema + queries
  scheduler.js      — node-cron (market open 9:35, midday 12:30, close 4:05 ET)
  notify.js         — ntfy.sh integration
  migrate.js        — import legacy Apex_Portfolio.json → SQLite
  config.js         — .env loading, schedule config

src/
  trader.js         — UI-only: rendering, API calls to Pi, Chart.js, modals
  body.html         — HTML structure
  styles.css        — Styling (dark theme, responsive)
  template.html     — HTML skeleton with placeholders

scripts/
  backup.sh         — Daily SQLite → local backup (rotated on-disk)

public/
  index.html        — Built output (DO NOT EDIT DIRECTLY)

data/
  apex.db           — SQLite database
```

**Build:** Edit `src/` and `core/` files, then run `build.sh`. Concatenates core/ (in dependency order) + src/ → `public/index.html`.

**Core module dependency order:** `data.js` → `indicators.js` → `screener.js` → `sectors.js` → `scoring.js` → `structure.js` → `learning.js` → `calibration.js`

## Core Data Flow

1. **Screen** ~490 stocks across 12 sectors (`core/screener.js`)
2. **Fetch** prices, ~65-day OHLCV bars, ticker details, short interest, VIX, news — via Polygon API with throttled concurrency
3. **Analyze** client-side: market structure (ICT/SMC), momentum, relative strength, sector rotation, RSI, MACD, SMA crossovers (`core/indicators.js`, `core/structure.js`, `core/sectors.js`)
4. **Score** all ~490 stocks via `calculateCompositeScore` — ~20 weighted components. Weights in `DEFAULT_WEIGHTS`, regime-aware (VIX < 20 vs ≥ 20), calibratable via `runCalibrationSweep`
5. **Derive conviction** 1-10 ratings via `deriveConvictionRating` — hybrid percentile ranking + absolute score floor (prevents "best of bad bunch" inflation in bear markets)
6. **Store** full scan results in SQLite (`scans` + `scan_candidates` tables)
7. **Check** holdings + watchlist for structure breakdowns → generate alerts → push via ntfy.sh
8. **Serve** results to dashboard via REST API

## Scheduled Scans (Pi cron)

- **9:35 AM ET** — Full 490-stock scan. Score all, detect structure, check watchlist thresholds.
- **11:00 AM ET** — Holdings-only scan (~5-12 stocks + watchlist). Structure breakdown check.
- **12:30 PM ET** — Full 490-stock scan. Mid-session scoring update.
- **3:00 PM ET** — Holdings-only scan. Late-session structure check before close.
- **4:05 PM ET** — Full scan. Performance history snapshot. Post-exit tracking updates.
- **Weekday-only.** Configurable via `PUT /api/portfolio` settings.
- **Manual trigger:** "Scan Market" button on dashboard → `POST /api/scans/trigger` (full scan on demand).
- **Failure handling:** 3 retries with exponential backoff. Error notification via ntfy. Never overwrites last good scan.

## REST API

```
GET    /api/portfolio              — portfolio state (cash, holdings, stats)
PUT    /api/portfolio              — update settings
POST   /api/trades                 — record manual trade (buy/sell)
GET    /api/trades                 — transaction history (paginated)
GET    /api/scans/latest           — latest full scan results
GET    /api/scans/:id              — specific historical scan
GET    /api/scans                  — scan history list
POST   /api/scans/trigger          — trigger manual scan from dashboard
GET    /api/alerts                 — active structure alerts
PUT    /api/alerts/:id/dismiss     — dismiss an alert
GET    /api/watchlist              — watchlist with thresholds
POST   /api/watchlist              — add to watchlist
DELETE /api/watchlist/:symbol      — remove from watchlist
PUT    /api/watchlist/:symbol      — update threshold
GET    /api/learning               — learning insights (trading patterns)
GET    /api/performance            — performance history for charts
POST   /api/calibrate              — trigger calibration sweep
GET    /api/health                 — server status, last scan time, uptime
GET    /api/stock/:symbol/history  — conviction history across scans
POST   /api/chat                   — proxy to Anthropic API (streaming)
```

## Auto-Generated Sell Targets

When a BUY trade is recorded, `deriveSellTargets(symbol, entryPrice, scanData)` auto-generates targets from existing scan data (no AI cost):

- **Stop Loss:** Nearest swing low below entry price (from `detectStructure()` swing analysis)
- **Target 1:** Nearest swing high above entry price (first resistance level)
- **Target 2:** Next swing high above Target 1 (extended target)
- **Risk/Reward Ratio:** Calculated from stop loss distance vs Target 1 distance
- **Dynamic Support:** SMA20 and SMA50 levels as trailing support reference
- **FVG Zones:** Fair value gaps near price as potential reversal zones

Targets stored in `holdings.thesis.targets` and **update on each subsequent scan** — if structure shifts, targets shift. Structure breakdown alerts fire when price approaches or breaches stop loss levels. Dashboard displays targets alongside each holding with visual price-level markers.

Source data: `core/structure.js` (swing highs/lows, FVGs), `core/indicators.js` (SMA20, SMA50), latest scan's `structure_detail` JSON.

## Structure Breakdown Alerts

`checkStructureBreakdowns()` runs after each scan on holdings + watchlist:
- **Critical:** Bearish CHoCH (structure reversal)
- **High:** Bearish BOS (broke below swing low), high-swept liquidity
- **Medium:** Structure score degraded from entry, RSI > 70 + bearish MACD crossover
- **Low:** Sector showing outflow

Dedup: same symbol+type not re-alerted within 24 hours. Alerts stored in SQLite, pushed via ntfy.sh (critical/high = urgent priority).

## Conviction Rating System

Composite score normalized to 1-10 via `deriveConvictionRating()`:
- Percentile ranking across full ~490-stock universe
- Absolute score floor prevents inflated ratings in weak markets
- No AI cost — purely data-driven from ~20 weighted scoring components
- Calibration engine optimizes weights via backtesting (`runCalibrationSweep`)

## Key Subsystems (preserved from legacy)

**Composite Scoring** (`core/scoring.js`): ~20 weighted components — momentum, RS, ICT structure, RSI, MACD, SMA crossover, sector rotation, volume, FVG, pullback/extension. `DEFAULT_WEIGHTS` + regime-aware overrides.

**Market Structure** (`core/structure.js`): ICT/SMC analysis — swing highs/lows, CHoCH, BOS, liquidity sweeps, FVGs on ~65-day bars.

**Calibration Engine** (`core/calibration.js`): Sweeps 40 historical dates, correlates scoring components with forward returns, derives calibrated weights with shrinkage. Regime-segmented. Out-of-sample validated.

**Learning System** (`core/learning.js`): Analyzes closed trades for conviction accuracy, signal accuracy, exit timing, regime performance. Insights displayed on dashboard (not fed to AI). Derived trading rules surface as advisory warnings on scorecard.

## Dashboard Features

- **Candidate Scorecard:** Full ~490-stock universe, paginated (50/page), sortable, filterable by sector/conviction/watchlist. Expanded rows show score breakdown, news headlines (Polygon), structure analysis.
- **Manual Trade Entry:** Modal form (symbol, action, shares, price, date, conviction, notes). Auto-fills price from latest scan. BUY trades auto-generate sell targets (stop loss, T1, T2, R:R ratio) from structure data.
- **Structure Alerts:** Severity-coded (critical/high/medium/low), dismissable, badge count in sidebar.
- **Watchlist:** Per-symbol conviction threshold alerts. Included in midday scans.
- **Conviction Evolution:** Sparkline showing how a stock's conviction changed over recent scans.
- **Learning Insights:** Win/loss by conviction, signal accuracy, exit quality, regime performance.
- **Performance Charts:** Portfolio value over time, sector allocation.
- **Chat:** Ad-hoc AI queries proxied through Pi → Anthropic API.

## Data Retention

- `scan_candidates`: 90 days (auto-cleanup weekly)
- `scans` table: indefinite (lightweight)
- SQLite backup: daily to local disk, last 30 copies

## Security

- API keys in `.env` only (Polygon, Anthropic, ntfy topic) — never committed
- `.env` must be in `.gitignore`
- Cloudflare Access gates all tunnel traffic (email-based auth)
- No secrets in client-side code

## Development Notes

- **Core modules** are pure functions — no DOM, no `window`, no `localStorage`. Must work in both Node.js and browser (via build concatenation).
- Edit `src/` and `core/`, rebuild with `build.sh`. **Never edit `public/index.html` directly.**
- Pi server: `pm2 start server/index.js --name apex`
- `let`/`const` throughout, `async/await` throughout
- Request throttle in `core/data.js`: max 20 concurrent Polygon API calls

## Legacy Context

This project evolved from APEX (Autonomous Portfolio EXpert), a browser-only AI paper trading system. The autonomous two-phase Claude trading loop was removed due to poor performance (29% win rate, -3.4% return). The analytical engine (scoring, structure detection, calibration, learning) was preserved and is now the backbone of the advisory dashboard. Historical trade data was migrated from localStorage/Google Drive JSON into SQLite for continued learning analysis.

Plan file with full implementation details: `prancy-noodling-yeti.md`
