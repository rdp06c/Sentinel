'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../helpers/sqlite-shim');
const { initDB, getLatestScan, getCalibration, saveCalibration } = require('../../server/db');

// We'll test buildScanFunctions which wires the core modules together
const { buildScanFunctions } = require('../../server/scan-pipeline');

describe('scan-pipeline', () => {
    let db;

    beforeEach(async () => {
        const shimDb = await createDatabase();
        db = initDB(shimDb);
    });

    afterEach(() => {
        if (db && db.open) db.close();
    });

    describe('buildScanFunctions', () => {
        it('returns an object with fetchData, scoreAll, checkBreakdowns, notify', () => {
            const fns = buildScanFunctions(db, {
                MASSIVE_API_KEY: 'test-key',
                ANTHROPIC_API_KEY: '',
                NTFY_TOPIC: '',
                API_SECRET: 'secret'
            });

            assert.equal(typeof fns.fetchData, 'function');
            assert.equal(typeof fns.scoreAll, 'function');
            assert.equal(typeof fns.checkBreakdowns, 'function');
            assert.equal(typeof fns.notify, 'function');
        });
    });

    describe('scoreAll', () => {
        it('scores market data and returns sorted array with conviction ratings', () => {
            const fns = buildScanFunctions(db, {
                MASSIVE_API_KEY: 'test-key',
                NTFY_TOPIC: ''
            });

            // Build mock data matching what fetchData would return
            const marketData = {
                NVDA: { price: 500, changePercent: 3 },
                AAPL: { price: 200, changePercent: -1 },
                MSFT: { price: 350, changePercent: 1.5 }
            };

            const barsMap = {
                NVDA: Array.from({ length: 65 }, (_, i) => ({
                    o: 450 + i, h: 460 + i, l: 445 + i, c: 455 + i,
                    v: 2000000, t: Date.now() - (65 - i) * 86400000
                })),
                AAPL: Array.from({ length: 65 }, (_, i) => ({
                    o: 195 + i * 0.1, h: 200 + i * 0.1, l: 190 + i * 0.1, c: 198 + i * 0.1,
                    v: 500000, t: Date.now() - (65 - i) * 86400000
                })),
                MSFT: Array.from({ length: 65 }, (_, i) => ({
                    o: 340 + i * 0.2, h: 350 + i * 0.2, l: 335 + i * 0.2, c: 345 + i * 0.2,
                    v: 800000, t: Date.now() - (65 - i) * 86400000
                }))
            };

            const vix = { level: 18, trend: 'stable' };

            const result = fns.scoreAll(marketData, barsMap, vix);

            // scoreAll now returns { scores, sectorRotation, vix }
            assert.ok(result.scores, 'should have scores array');
            assert.ok(result.sectorRotation, 'should have sectorRotation');
            assert.equal(result.vix, vix, 'should pass through vix');

            assert.ok(Array.isArray(result.scores));
            assert.equal(result.scores.length, 3);

            // Each entry should have required fields
            for (const entry of result.scores) {
                assert.ok(entry.symbol, 'should have symbol');
                assert.ok(typeof entry.compositeScore === 'number', 'should have compositeScore');
                assert.ok(typeof entry.conviction === 'number', 'should have conviction');
                assert.ok(entry.conviction >= 1 && entry.conviction <= 10, 'conviction should be 1-10');
                assert.ok(entry.sector, 'should have sector');
            }
        });

        it('uses calibrated weights from database when available', () => {
            // Save calibrated weights
            saveCalibration(db, {
                weights: { momentumMultiplier: 1.0, rsMultiplier: 1.0 },
                regimeWeights: null,
                calibratedAt: new Date().toISOString(),
                sweepResults: {}
            });

            const fns = buildScanFunctions(db, {
                MASSIVE_API_KEY: 'test-key',
                NTFY_TOPIC: ''
            });

            const marketData = {
                NVDA: { price: 500, changePercent: 3 },
                AAPL: { price: 200, changePercent: -1 }
            };
            const barsMap = {
                NVDA: Array.from({ length: 65 }, (_, i) => ({
                    o: 450 + i, h: 460 + i, l: 445 + i, c: 455 + i,
                    v: 2000000, t: Date.now() - (65 - i) * 86400000
                })),
                AAPL: Array.from({ length: 65 }, (_, i) => ({
                    o: 195, h: 200, l: 190, c: 198,
                    v: 500000, t: Date.now() - (65 - i) * 86400000
                }))
            };
            const vix = { level: 18 };

            const result = fns.scoreAll(marketData, barsMap, vix);
            // Should not throw — calibrated weights are loaded and used
            assert.ok(result.scores.length === 2);
        });
    });

    describe('checkBreakdowns', () => {
        it('returns alerts for structure breakdowns in holdings', () => {
            const fns = buildScanFunctions(db, {
                MASSIVE_API_KEY: 'test-key',
                NTFY_TOPIC: ''
            });

            const holdings = [{ symbol: 'NVDA', entryStructure: { structureScore: 2 } }];
            const watchlist = [];
            const scanData = {
                NVDA: {
                    bars: Array.from({ length: 20 }, (_, i) => ({
                        o: 490, h: 500, l: 480, c: 485, v: 1000000,
                        t: Date.now() - (20 - i) * 86400000
                    })),
                    marketData: { price: 480, changePercent: -4 }
                }
            };

            const alerts = fns.checkBreakdowns(holdings, watchlist, scanData);
            // Should return an array (may or may not have alerts depending on structure)
            assert.ok(Array.isArray(alerts));
        });
    });

    describe('notify', () => {
        it('handles scan notifications without topic configured', async () => {
            const fns = buildScanFunctions(db, {
                MASSIVE_API_KEY: 'test-key',
                NTFY_TOPIC: '' // No topic = notifications silently skip
            });

            // Should not throw
            await fns.notify('scan', { type: 'full', stockCount: 100, durationMs: 5000, topCandidates: [] });
            await fns.notify('alert', { symbol: 'NVDA', type: 'bearish_choch', severity: 'critical', message: 'test' });
            await fns.notify('error', { message: 'test error' });
        });
    });
});
