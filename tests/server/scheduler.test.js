'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../helpers/sqlite-shim');
const { initDB, getLatestScan, getAlerts, insertTrade, getHoldings } = require('../../server/db');
const { runFullScan, runHoldingsScan, deduplicateAlert } = require('../../server/scheduler');

describe('scheduler', () => {
    let db;

    beforeEach(async () => {
        const shimDb = await createDatabase();
        db = initDB(shimDb);
    });

    afterEach(() => {
        if (db && db.open) db.close();
    });

    describe('runFullScan', () => {
        it('stores scan results in database', async () => {
            const mockFetchData = async () => ({
                marketData: { NVDA: { price: 500, changePercent: 2 }, AAPL: { price: 200, changePercent: -1 } },
                barsMap: {
                    NVDA: Array.from({ length: 65 }, (_, i) => ({ o: 490 + i, h: 500 + i, l: 485 + i, c: 495 + i, v: 1000000, t: Date.now() - (65 - i) * 86400000 })),
                    AAPL: Array.from({ length: 65 }, (_, i) => ({ o: 195 + i * 0.1, h: 200 + i * 0.1, l: 190 + i * 0.1, c: 198 + i * 0.1, v: 500000, t: Date.now() - (65 - i) * 86400000 }))
                },
                vix: { level: 18, trend: 'stable' }
            });

            const mockScoreAll = (marketData, barsMap, vix) => [
                { symbol: 'NVDA', compositeScore: 15.5, conviction: 9, sector: 'Technology', data: {} },
                { symbol: 'AAPL', compositeScore: 12.0, conviction: 7, sector: 'Technology', data: {} }
            ];

            await runFullScan(db, {
                fetchData: mockFetchData,
                scoreAll: mockScoreAll,
                universe: ['NVDA', 'AAPL'],
                notify: async () => {}
            });

            const scan = getLatestScan(db);
            assert.ok(scan);
            assert.equal(scan.type, 'full');
            assert.equal(scan.candidates.length, 2);
        });

        it('retries on failure up to 3 times', async () => {
            let attempts = 0;
            const mockFetchData = async () => {
                attempts++;
                if (attempts < 3) throw new Error('Transient failure');
                return {
                    marketData: { NVDA: { price: 500, changePercent: 1 } },
                    barsMap: { NVDA: [{ o: 495, h: 505, l: 490, c: 500, v: 1000000, t: Date.now() }] },
                    vix: { level: 18 }
                };
            };

            await runFullScan(db, {
                fetchData: mockFetchData,
                scoreAll: () => [{ symbol: 'NVDA', compositeScore: 10, conviction: 7, sector: 'Tech', data: {} }],
                universe: ['NVDA'],
                notify: async () => {}
            });

            assert.equal(attempts, 3);
            const scan = getLatestScan(db);
            assert.ok(scan);
        });

        it('calls notify on failure after all retries exhausted', async () => {
            let notifiedError = false;
            const mockFetchData = async () => { throw new Error('Permanent failure'); };

            await runFullScan(db, {
                fetchData: mockFetchData,
                scoreAll: () => [],
                universe: [],
                notify: async (type, data) => {
                    if (type === 'error') notifiedError = true;
                }
            });

            assert.ok(notifiedError);
        });
    });

    describe('runHoldingsScan', () => {
        it('checks structure breakdowns for holdings', async () => {
            // Buy a stock first
            insertTrade(db, { symbol: 'NVDA', action: 'BUY', shares: 10, price: 500, date: '2025-01-10', conviction: 8, entryTechnicals: { structureScore: 2 } });

            const mockFetchData = async (symbols) => ({
                marketData: { NVDA: { price: 480, changePercent: -4 } },
                barsMap: { NVDA: Array.from({ length: 20 }, (_, i) => ({ o: 490, h: 500, l: 480, c: 485, v: 1000000, t: Date.now() - (20 - i) * 86400000 })) },
                vix: { level: 22 }
            });

            const mockCheckBreakdowns = (holdings, watchlist, scanData) => [
                { symbol: 'NVDA', type: 'bearish_choch', severity: 'critical', message: 'Bearish CHoCH detected' }
            ];

            const alerts = [];
            await runHoldingsScan(db, {
                fetchData: mockFetchData,
                checkBreakdowns: mockCheckBreakdowns,
                notify: async (type, data) => { if (type === 'alert') alerts.push(data); }
            });

            const dbAlerts = getAlerts(db);
            assert.ok(dbAlerts.length >= 1);
        });
    });

    describe('deduplicateAlert', () => {
        it('returns true for new alert', () => {
            const result = deduplicateAlert(db, 'NVDA', 'bearish_choch');
            assert.equal(result, true);
        });

        it('returns false for duplicate within 24h', () => {
            // Insert an alert
            db.prepare("INSERT INTO alerts (symbol, type, severity, message) VALUES (?, ?, ?, ?)").run('NVDA', 'bearish_choch', 'critical', 'test');
            const result = deduplicateAlert(db, 'NVDA', 'bearish_choch');
            assert.equal(result, false);
        });
    });
});
