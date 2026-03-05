'use strict';

const cron = require('node-cron');
const db = require('./db');
const notify = require('./notify');
const config = require('./config');

const MAX_RETRIES = 3;
const BACKOFF_BASE = 1000; // 1s, 4s, 16s

// ── Alert deduplication: same symbol+type not re-alerted within 24h ──
function deduplicateAlert(database, symbol, type) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const existing = database.prepare(
        'SELECT id FROM alerts WHERE symbol = ? AND type = ? AND created_at > ? AND dismissed = 0'
    ).get(symbol, type, cutoff);
    return !existing;
}

// ── Full scan pipeline ──
async function runFullScan(database, opts) {
    const { fetchData, scoreAll, universe, notify: notifyFn } = opts;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // 1. Fetch all data
            const data = await fetchData();

            // 2. Score all stocks
            const result = scoreAll(data.marketData, data.barsMap, data.vix, data.shortInterest);
            const scored = result.scores;

            // 3. Store in database (include VIX + sector rotation as metadata)
            const metadata = {
                vix: result.vix || null,
                sectorRotation: result.sectorRotation || null
            };
            const scanId = db.insertScan(database, {
                type: 'full',
                stockCount: scored.length,
                duration: Date.now() - startTime,
                metadata
            });

            db.insertScanCandidates(database, scanId, scored);

            // 4. Check watchlist thresholds
            const watchlist = db.getWatchlist(database);
            for (const item of watchlist) {
                const candidate = scored.find(s => s.symbol === item.symbol);
                if (candidate && candidate.conviction >= item.threshold) {
                    if (deduplicateAlert(database, item.symbol, 'watchlist_threshold')) {
                        const alertId = db.insertAlert(database, {
                            symbol: item.symbol,
                            type: 'watchlist_threshold',
                            severity: 'medium',
                            message: `${item.symbol} hit conviction ${candidate.conviction} (threshold: ${item.threshold})`
                        });
                        if (notifyFn) await notifyFn('alert', {
                            symbol: item.symbol, type: 'watchlist_threshold',
                            severity: 'medium', message: `Conviction ${candidate.conviction} >= ${item.threshold}`
                        });
                    }
                }
            }

            // 5. Notify completion
            if (notifyFn) {
                await notifyFn('scan', {
                    type: 'full',
                    stockCount: scored.length,
                    durationMs: Date.now() - startTime,
                    topCandidates: scored.slice(0, 5)
                });
            }

            return { scanId, stockCount: scored.length };
        } catch (e) {
            console.error(`Full scan attempt ${attempt}/${MAX_RETRIES} failed:`, e.message);
            if (attempt < MAX_RETRIES) {
                const delay = BACKOFF_BASE * Math.pow(4, attempt - 1);
                await new Promise(r => setTimeout(r, delay));
            } else {
                console.error('Full scan failed after all retries');
                if (notifyFn) await notifyFn('error', { message: `Full scan failed: ${e.message}` });
            }
        }
    }
    return null;
}

// ── Holdings-only scan pipeline ──
async function runHoldingsScan(database, opts) {
    const { fetchData, checkBreakdowns, notify: notifyFn } = opts;
    const startTime = Date.now();

    try {
        const holdings = db.getHoldings(database);
        const watchlist = db.getWatchlist(database);
        const symbols = [...new Set([
            ...holdings.map(h => h.symbol),
            ...watchlist.map(w => w.symbol)
        ])];

        if (symbols.length === 0) return null;

        // 1. Fetch data for holdings + watchlist only
        const data = await fetchData(symbols);

        // 2. Build scan data map
        const scanData = {};
        for (const sym of symbols) {
            if (data.barsMap[sym]) {
                scanData[sym] = {
                    bars: data.barsMap[sym],
                    marketData: data.marketData[sym]
                };
            }
        }

        // 3. Check structure breakdowns
        const breakdowns = checkBreakdowns(holdings, watchlist, scanData);

        // 4. Store alerts (with dedup)
        for (const alert of breakdowns) {
            if (deduplicateAlert(database, alert.symbol, alert.type)) {
                db.insertAlert(database, alert);
                if (notifyFn) await notifyFn('alert', alert);
            }
        }

        // 5. Store scan record
        const scanId = db.insertScan(database, {
            type: 'holdings',
            stockCount: symbols.length,
            duration: Date.now() - startTime
        });

        return { scanId, alertCount: breakdowns.length };
    } catch (e) {
        console.error('Holdings scan failed:', e.message);
        if (notifyFn) await notifyFn('error', { message: `Holdings scan failed: ${e.message}` });
        return null;
    }
}

// ── Schedule cron jobs ──
function startScheduler(database, scanFns) {
    const { schedule } = config;
    const tz = schedule.timezone;

    // Full scans: 9:35, 12:30, 16:05 ET weekdays
    for (const time of schedule.fullScans) {
        const [hour, minute] = time.split(':');
        const cronExpr = `${minute} ${hour} * * 1-5`;
        cron.schedule(cronExpr, async () => {
            console.log(`[${new Date().toISOString()}] Running scheduled full scan (${time} ET)`);
            await runFullScan(database, scanFns);
        }, { timezone: tz });
    }

    // Holdings scans: 11:00, 15:00 ET weekdays
    for (const time of schedule.holdingsScans) {
        const [hour, minute] = time.split(':');
        const cronExpr = `${minute} ${hour} * * 1-5`;
        cron.schedule(cronExpr, async () => {
            console.log(`[${new Date().toISOString()}] Running scheduled holdings scan (${time} ET)`);
            await runHoldingsScan(database, scanFns);
        }, { timezone: tz });
    }

    // Weekly cleanup: Sunday 3 AM
    cron.schedule('0 3 * * 0', () => {
        console.log(`[${new Date().toISOString()}] Running weekly cleanup`);
        const deleted = db.cleanOldScanCandidates(database, config.retention.scanCandidatesDays);
        console.log(`Cleaned ${deleted} old scan candidates`);
    }, { timezone: tz });

    console.log('Scheduler started:');
    console.log(`  Full scans: ${schedule.fullScans.join(', ')} ET`);
    console.log(`  Holdings scans: ${schedule.holdingsScans.join(', ')} ET`);
}

module.exports = {
    runFullScan,
    runHoldingsScan,
    deduplicateAlert,
    startScheduler
};
