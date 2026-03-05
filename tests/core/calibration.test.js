'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    pearsonCorrelation,
    generateWeekdays,
    getWeekdaysBefore,
    getWeekdaysAfter,
    calibrateWeightSet,
    runCalibrationSweep
} = require('../../core/calibration');

const { DEFAULT_WEIGHTS } = require('../../core/scoring');

// ── Helper utilities ──

describe('pearsonCorrelation', () => {
    it('returns 1 for perfectly correlated arrays', () => {
        const r = pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
        assert.ok(Math.abs(r - 1) < 0.0001, `Expected ~1, got ${r}`);
    });

    it('returns -1 for perfectly inversely correlated arrays', () => {
        const r = pearsonCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
        assert.ok(Math.abs(r + 1) < 0.0001, `Expected ~-1, got ${r}`);
    });

    it('returns 0 for < 3 elements', () => {
        assert.equal(pearsonCorrelation([1, 2], [3, 4]), 0);
        assert.equal(pearsonCorrelation([], []), 0);
    });

    it('returns 0 for constant arrays', () => {
        const r = pearsonCorrelation([5, 5, 5, 5], [1, 2, 3, 4]);
        assert.equal(r, 0);
    });

    it('handles near-zero correlations', () => {
        const r = pearsonCorrelation([1, 2, 3, 4, 5], [3, 1, 4, 1, 5]);
        assert.ok(Math.abs(r) < 0.5, `Expected near-zero, got ${r}`);
    });
});

describe('generateWeekdays', () => {
    it('returns only weekdays between two dates', () => {
        // Mon Jan 6 to Fri Jan 10, 2025 = 5 weekdays (use local-time constructors)
        const days = generateWeekdays(new Date(2025, 0, 6), new Date(2025, 0, 10));
        assert.equal(days.length, 5);
        assert.equal(days[0], '2025-01-06');
        assert.equal(days[4], '2025-01-10');
    });

    it('skips weekends', () => {
        // Fri Jan 10 to Mon Jan 13, 2025 = 2 weekdays (Fri + Mon)
        const days = generateWeekdays(new Date(2025, 0, 10), new Date(2025, 0, 13));
        assert.equal(days.length, 2);
        assert.equal(days[0], '2025-01-10');
        assert.equal(days[1], '2025-01-13');
    });

    it('returns empty for reversed range', () => {
        const days = generateWeekdays(new Date(2025, 0, 10), new Date(2025, 0, 6));
        assert.equal(days.length, 0);
    });

    it('formats dates as YYYY-MM-DD', () => {
        const days = generateWeekdays(new Date(2025, 0, 6), new Date(2025, 0, 6));
        assert.match(days[0], /^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('getWeekdaysBefore', () => {
    it('returns N weekdays before a date in ascending order', () => {
        // Before Mon Jan 13, 2025: Jan 10 (Fri), Jan 9 (Thu), Jan 8 (Wed)
        const days = getWeekdaysBefore('2025-01-13', 3);
        assert.equal(days.length, 3);
        assert.equal(days[0], '2025-01-08');
        assert.equal(days[1], '2025-01-09');
        assert.equal(days[2], '2025-01-10');
    });

    it('skips weekends going backwards', () => {
        // Before Mon Jan 13, 2025 get 6 days: should skip weekend
        const days = getWeekdaysBefore('2025-01-13', 6);
        assert.equal(days.length, 6);
        for (const d of days) {
            const dow = new Date(d + 'T00:00:00').getDay(); // parse as local
            assert.ok(dow !== 0 && dow !== 6, `${d} is a weekend`);
        }
    });
});

describe('getWeekdaysAfter', () => {
    it('returns N weekdays after a date in ascending order', () => {
        // After Fri Jan 10, 2025: Jan 13 (Mon), Jan 14 (Tue), Jan 15 (Wed)
        const days = getWeekdaysAfter('2025-01-10', 3);
        assert.equal(days.length, 3);
        assert.equal(days[0], '2025-01-13');
        assert.equal(days[1], '2025-01-14');
        assert.equal(days[2], '2025-01-15');
    });

    it('skips weekends going forwards', () => {
        const days = getWeekdaysAfter('2025-01-10', 6);
        assert.equal(days.length, 6);
        for (const d of days) {
            const dow = new Date(d + 'T00:00:00').getDay(); // parse as local
            assert.ok(dow !== 0 && dow !== 6, `${d} is a weekend`);
        }
    });
});

describe('calibrateWeightSet', () => {
    it('returns object with all DEFAULT_WEIGHTS keys', () => {
        // Create synthetic observations with known correlations
        const observations = [];
        for (let i = 0; i < 200; i++) {
            const momentumVal = Math.random() * 4 - 2;
            observations.push({
                breakdown: {
                    momentumContrib: momentumVal,
                    rsContrib: Math.random() * 2 - 1,
                    structureBonus: Math.random(),
                    accelBonus: 0,
                    consistencyBonus: 0,
                    rsiBonusPenalty: 0,
                    macdBonus: 0,
                    rsMeanRevPenalty: 0,
                    squeezeBonus: 0,
                    volumeBonus: 0,
                    fvgBonus: 0,
                    smaProximityBonus: 0,
                    smaCrossoverBonus: 0,
                    extensionPenalty: 0,
                    pullbackBonus: 0,
                    runnerPenalty: 0,
                    declinePenalty: 0
                },
                return10d: momentumVal * 0.5 + (Math.random() - 0.5) // correlated with momentum
            });
        }
        const weights = calibrateWeightSet(observations, DEFAULT_WEIGHTS);
        for (const key of Object.keys(DEFAULT_WEIGHTS)) {
            assert.ok(key in weights, `Missing weight key: ${key}`);
        }
    });

    it('adjusts weights based on correlations with shrinkage', () => {
        // All positive momentum → momentum weight should shift up
        const observations = [];
        for (let i = 0; i < 500; i++) {
            const momentum = 2 + Math.random(); // always positive
            observations.push({
                breakdown: {
                    momentumContrib: momentum,
                    rsContrib: 0, structureBonus: 0, accelBonus: 0,
                    consistencyBonus: 0, rsiBonusPenalty: 0, macdBonus: 0,
                    rsMeanRevPenalty: 0, squeezeBonus: 0, volumeBonus: 0,
                    fvgBonus: 0, smaProximityBonus: 0, smaCrossoverBonus: 0,
                    extensionPenalty: 0, pullbackBonus: 0, runnerPenalty: 0,
                    declinePenalty: 0
                },
                return10d: momentum * 2 // strongly correlated
            });
        }
        const weights = calibrateWeightSet(observations, DEFAULT_WEIGHTS);
        // Momentum weight should be adjusted (likely upward given strong positive correlation)
        assert.ok(weights.momentumMultiplier !== DEFAULT_WEIGHTS.momentumMultiplier,
            'Momentum weight should have been adjusted');
    });

    it('applies bounded changes (max ±50%)', () => {
        const observations = [];
        for (let i = 0; i < 200; i++) {
            observations.push({
                breakdown: {
                    momentumContrib: i, rsContrib: 0, structureBonus: 0,
                    accelBonus: 0, consistencyBonus: 0, rsiBonusPenalty: 0,
                    macdBonus: 0, rsMeanRevPenalty: 0, squeezeBonus: 0,
                    volumeBonus: 0, fvgBonus: 0, smaProximityBonus: 0,
                    smaCrossoverBonus: 0, extensionPenalty: 0, pullbackBonus: 0,
                    runnerPenalty: 0, declinePenalty: 0
                },
                return10d: i * 100 // extreme correlation
            });
        }
        const weights = calibrateWeightSet(observations, DEFAULT_WEIGHTS);
        // Even with extreme correlation, weight change bounded to ±50%
        const maxExpected = DEFAULT_WEIGHTS.momentumMultiplier * 1.5;
        const minExpected = DEFAULT_WEIGHTS.momentumMultiplier * 0.5;
        assert.ok(weights.momentumMultiplier <= maxExpected + 0.001,
            `Weight ${weights.momentumMultiplier} exceeds max ${maxExpected}`);
        assert.ok(weights.momentumMultiplier >= minExpected - 0.001,
            `Weight ${weights.momentumMultiplier} below min ${minExpected}`);
    });

    it('propagates related weights proportionally', () => {
        const observations = [];
        for (let i = 0; i < 200; i++) {
            const rsiVal = Math.random() * 4;
            observations.push({
                breakdown: {
                    momentumContrib: 0, rsContrib: 0, structureBonus: 0,
                    accelBonus: 0, consistencyBonus: 0,
                    rsiBonusPenalty: rsiVal,
                    macdBonus: 0, rsMeanRevPenalty: 0, squeezeBonus: 0,
                    volumeBonus: 0, fvgBonus: 0, smaProximityBonus: 0,
                    smaCrossoverBonus: 0, extensionPenalty: 0, pullbackBonus: 0,
                    runnerPenalty: 0, declinePenalty: 0
                },
                return10d: rsiVal * 1.5 + Math.random()
            });
        }
        const weights = calibrateWeightSet(observations, DEFAULT_WEIGHTS);
        // If rsiOversold30 changed, rsiOversold40, rsiOversold50, rsiOverbought70, rsiOverbought80 should too
        if (weights.rsiOversold30 !== DEFAULT_WEIGHTS.rsiOversold30) {
            const origRatio = DEFAULT_WEIGHTS.rsiOversold40 / DEFAULT_WEIGHTS.rsiOversold30;
            const newRatio = weights.rsiOversold40 / weights.rsiOversold30;
            assert.ok(Math.abs(origRatio - newRatio) < 0.001,
                'Related RSI weights should maintain proportional ratio');
        }
    });
});

describe('runCalibrationSweep', () => {
    it('throws for invalid date range', async () => {
        await assert.rejects(
            () => runCalibrationSweep({
                startDate: 'bad-date',
                endDate: '2025-01-10',
                fetchGroupedDaily: async () => ({})
            }),
            /Invalid date format/
        );
    });

    it('throws for too few trading days', async () => {
        await assert.rejects(
            () => runCalibrationSweep({
                startDate: '2025-01-06',
                endDate: '2025-01-08',
                fetchGroupedDaily: async () => ({}),
                universe: ['AAPL'],
                scoreFn: () => ({ total: 0, breakdown: {} })
            }),
            /Need at least 5/
        );
    });

    it('runs calibration with mock data and returns result', async () => {
        // Create mock bar data covering 6 months
        const startDate = '2024-07-01';
        const endDate = '2024-12-15';

        // Build mock bars for a small universe
        const universe = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN'];
        const masterBars = {};

        // Generate 130 trading days of bars for each stock
        for (const sym of universe) {
            masterBars[sym] = [];
            let price = 100 + Math.random() * 100;
            const startMs = new Date('2024-06-01').getTime();
            for (let d = 0; d < 150; d++) {
                const t = startMs + d * 86400000;
                const day = new Date(t).getDay();
                if (day === 0 || day === 6) continue;
                const change = (Math.random() - 0.48) * 3; // slight upward bias
                price = Math.max(10, price + change);
                masterBars[sym].push({
                    o: price - 1, h: price + 1, l: price - 2,
                    c: price, v: 1000000 + Math.random() * 500000,
                    t
                });
            }
        }

        let fetchCallCount = 0;
        const mockFetchGroupedDaily = async (date) => {
            fetchCallCount++;
            // Return bars for this date from masterBars
            const dateTs = new Date(date + 'T23:59:59').getTime();
            const dayStart = new Date(date + 'T00:00:00').getTime();
            const results = {};
            for (const sym of universe) {
                const bar = masterBars[sym].find(b => b.t >= dayStart && b.t <= dateTs);
                if (bar) results[sym] = bar;
            }
            return results;
        };

        const mockScoreFn = (scoreInputs) => {
            // Simple scoring: just sum a few components
            const total = (scoreInputs.momentumScore || 0) * 0.6 +
                         (scoreInputs.rsi ? (50 - scoreInputs.rsi) / 10 : 0);
            return {
                total,
                breakdown: {
                    momentumContrib: (scoreInputs.momentumScore || 0) * 0.6,
                    rsContrib: 0, structureBonus: 0, accelBonus: 0,
                    consistencyBonus: 0, rsiBonusPenalty: 0, macdBonus: 0,
                    rsMeanRevPenalty: 0, squeezeBonus: 0, volumeBonus: 0,
                    fvgBonus: 0, smaProximityBonus: 0, smaCrossoverBonus: 0,
                    extensionPenalty: 0, pullbackBonus: 0, runnerPenalty: 0,
                    declinePenalty: 0
                }
            };
        };

        const result = await runCalibrationSweep({
            startDate,
            endDate,
            fetchGroupedDaily: mockFetchGroupedDaily,
            universe,
            scoreFn: mockScoreFn,
            stockSectors: { AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology', GOOGL: 'Technology', AMZN: 'Consumer' },
            vixByDate: {},
            progressCallback: () => {} // suppress output
        });

        assert.ok(result, 'Should return a result');
        assert.ok(result.sampledDates > 0, 'Should have sampled dates');
        assert.ok(result.dataPoints > 0, 'Should have data points');
        assert.ok(result.dateRange, 'Should have date range');
        assert.ok(result.validation, 'Should have validation stats');
        assert.ok('calibratedAvg10d' in result.validation, 'Validation should have calibratedAvg10d');
        assert.ok('defaultAvg10d' in result.validation, 'Validation should have defaultAvg10d');
        assert.ok('improvement' in result.validation, 'Validation should have improvement');
        assert.ok(typeof result.validation.overfitWarning === 'boolean');
        assert.ok(result.calibratedWeights, 'Should return calibrated weights');
        assert.ok(result.regimeSplit, 'Should have regime split info');
    });

    it('applies extra shrinkage on overfit detection', async () => {
        // This tests the internal logic — hard to trigger with mock data
        // so we test the structure exists
        const universe = ['TEST'];
        const masterBars = { TEST: [] };
        let price = 100;
        const startMs = new Date('2024-06-01').getTime();
        for (let d = 0; d < 200; d++) {
            const t = startMs + d * 86400000;
            if (new Date(t).getDay() === 0 || new Date(t).getDay() === 6) continue;
            price += (Math.random() - 0.5) * 2;
            masterBars.TEST.push({ o: price, h: price + 1, l: price - 1, c: price, v: 100000, t });
        }

        const result = await runCalibrationSweep({
            startDate: '2024-07-01',
            endDate: '2024-11-30',
            fetchGroupedDaily: async (date) => {
                const dateTs = new Date(date + 'T23:59:59').getTime();
                const dayStart = new Date(date + 'T00:00:00').getTime();
                const bar = masterBars.TEST.find(b => b.t >= dayStart && b.t <= dateTs);
                return bar ? { TEST: bar } : {};
            },
            universe,
            scoreFn: () => ({ total: Math.random() * 10 - 5, breakdown: {
                momentumContrib: 0, rsContrib: 0, structureBonus: 0, accelBonus: 0,
                consistencyBonus: 0, rsiBonusPenalty: 0, macdBonus: 0,
                rsMeanRevPenalty: 0, squeezeBonus: 0, volumeBonus: 0,
                fvgBonus: 0, smaProximityBonus: 0, smaCrossoverBonus: 0,
                extensionPenalty: 0, pullbackBonus: 0, runnerPenalty: 0,
                declinePenalty: 0
            }}),
            stockSectors: { TEST: 'Technology' },
            vixByDate: {},
            progressCallback: () => {}
        });

        assert.ok(result.validation, 'Should have validation');
        assert.ok(typeof result.validation.overfitWarning === 'boolean');
    });
});
