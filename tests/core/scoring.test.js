const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_WEIGHTS,
    getActiveWeights,
    calculateCompositeScore,
    deriveConvictionRating
} = require('../../core/scoring');

describe('DEFAULT_WEIGHTS', () => {
    it('has all expected keys', () => {
        const expectedKeys = [
            'momentumMultiplier', 'rsMultiplier', 'structureMultiplier',
            'accelBonus', 'consistencyBonus',
            'sectorInflow', 'sectorModestInflow', 'sectorOutflow',
            'rsiOversold30', 'rsiOversold40', 'rsiOversold50',
            'rsiOverbought70', 'rsiOverbought80',
            'macdBullish', 'macdBearish', 'macdNone',
            'rsMeanRev95', 'rsMeanRev90', 'rsMeanRev85',
            'squeezeBonusHigh', 'squeezeBonusMod',
            'smaProxNear', 'smaProxBelow', 'smaProxFar15', 'smaProxFar10',
            'smaCrossoverBullish', 'smaCrossoverBearish',
            'fvgBullish', 'fvgBearish',
            'entryMultExtreme', 'entryMultExtended', 'entryMultPullback'
        ];
        for (const key of expectedKeys) {
            assert.ok(key in DEFAULT_WEIGHTS, `Missing key: ${key}`);
            assert.equal(typeof DEFAULT_WEIGHTS[key], 'number', `${key} should be a number`);
        }
        assert.equal(Object.keys(DEFAULT_WEIGHTS).length, expectedKeys.length,
            'DEFAULT_WEIGHTS should have exactly the expected number of keys');
    });
});

describe('getActiveWeights', () => {
    it('returns DEFAULT_WEIGHTS when no calibration provided', () => {
        assert.deepEqual(getActiveWeights(null, 18), DEFAULT_WEIGHTS);
        assert.deepEqual(getActiveWeights(undefined, 25), DEFAULT_WEIGHTS);
    });

    it('returns calibrated weights when present but no regime data', () => {
        const custom = { weights: { momentumMultiplier: 0.9, rsMultiplier: 0.5 } };
        const result = getActiveWeights(custom, 15);
        assert.deepEqual(result, custom.weights);
    });

    it('returns low VIX regime weights when vixLevel < 20', () => {
        const lowVixWeights = { momentumMultiplier: 0.8 };
        const highVixWeights = { momentumMultiplier: 0.3 };
        const cal = {
            weights: { momentumMultiplier: 0.5 },
            regimeWeights: { lowVix: lowVixWeights, highVix: highVixWeights }
        };
        assert.deepEqual(getActiveWeights(cal, 15), lowVixWeights);
    });

    it('returns high VIX regime weights when vixLevel >= 20', () => {
        const lowVixWeights = { momentumMultiplier: 0.8 };
        const highVixWeights = { momentumMultiplier: 0.3 };
        const cal = {
            weights: { momentumMultiplier: 0.5 },
            regimeWeights: { lowVix: lowVixWeights, highVix: highVixWeights }
        };
        assert.deepEqual(getActiveWeights(cal, 25), highVixWeights);
        assert.deepEqual(getActiveWeights(cal, 20), highVixWeights);
    });

    it('falls back through chain when regime weights are missing', () => {
        const cal = {
            weights: { momentumMultiplier: 0.5 },
            regimeWeights: { lowVix: null, highVix: null }
        };
        assert.deepEqual(getActiveWeights(cal, 15), cal.weights);
    });

    it('returns DEFAULT_WEIGHTS as last resort in regime fallback', () => {
        const cal = {
            weights: null,
            regimeWeights: { lowVix: null, highVix: null }
        };
        assert.deepEqual(getActiveWeights(cal, 15), DEFAULT_WEIGHTS);
    });

    it('returns calibrated weights when vixLevel is null', () => {
        const cal = {
            weights: { momentumMultiplier: 0.7 },
            regimeWeights: { lowVix: { momentumMultiplier: 0.8 } }
        };
        assert.deepEqual(getActiveWeights(cal, null), cal.weights);
    });
});

describe('calculateCompositeScore', () => {
    // Neutral baseline params — everything at zero/neutral
    const neutralParams = {
        momentumScore: 5, rsNormalized: 50, sectorFlow: 'neutral',
        structureScore: 0, isAccelerating: false, upDays: 2, totalDays: 4,
        todayChange: 0, totalReturn5d: 0, rsi: 55, macdCrossover: 'none',
        daysToCover: 0, volumeTrend: 1, fvg: null, signalAdjustments: 0,
        sma20: 100, currentPrice: 100, smaCrossover: 'none', calFresh: false
    };

    it('returns { total, breakdown } object', () => {
        const result = calculateCompositeScore(neutralParams, DEFAULT_WEIGHTS);
        assert.ok('total' in result, 'Result must have total');
        assert.ok('breakdown' in result, 'Result must have breakdown');
        assert.equal(typeof result.total, 'number');
        assert.equal(typeof result.breakdown, 'object');
    });

    it('breakdown contains all expected components', () => {
        const result = calculateCompositeScore(neutralParams, DEFAULT_WEIGHTS);
        const expectedComponents = [
            'momentum', 'relativeStrength', 'structure', 'acceleration',
            'consistency', 'sectorFlow', 'rsi', 'macd', 'rsMeanReversion',
            'shortSqueeze', 'smaProximity', 'smaCrossover', 'fvg',
            'entryMultiplier', 'entryAdjustment', 'signalAdjustment'
        ];
        for (const key of expectedComponents) {
            assert.ok(key in result.breakdown, `Missing breakdown component: ${key}`);
        }
    });

    it('with all-positive inputs gives positive score', () => {
        const bullishParams = {
            momentumScore: 8, rsNormalized: 70, sectorFlow: 'inflow',
            structureScore: 3, isAccelerating: true, upDays: 4, totalDays: 4,
            todayChange: 2, totalReturn5d: 4, rsi: 35, macdCrossover: 'bullish',
            daysToCover: 6, volumeTrend: 2, fvg: 'bullish', signalAdjustments: 0,
            sma20: 100, currentPrice: 101, smaCrossover: 'bullish', calFresh: false
        };
        const result = calculateCompositeScore(bullishParams, DEFAULT_WEIGHTS);
        assert.ok(result.total > 0, `Expected positive total, got ${result.total}`);
    });

    it('with all-bearish inputs gives negative score', () => {
        const bearishParams = {
            momentumScore: 2, rsNormalized: 30, sectorFlow: 'outflow',
            structureScore: -2, isAccelerating: false, upDays: 0, totalDays: 4,
            todayChange: -3, totalReturn5d: -5, rsi: 82, macdCrossover: 'bearish',
            daysToCover: 0, volumeTrend: 0.5, fvg: 'bearish', signalAdjustments: 0,
            sma20: 100, currentPrice: 85, smaCrossover: 'bearish', calFresh: false
        };
        const result = calculateCompositeScore(bearishParams, DEFAULT_WEIGHTS);
        assert.ok(result.total < 0, `Expected negative total, got ${result.total}`);
    });

    it('extension penalty applies for extreme momentum (totalReturn5d > 15)', () => {
        const extendedParams = {
            ...neutralParams,
            momentumScore: 9, totalReturn5d: 20, structureScore: 2
        };
        const normalParams = {
            ...neutralParams,
            momentumScore: 9, totalReturn5d: 4, structureScore: 2
        };
        const extendedResult = calculateCompositeScore(extendedParams, DEFAULT_WEIGHTS);
        const normalResult = calculateCompositeScore(normalParams, DEFAULT_WEIGHTS);
        assert.ok(extendedResult.total < normalResult.total,
            `Extended score (${extendedResult.total}) should be less than normal (${normalResult.total})`);
        assert.equal(extendedResult.breakdown.entryMultiplier, DEFAULT_WEIGHTS.entryMultExtreme);
    });

    it('pullback bonus applies for mild pullback (-3 to -10 return)', () => {
        const pullbackParams = {
            ...neutralParams,
            momentumScore: 7, totalReturn5d: -5, structureScore: 2
        };
        const result = calculateCompositeScore(pullbackParams, DEFAULT_WEIGHTS);
        assert.equal(result.breakdown.entryMultiplier, DEFAULT_WEIGHTS.entryMultPullback);
    });

    it('uses DEFAULT_WEIGHTS when weights param is null', () => {
        const result = calculateCompositeScore(neutralParams, null);
        assert.ok('total' in result);
        assert.equal(typeof result.total, 'number');
    });

    it('signal adjustments only apply when calFresh is true', () => {
        const withSignal = { ...neutralParams, signalAdjustments: 3, calFresh: true };
        const withoutFresh = { ...neutralParams, signalAdjustments: 3, calFresh: false };
        const freshResult = calculateCompositeScore(withSignal, DEFAULT_WEIGHTS);
        const staleResult = calculateCompositeScore(withoutFresh, DEFAULT_WEIGHTS);
        assert.ok(freshResult.total > staleResult.total,
            'Signal adjustment should increase score when calFresh is true');
        assert.equal(freshResult.breakdown.signalAdjustment, 3);
        assert.equal(staleResult.breakdown.signalAdjustment, 0);
    });
});

describe('deriveConvictionRating', () => {
    it('returns 1-10 for each stock', () => {
        const scores = [];
        for (let i = 0; i < 50; i++) {
            scores.push({ symbol: `STOCK${i}`, compositeScore: (i - 20) * 0.5 });
        }
        const result = deriveConvictionRating(scores);
        assert.equal(result.length, 50);
        for (const entry of result) {
            assert.ok(entry.conviction >= 1 && entry.conviction <= 10,
                `${entry.symbol} conviction ${entry.conviction} out of range`);
        }
    });

    it('highest score gets highest conviction', () => {
        const scores = [];
        for (let i = 0; i < 100; i++) {
            scores.push({ symbol: `S${i}`, compositeScore: i });
        }
        const result = deriveConvictionRating(scores);
        // Result is sorted descending, so index 0 has highest score
        assert.equal(result[0].symbol, 'S99');
        assert.equal(result[0].conviction, 10);
    });

    it('absolute floor prevents inflation for negative scores', () => {
        // All stocks have negative scores — conviction should be capped
        const scores = [
            { symbol: 'A', compositeScore: -1 },   // < 0 -> cap at 3
            { symbol: 'B', compositeScore: -6 },   // < -5 -> cap at 2
            { symbol: 'C', compositeScore: -12 },  // < -10 -> cap at 1
        ];
        const result = deriveConvictionRating(scores);
        const a = result.find(s => s.symbol === 'A');
        const b = result.find(s => s.symbol === 'B');
        const c = result.find(s => s.symbol === 'C');
        assert.ok(a.conviction <= 3, `A conviction ${a.conviction} should be <= 3`);
        assert.ok(b.conviction <= 2, `B conviction ${b.conviction} should be <= 2`);
        assert.ok(c.conviction <= 1, `C conviction ${c.conviction} should be <= 1`);
    });

    it('handles empty array', () => {
        const result = deriveConvictionRating([]);
        assert.deepEqual(result, []);
    });

    it('handles null/undefined input', () => {
        assert.deepEqual(deriveConvictionRating(null), []);
        assert.deepEqual(deriveConvictionRating(undefined), []);
    });

    it('handles single stock', () => {
        const result = deriveConvictionRating([{ symbol: 'AAPL', compositeScore: 5 }]);
        assert.equal(result.length, 1);
        assert.equal(result[0].symbol, 'AAPL');
        assert.ok(result[0].conviction >= 1 && result[0].conviction <= 10);
    });

    it('at least 20% of stocks have conviction <= 3 (no-inflation rule)', () => {
        // Create universe where all stocks have positive scores (percentile would
        // give all high ratings without the 20% rule)
        const scores = [];
        for (let i = 0; i < 100; i++) {
            scores.push({ symbol: `S${i}`, compositeScore: 10 + i * 0.1 });
        }
        const result = deriveConvictionRating(scores);
        const lowCount = result.filter(s => s.conviction <= 3).length;
        assert.ok(lowCount >= 20,
            `Expected at least 20 stocks with conviction <= 3, got ${lowCount}`);
    });

    it('preserves symbol and compositeScore in output', () => {
        const scores = [
            { symbol: 'NVDA', compositeScore: 12.5 },
            { symbol: 'TSLA', compositeScore: -3.2 },
        ];
        const result = deriveConvictionRating(scores);
        for (const entry of result) {
            assert.ok('symbol' in entry);
            assert.ok('compositeScore' in entry);
            assert.ok('conviction' in entry);
        }
        const nvda = result.find(s => s.symbol === 'NVDA');
        assert.equal(nvda.compositeScore, 12.5);
    });
});
