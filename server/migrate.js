'use strict';

// Migrate legacy Apex_Portfolio.json → SQLite
// Usage: node server/migrate.js [path-to-json]

const fs = require('fs');
const path = require('path');
const db = require('./db');

function migrateFromJSON(database, jsonData) {
    const report = [];
    const log = (msg) => { report.push(msg); console.log(msg); };

    if (!jsonData) {
        log('ERROR: No JSON data provided');
        return { success: false, report };
    }

    // Parse if string
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

    log(`Migration starting...`);

    // 1. Cash
    if (data.cash != null && data.cash >= 0) {
        db.updatePortfolio(database, { cash: data.cash });
        log(`  Cash: $${data.cash.toLocaleString()}`);
    }

    // 2. Holdings
    let holdingsCount = 0;
    if (data.holdings && typeof data.holdings === 'object') {
        // Look up theses from holdingTheses if available
        const theses = data.holdingTheses || {};
        for (const [symbol, holding] of Object.entries(data.holdings)) {
            // Legacy format: { symbol: shares } (number) or { symbol: { shares, ... } } (object)
            const isSimple = typeof holding === 'number';
            const shares = isSimple ? holding : (holding.shares || 0);
            if (!shares || shares <= 0) continue;

            const thesis = theses[symbol] || (isSimple ? {} : (holding.thesis || {}));
            try {
                // Use direct insert to preserve entry dates
                database.prepare(`INSERT OR REPLACE INTO holdings
                    (symbol, shares, avg_price, entry_date, conviction, notes, thesis, entry_technicals)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                    symbol,
                    shares,
                    isSimple ? (thesis.averagePrice || thesis.entryPrice || 0) : (holding.averagePrice || holding.avgPrice || holding.price || 0),
                    isSimple ? (thesis.entryDate || new Date().toISOString()) : (holding.entryDate || holding.buyDate || new Date().toISOString()),
                    isSimple ? (thesis.conviction || null) : (holding.conviction || holding.entryConviction || null),
                    isSimple ? null : (holding.notes || null),
                    JSON.stringify(thesis),
                    JSON.stringify(isSimple ? (thesis.entryTechnicals || {}) : (holding.entryTechnicals || holding.entry_technicals || {}))
                );
                holdingsCount++;
            } catch (e) {
                log(`  WARNING: Failed to import holding ${symbol}: ${e.message}`);
            }
        }
        log(`  Holdings: ${holdingsCount} imported`);
    }

    // 3. Transactions
    let txnCount = 0;
    if (Array.isArray(data.transactions)) {
        for (const txn of data.transactions) {
            if (!txn.symbol || !txn.action) continue;
            try {
                database.prepare(`INSERT INTO transactions
                    (symbol, action, shares, price, total, date, conviction, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                    txn.symbol,
                    txn.action,
                    txn.shares || 0,
                    txn.price || 0,
                    txn.total || (txn.shares || 0) * (txn.price || 0),
                    txn.date || txn.timestamp || new Date().toISOString(),
                    txn.conviction || null,
                    txn.notes || txn.reasoning || null
                );
                txnCount++;
            } catch (e) {
                log(`  WARNING: Failed to import transaction: ${e.message}`);
            }
        }
        log(`  Transactions: ${txnCount} imported`);
    }

    // 4. Closed trades
    let closedCount = 0;
    if (Array.isArray(data.closedTrades)) {
        for (const trade of data.closedTrades) {
            if (!trade.symbol) continue;
            try {
                const entryPrice = trade.buyPrice || trade.entryPrice || trade.averagePrice || 0;
                const exitPrice = trade.sellPrice || trade.exitPrice || 0;
                const shares = trade.shares || 0;
                const profitLoss = trade.profitLoss ?? ((exitPrice - entryPrice) * shares);
                const returnPercent = trade.returnPercent ?? (entryPrice ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0);

                database.prepare(`INSERT INTO closed_trades
                    (symbol, shares, entry_price, exit_price, entry_date, exit_date,
                     profit_loss, return_percent, hold_time_ms, exit_reason,
                     entry_conviction, entry_technicals, sector, notes, tracking)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                    trade.symbol, shares, entryPrice, exitPrice,
                    trade.entryDate || trade.buyDate || '',
                    trade.exitDate || trade.sellDate || '',
                    profitLoss, returnPercent,
                    trade.holdTime || trade.holdTimeMs || null,
                    trade._exitReasonV2 || trade.exitReason || 'manual',
                    trade.entryConviction || trade.conviction || null,
                    JSON.stringify(trade.entryTechnicals || trade.entry_technicals || {}),
                    trade.sector || null,
                    trade.notes || null,
                    JSON.stringify(trade.tracking || {})
                );
                closedCount++;
            } catch (e) {
                log(`  WARNING: Failed to import closed trade ${trade.symbol}: ${e.message}`);
            }
        }
        log(`  Closed trades: ${closedCount} imported`);
    }

    // 5. Performance history
    let perfCount = 0;
    if (Array.isArray(data.performanceHistory)) {
        for (const p of data.performanceHistory) {
            try {
                db.insertPerformanceSnapshot(database, {
                    portfolioValue: p.portfolioValue || p.totalValue || 0,
                    cash: p.cash || 0,
                    holdingsValue: p.holdingsValue || p.investedValue || 0,
                    date: p.date || p.timestamp || ''
                });
                perfCount++;
            } catch (e) {
                log(`  WARNING: Failed to import performance snapshot: ${e.message}`);
            }
        }
        log(`  Performance history: ${perfCount} snapshots imported`);
    }

    // 6. Calibrated weights
    if (data.calibratedWeights) {
        db.saveCalibration(database, data.calibratedWeights);
        log(`  Calibration data: imported`);
    }

    // 7. Settings
    if (data.settings) {
        db.updatePortfolio(database, { settings: data.settings });
        log(`  Settings: imported`);
    }

    log(`Migration complete: ${holdingsCount} holdings, ${txnCount} transactions, ${closedCount} closed trades, ${perfCount} performance snapshots`);

    return { success: true, report, counts: { holdingsCount, txnCount, closedCount, perfCount } };
}

// CLI entry point
if (require.main === module) {
    const jsonPath = process.argv[2] || path.join(__dirname, '..', '..', 'Apex', 'Apex_Portfolio.json');
    if (!fs.existsSync(jsonPath)) {
        console.error(`File not found: ${jsonPath}`);
        process.exit(1);
    }
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const dbPath = path.join(__dirname, '..', 'data', 'apex.db');
    const database = db.initDB(dbPath);
    const result = migrateFromJSON(database, jsonData);
    database.close();
    process.exit(result.success ? 0 : 1);
}

module.exports = { migrateFromJSON };
