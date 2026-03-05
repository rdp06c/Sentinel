'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../helpers/sqlite-shim');
const { initDB, getPortfolio, getHoldings, getClosedTrades, getPerformanceHistory, getCalibration } = require('../../server/db');
const { migrateFromJSON } = require('../../server/migrate');

describe('migrate', () => {
    let db;

    beforeEach(async () => {
        const shimDb = await createDatabase();
        db = initDB(shimDb);
    });

    afterEach(() => {
        if (db && db.open) db.close();
    });

    it('returns failure for null data', () => {
        const result = migrateFromJSON(db, null);
        assert.equal(result.success, false);
    });

    it('migrates cash', () => {
        migrateFromJSON(db, { cash: 75000 });
        const p = getPortfolio(db);
        assert.equal(p.cash, 75000);
    });

    it('migrates holdings', () => {
        migrateFromJSON(db, {
            holdings: {
                NVDA: { shares: 10, averagePrice: 500, entryDate: '2025-01-10', conviction: 8 },
                AAPL: { shares: 5, avgPrice: 200, buyDate: '2025-01-05' }
            }
        });
        const holdings = getHoldings(db);
        assert.equal(holdings.length, 2);
        assert.ok(holdings.find(h => h.symbol === 'NVDA'));
        assert.ok(holdings.find(h => h.symbol === 'AAPL'));
    });

    it('migrates closed trades with various field names', () => {
        migrateFromJSON(db, {
            closedTrades: [
                {
                    symbol: 'TSLA',
                    shares: 3,
                    buyPrice: 300,
                    sellPrice: 350,
                    buyDate: '2025-01-01',
                    sellDate: '2025-01-10',
                    _exitReasonV2: 'profit_target',
                    entryConviction: 7
                },
                {
                    symbol: 'META',
                    shares: 2,
                    entryPrice: 500,
                    exitPrice: 480,
                    entryDate: '2025-01-02',
                    exitDate: '2025-01-08',
                    exitReason: 'stop_loss'
                }
            ]
        });
        const closed = getClosedTrades(db);
        assert.equal(closed.length, 2);
        const tsla = closed.find(c => c.symbol === 'TSLA');
        assert.equal(tsla.entryPrice, 300);
        assert.equal(tsla.exitPrice, 350);
        assert.equal(tsla.profitLoss, 150);
    });

    it('migrates transactions', () => {
        const result = migrateFromJSON(db, {
            transactions: [
                { symbol: 'NVDA', action: 'BUY', shares: 10, price: 500, date: '2025-01-10' },
                { symbol: 'NVDA', action: 'SELL', shares: 10, price: 520, date: '2025-01-15' }
            ]
        });
        assert.equal(result.counts.txnCount, 2);
    });

    it('migrates performance history', () => {
        migrateFromJSON(db, {
            performanceHistory: [
                { portfolioValue: 100000, cash: 80000, holdingsValue: 20000, date: '2025-01-10' },
                { totalValue: 105000, cash: 75000, investedValue: 30000, date: '2025-01-11' }
            ]
        });
        const history = getPerformanceHistory(db);
        assert.equal(history.length, 2);
    });

    it('migrates calibration data', () => {
        migrateFromJSON(db, {
            calibratedWeights: { weights: { momentumMultiplier: 0.7 }, timestamp: '2025-01-15' }
        });
        const cal = getCalibration(db);
        assert.equal(cal.weights.momentumMultiplier, 0.7);
    });

    it('skips holdings with zero shares', () => {
        migrateFromJSON(db, {
            holdings: { FAKE: { shares: 0, averagePrice: 100 } }
        });
        const holdings = getHoldings(db);
        assert.equal(holdings.length, 0);
    });

    it('is idempotent for holdings (OR REPLACE)', () => {
        migrateFromJSON(db, { holdings: { NVDA: { shares: 10, averagePrice: 500, entryDate: '2025-01-10' } } });
        migrateFromJSON(db, { holdings: { NVDA: { shares: 15, averagePrice: 510, entryDate: '2025-01-10' } } });
        const holdings = getHoldings(db);
        assert.equal(holdings.length, 1);
        assert.equal(holdings[0].shares, 15);
    });
});
