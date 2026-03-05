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
    // Neutral baseline params — everything at midpoint/neutral
    // rsNormalized on 0-10 scale (matching old APEX convention)
    const neutralParams = {
        momentumScore: 5, rsNormalized: 5, sectorFlow: 'neutral',
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
            'momentumContrib', 'rsContrib', 'sectorBonus', 'accelBonus', 'consistencyBonus',
            'structureBonus', 'extensionPenalty', 'pullbackBonus', 'runnerPenalty', 'declinePenalty',
            'rsiBonusPenalty', 'macdBonus', 'rsMeanRevPenalty', 'squeezeBonus', 'volumeBonus',
            'fvgBonus', 'smaProximityBonus', 'smaCrossoverBonus', 'learnedAdj', 'entryMultiplier'
        ];
        for (const key of expectedComponents) {
            assert.ok(key in result.breakdown, `Missing breakdown component: ${key}`);
        }
    });

    it('momentum contribution uses raw multiplication (no centering)', () => {
        const result = calculateCompositeScore({ ...neutralParams, momentumScore: 8 }, DEFAULT_WEIGHTS);
        // 8 * 0.6 = 4.8 (not (8-5)*0.6 = 1.8)
        assert.equal(result.breakdown.momentumContrib, 8 * DEFAULT_WEIGHTS.momentumMultiplier);
    });

    it('RS contribution uses raw multiplication on 0-10 scale', () => {
        const result = calculateCompositeScore({ ...neutralParams, rsNormalized: 7 }, DEFAULT_WEIGHTS);
        // 7 * 0.6 = 4.2 (not (7-5)/10*0.6)
        assert.equal(result.breakdown.rsContrib, 7 * DEFAULT_WEIGHTS.rsMultiplier);
    });

    it('with all-positive inputs gives positive score', () => {
        const bullishParams = {
            momentumScore: 8, rsNormalized: 7, sectorFlow: 'inflow',
            structureScore: 3, isAccelerating: true, upDays: 4, totalDays: 4,
            todayChange: 2, totalReturn5d: -3, rsi: 35, macdCrossover: 'bullish',
            daysToCover: 6, volumeTrend: 2, fvg: 'bullish', signalAdjustments: 0,
            sma20: 100, currentPrice: 101, smaCrossover: 'bullish', calFresh: false
        };
        const result = calculateCompositeScore(bullishParams, DEFAULT_WEIGHTS);
        assert.ok(result.total > 0, `Expected positive total, got ${result.total}`);
    });

    it('with all-bearish inputs gives negative score', () => {
        const bearishParams = {
            momentumScore: 2, rsNormalized: 3, sectorFlow: 'outflow',
            structureScore: -2, isAccelerating: false, upDays: 0, totalDays: 4,
            todayChange: -3, totalReturn5d: -5, rsi: 82, macdCrossover: 'bearish',
            daysToCover: 0, volumeTrend: 0.5, fvg: 'bearish', signalAdjustments: 0,
            sma20: 100, currentPrice: 85, smaCrossover: 'bearish', calFresh: false
        };
        const result = calculateCompositeScore(bearishParams, DEFAULT_WEIGHTS);
        assert.ok(result.total < 0, `Expected negative total, got ${result.total}`);
    });

    it('extension penalty applies for high momentum + RS', () => {
        // Both momentum >= 9 AND rsNormalized >= 8.5 → -5 penalty
        const extremeParams = { ...neutralParams, momentumScore: 9, rsNormalized: 9 };
        const normalParams = { ...neutralParams, momentumScore: 6, rsNormalized: 6 };
        const extremeResult = calculateCompositeScore(extremeParams, DEFAULT_WEIGHTS);
        const normalResult = calculateCompositeScore(normalParams, DEFAULT_WEIGHTS);
        assert.equal(extremeResult.breakdown.extensionPenalty, -5);
        assert.equal(normalResult.breakdown.extensionPenalty, 0);
    });

    it('pullback bonus applies for dip in strong structure', () => {
        // ret5d in [-8,-2], structureScore >= 2, not outflow → +5
        const pullbackParams = {
            ...neutralParams,
            momentumScore: 7, totalReturn5d: -4, structureScore: 2, sectorFlow: 'inflow'
        };
        const result = calculateCompositeScore(pullbackParams, DEFAULT_WEIGHTS);
        assert.equal(result.breakdown.pullbackBonus, 5);
    });

    it('runner penalty applies for large intraday moves', () => {
        const runnerParams = { ...neutralParams, todayChange: 12 };
        const result = calculateCompositeScore(runnerParams, DEFAULT_WEIGHTS);
        assert.equal(result.breakdown.runnerPenalty, -2);
    });

    it('volume bonus rewards high volume on weak momentum stocks', () => {
        // momentumScore < 5, volumeTrend > 1.5, structureScore >= 0 → +1.5
        const volParams = { ...neutralParams, momentumScore: 3, volumeTrend: 2.0 };
        const result = calculateCompositeScore(volParams, DEFAULT_WEIGHTS);
        assert.equal(result.breakdown.volumeBonus, 1.5);
    });

    it('entry multiplier extreme requires RSI > 80 AND momentum >= 9', () => {
        const extremeParams = {
            ...neutralParams, momentumScore: 9, rsi: 85, structureScore: 2
        };
        const result = calculateCompositeScore(extremeParams, DEFAULT_WEIGHTS);
        assert.equal(result.breakdown.entryMultiplier, DEFAULT_WEIGHTS.entryMultExtreme);
    });

    it('entry multiplier extended triggers on high momentum alone', () => {
        const extendedParams = {
            ...neutralParams, momentumScore: 9, rsi: 55, structureScore: 2
        };
        const result = calculateCompositeScore(extendedParams, DEFAULT_WEIGHTS);
        assert.equal(result.breakdown.entryMultiplier, DEFAULT_WEIGHTS.entryMultExtended);
    });

    it('entry multiplier pullback triggers on mild 5d dip with structure', () => {
        const pullbackParams = {
            ...neutralParams, momentumScore: 5, totalReturn5d: -4, structureScore: 2
        };
        const result = calculateCompositeScore(pullbackParams, DEFAULT_WEIGHTS);
        assert.equal(result.breakdown.entryMultiplier, DEFAULT_WEIGHTS.entryMultPullback);
    });

    it('consistency bonus only positive (upDays >= 3, totalDays >= 4)', () => {
        const goodConsistency = { ...neutralParams, upDays: 4, totalDays: 5 };
        const badConsistency = { ...neutralParams, upDays: 0, totalDays: 5 };
        const goodResult = calculateCompositeScore(goodConsistency, DEFAULT_WEIGHTS);
        const badResult = calculateCompositeScore(badConsistency, DEFAULT_WEIGHTS);
        assert.equal(goodResult.breakdown.consistencyBonus, DEFAULT_WEIGHTS.consistencyBonus);
        assert.equal(badResult.breakdown.consistencyBonus, 0); // No negative penalty
    });

    it('SMA proximity bonus requires structureScore >= 1', () => {
        // Price near SMA20 but weak structure → no bonus
        const noStructure = { ...neutralParams, structureScore: 0, sma20: 100, currentPrice: 101 };
        const withStructure = { ...neutralParams, structureScore: 2, sma20: 100, currentPrice: 101 };
        assert.equal(calculateCompositeScore(noStructure, DEFAULT_WEIGHTS).breakdown.smaProximityBonus, 0);
        assert.equal(calculateCompositeScore(withStructure, DEFAULT_WEIGHTS).breakdown.smaProximityBonus, DEFAULT_WEIGHTS.smaProxNear);
    });

    it('squeeze bonus requires structureScore >= 1', () => {
        const noStructure = { ...neutralParams, daysToCover: 6, structureScore: 0 };
        const withStructure = { ...neutralParams, daysToCover: 6, structureScore: 1, sectorFlow: 'neutral' };
        assert.equal(calculateCompositeScore(noStructure, DEFAULT_WEIGHTS).breakdown.squeezeBonus, 0);
        assert.equal(calculateCompositeScore(withStructure, DEFAULT_WEIGHTS).breakdown.squeezeBonus, DEFAULT_WEIGHTS.squeezeBonusHigh);
    });

    it('FVG bullish bonus requires ret5d < 0', () => {
        const withPullback = { ...neutralParams, fvg: 'bullish', totalReturn5d: -2 };
        const noPullback = { ...neutralParams, fvg: 'bullish', totalReturn5d: 3 };
        assert.equal(calculateCompositeScore(withPullback, DEFAULT_WEIGHTS).breakdown.fvgBonus, DEFAULT_WEIGHTS.fvgBullish);
        assert.equal(calculateCompositeScore(noPullback, DEFAULT_WEIGHTS).breakdown.fvgBonus, 0);
    });

    it('signal adjustments apply when calFresh is false (not true)', () => {
        const signalAdj = { overboughtRsiExtraPenalty: -2, bullishMacdExtraBonus: 1.5 };
        const withFresh = { ...neutralParams, rsi: 75, signalAdjustments: signalAdj, calFresh: true };
        const withStale = { ...neutralParams, rsi: 75, signalAdjustments: signalAdj, calFresh: false };
        const freshResult = calculateCompositeScore(withFresh, DEFAULT_WEIGHTS);
        const staleResult = calculateCompositeScore(withStale, DEFAULT_WEIGHTS);
        // Signal adj should be suppressed when calFresh=true
        assert.equal(freshResult.breakdown.learnedAdj, 0);
        // Signal adj should apply when calFresh=false (rsi>70 triggers overboughtRsiExtraPenalty)
        assert.equal(staleResult.breakdown.learnedAdj, -2);
    });

    it('uses DEFAULT_WEIGHTS when weights param is null', () => {
        const result = calculateCompositeScore(neutralParams, null);
        assert.ok('total' in result);
        assert.equal(typeof result.total, 'number');
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
