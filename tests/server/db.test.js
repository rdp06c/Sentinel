'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../helpers/sqlite-shim');

const {
    initDB,
    getPortfolio,
    updatePortfolio,
    getHoldings,
    insertTrade,
    getClosedTrades,
    insertScan,
    insertScanCandidates,
    getLatestScan,
    getScanById,
    getScans,
    insertAlert,
    getAlerts,
    dismissAlert,
    getWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    updateWatchlistThreshold,
    getPerformanceHistory,
    insertPerformanceSnapshot,
    getTradingRules,
    saveTradingRules,
    getCalibration,
    saveCalibration,
    getStockHistory,
    cleanOldScanCandidates
} = require('../../server/db');

describe('Database', () => {
    let db;

    beforeEach(async () => {
        const shimDb = await createDatabase();
        db = initDB(shimDb);
    });

    afterEach(() => {
        if (db && db.open) db.close();
    });

    describe('initDB', () => {
        it('creates all required tables', () => {
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
            const expected = ['portfolio', 'holdings', 'transactions', 'closed_trades', 'scans', 'scan_candidates', 'alerts', 'performance_history', 'watchlist', 'calibration', 'trading_rules'];
            for (const t of expected) {
                assert.ok(tables.includes(t), `Missing table: ${t}`);
            }
        });

        it('creates default portfolio row', () => {
            const p = getPortfolio(db);
            assert.ok(p);
            assert.equal(p.cash, 100000);
        });
    });

    describe('portfolio', () => {
        it('getPortfolio returns portfolio with parsed settings', () => {
            const p = getPortfolio(db);
            assert.equal(typeof p.cash, 'number');
            assert.ok(p.settings);
        });

        it('updatePortfolio changes settings', () => {
            updatePortfolio(db, { settings: { scanEnabled: false } });
            const p = getPortfolio(db);
            assert.equal(p.settings.scanEnabled, false);
        });

        it('updatePortfolio changes cash', () => {
            updatePortfolio(db, { cash: 50000 });
            const p = getPortfolio(db);
            assert.equal(p.cash, 50000);
        });
    });

    describe('trades', () => {
        it('insertTrade BUY creates holding and transaction', () => {
            const result = insertTrade(db, {
                symbol: 'NVDA',
                action: 'BUY',
                shares: 10,
                price: 500,
                date: '2025-01-15',
                conviction: 8,
                notes: 'Strong momentum',
                thesis: { targets: { stopLoss: 480 } }
            });
            assert.ok(result.transactionId);
            const holdings = getHoldings(db);
            assert.equal(holdings.length, 1);
            assert.equal(holdings[0].symbol, 'NVDA');
            assert.equal(holdings[0].shares, 10);
            // Cash reduced
            const p = getPortfolio(db);
            assert.equal(p.cash, 100000 - 10 * 500);
        });

        it('insertTrade SELL removes holding and creates closed trade', () => {
            // Buy first
            insertTrade(db, { symbol: 'AAPL', action: 'BUY', shares: 5, price: 200, date: '2025-01-10' });
            // Sell
            insertTrade(db, { symbol: 'AAPL', action: 'SELL', shares: 5, price: 220, date: '2025-01-15' });

            const holdings = getHoldings(db);
            assert.equal(holdings.length, 0);
            const closed = getClosedTrades(db);
            assert.equal(closed.length, 1);
            assert.equal(closed[0].symbol, 'AAPL');
            assert.equal(closed[0].profitLoss, (220 - 200) * 5);
        });

        it('insertTrade partial SELL reduces holding shares', () => {
            insertTrade(db, { symbol: 'MSFT', action: 'BUY', shares: 10, price: 400, date: '2025-01-10' });
            insertTrade(db, { symbol: 'MSFT', action: 'SELL', shares: 3, price: 420, date: '2025-01-12' });

            const holdings = getHoldings(db);
            assert.equal(holdings.length, 1);
            assert.equal(holdings[0].shares, 7);
        });

        it('insertTrade SELL throws for unknown symbol', () => {
            assert.throws(() => {
                insertTrade(db, { symbol: 'FAKE', action: 'SELL', shares: 1, price: 100, date: '2025-01-15' });
            }, /No holding found/);
        });

        it('insertTrade SELL throws for insufficient shares', () => {
            insertTrade(db, { symbol: 'TSLA', action: 'BUY', shares: 5, price: 300, date: '2025-01-10' });
            assert.throws(() => {
                insertTrade(db, { symbol: 'TSLA', action: 'SELL', shares: 10, price: 320, date: '2025-01-15' });
            }, /Insufficient shares/);
        });
    });

    describe('scans', () => {
        it('insertScan creates scan record', () => {
            const scanId = insertScan(db, { type: 'full', stockCount: 490, duration: 12000 });
            assert.ok(scanId);
        });

        it('insertScanCandidates stores candidates', () => {
            const scanId = insertScan(db, { type: 'full', stockCount: 2, duration: 1000 });
            insertScanCandidates(db, scanId, [
                { symbol: 'NVDA', compositeScore: 15.5, conviction: 9, sector: 'Technology', data: {} },
                { symbol: 'AAPL', compositeScore: 12.0, conviction: 7, sector: 'Technology', data: {} }
            ]);
            const latest = getLatestScan(db);
            assert.ok(latest);
            assert.equal(latest.candidates.length, 2);
        });

        it('getLatestScan returns most recent scan with candidates', () => {
            const id1 = insertScan(db, { type: 'full', stockCount: 1, duration: 500 });
            insertScanCandidates(db, id1, [{ symbol: 'A', compositeScore: 5, conviction: 5, sector: 'X', data: {} }]);
            const id2 = insertScan(db, { type: 'full', stockCount: 1, duration: 600 });
            insertScanCandidates(db, id2, [{ symbol: 'B', compositeScore: 8, conviction: 8, sector: 'Y', data: {} }]);

            const latest = getLatestScan(db);
            assert.equal(latest.id, id2);
            assert.equal(latest.candidates[0].symbol, 'B');
        });

        it('getScanById returns specific scan', () => {
            const id = insertScan(db, { type: 'holdings', stockCount: 5, duration: 2000 });
            const scan = getScanById(db, id);
            assert.equal(scan.type, 'holdings');
        });

        it('getScans returns paginated list', () => {
            for (let i = 0; i < 5; i++) {
                insertScan(db, { type: 'full', stockCount: i, duration: i * 100 });
            }
            const scans = getScans(db, { limit: 3, offset: 0 });
            assert.equal(scans.length, 3);
        });
    });

    describe('alerts', () => {
        it('insertAlert creates alert', () => {
            const id = insertAlert(db, {
                symbol: 'NVDA',
                type: 'bearish_choch',
                severity: 'critical',
                message: 'Bearish CHoCH detected'
            });
            assert.ok(id);
        });

        it('getAlerts returns active alerts', () => {
            insertAlert(db, { symbol: 'NVDA', type: 'bearish_choch', severity: 'critical', message: 'test' });
            insertAlert(db, { symbol: 'AAPL', type: 'bearish_bos', severity: 'high', message: 'test2' });
            const alerts = getAlerts(db);
            assert.equal(alerts.length, 2);
        });

        it('dismissAlert marks alert as dismissed', () => {
            const id = insertAlert(db, { symbol: 'NVDA', type: 'test', severity: 'medium', message: 'x' });
            dismissAlert(db, id);
            const alerts = getAlerts(db);
            assert.equal(alerts.length, 0);
        });
    });

    describe('watchlist', () => {
        it('addToWatchlist adds symbol', () => {
            addToWatchlist(db, { symbol: 'NVDA', threshold: 8 });
            const list = getWatchlist(db);
            assert.equal(list.length, 1);
            assert.equal(list[0].symbol, 'NVDA');
            assert.equal(list[0].threshold, 8);
        });

        it('removeFromWatchlist removes symbol', () => {
            addToWatchlist(db, { symbol: 'AAPL', threshold: 7 });
            removeFromWatchlist(db, 'AAPL');
            const list = getWatchlist(db);
            assert.equal(list.length, 0);
        });

        it('updateWatchlistThreshold changes threshold', () => {
            addToWatchlist(db, { symbol: 'MSFT', threshold: 6 });
            updateWatchlistThreshold(db, 'MSFT', 9);
            const list = getWatchlist(db);
            assert.equal(list[0].threshold, 9);
        });
    });

    describe('performance', () => {
        it('insertPerformanceSnapshot and getPerformanceHistory work', () => {
            insertPerformanceSnapshot(db, { portfolioValue: 105000, cash: 50000, holdingsValue: 55000, date: '2025-01-15' });
            insertPerformanceSnapshot(db, { portfolioValue: 107000, cash: 48000, holdingsValue: 59000, date: '2025-01-16' });
            const history = getPerformanceHistory(db);
            assert.equal(history.length, 2);
        });
    });

    describe('trading rules', () => {
        it('saveTradingRules and getTradingRules round-trip', () => {
            const rules = { rules: [{ id: 'test', type: 'avoid' }], summary: { totalTrades: 10 } };
            saveTradingRules(db, rules);
            const loaded = getTradingRules(db);
            assert.deepEqual(loaded.rules[0].id, 'test');
        });
    });

    describe('calibration', () => {
        it('saveCalibration and getCalibration round-trip', () => {
            const cal = { weights: { momentumMultiplier: 0.7 }, timestamp: new Date().toISOString() };
            saveCalibration(db, cal);
            const loaded = getCalibration(db);
            assert.equal(loaded.weights.momentumMultiplier, 0.7);
        });
    });

    describe('stock history', () => {
        it('getStockHistory returns conviction history from scan_candidates', () => {
            const id1 = insertScan(db, { type: 'full', stockCount: 1, duration: 100 });
            insertScanCandidates(db, id1, [{ symbol: 'NVDA', compositeScore: 15, conviction: 9, sector: 'Tech', data: {} }]);
            const id2 = insertScan(db, { type: 'full', stockCount: 1, duration: 100 });
            insertScanCandidates(db, id2, [{ symbol: 'NVDA', compositeScore: 12, conviction: 7, sector: 'Tech', data: {} }]);

            const history = getStockHistory(db, 'NVDA');
            assert.equal(history.length, 2);
        });
    });

    describe('cleanup', () => {
        it('cleanOldScanCandidates removes old data', () => {
            // Insert a scan with old timestamp
            const stmt = db.prepare('INSERT INTO scans (type, stock_count, duration_ms, created_at) VALUES (?, ?, ?, ?)');
            const oldDate = new Date(Date.now() - 100 * 86400000).toISOString(); // 100 days ago
            const info = stmt.run('full', 1, 100, oldDate);
            const oldScanId = info.lastInsertRowid;
            insertScanCandidates(db, oldScanId, [{ symbol: 'OLD', compositeScore: 1, conviction: 1, sector: 'X', data: {} }]);

            // Insert recent scan
            const recentId = insertScan(db, { type: 'full', stockCount: 1, duration: 100 });
            insertScanCandidates(db, recentId, [{ symbol: 'NEW', compositeScore: 5, conviction: 5, sector: 'Y', data: {} }]);

            const deleted = cleanOldScanCandidates(db, 90);
            assert.ok(deleted >= 1);

            // Recent should still exist
            const latest = getLatestScan(db);
            assert.equal(latest.candidates[0].symbol, 'NEW');
        });
    });
});
