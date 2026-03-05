const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    deriveTradingRules,
    formatPerformanceInsights,
    analyzeExitTiming,
    analyzeConvictionAccuracy,
    analyzeTechnicalAccuracy,
    getSignalAccuracyAdjustments,
    matchesPattern,
    summarizePostExitQuality
} = require('../../core/learning');

// Helper: generate mock closed trades
function makeTrade(overrides = {}) {
    return {
        symbol: 'NVDA',
        profitLoss: 100,
        returnPercent: 5,
        holdTime: 3 * 86400000,
        exitReason: 'profit_target',
        entryConviction: 7,
        entryTechnicals: {
            momentumScore: 7,
            rsScore: 65,
            rsi: 55,
            macdCrossover: 'bullish',
            structure: 'bullish',
            todayChange: 2,
            sectorRotation: 'favorable',
            compositeScore: 10,
            totalReturn5d: 3
        },
        sector: 'Technology',
        ...overrides
    };
}

describe('deriveTradingRules', () => {
    it('returns insufficientData for < 3 trades', () => {
        const result = deriveTradingRules([makeTrade()]);
        assert.ok(result.summary.insufficientData);
        assert.equal(result.rules.length, 0);
    });

    it('returns rules and summary for sufficient trades', () => {
        const trades = Array.from({ length: 10 }, () => makeTrade());
        const result = deriveTradingRules(trades);
        assert.ok(result.summary);
        assert.equal(result.summary.totalTrades, 10);
        assert.ok(result.rules.length > 0);
    });

    it('detects avoid pattern when win rate is low', () => {
        // Create 6 overbought RSI trades that all lost
        const losingOverbought = Array.from({ length: 6 }, () => makeTrade({
            profitLoss: -100,
            returnPercent: -5,
            entryTechnicals: { rsi: 75, macdCrossover: 'none', structure: 'ranging' }
        }));
        const winningNormal = Array.from({ length: 6 }, () => makeTrade({
            profitLoss: 100,
            returnPercent: 5,
            entryTechnicals: { rsi: 45, macdCrossover: 'bullish', structure: 'bullish' }
        }));
        const result = deriveTradingRules([...losingOverbought, ...winningNormal]);
        const overboughtRule = result.rules.find(r => r.id === 'overbought_rsi');
        assert.ok(overboughtRule, 'Should have overbought_rsi rule');
        assert.equal(overboughtRule.type, 'avoid');
    });

    it('summary has correct win/loss counts', () => {
        const trades = [
            makeTrade({ profitLoss: 100 }),
            makeTrade({ profitLoss: -50 }),
            makeTrade({ profitLoss: 200 }),
            makeTrade({ profitLoss: -30 }),
            makeTrade({ profitLoss: 150 })
        ];
        const result = deriveTradingRules(trades);
        assert.equal(result.summary.wins, 3);
        assert.equal(result.summary.losses, 2);
    });

    it('handles null input', () => {
        const result = deriveTradingRules(null);
        assert.ok(result.summary.insufficientData);
    });
});

describe('analyzeExitTiming', () => {
    it('returns hasData: false for < 3 trades', () => {
        assert.equal(analyzeExitTiming([]).hasData, false);
        assert.equal(analyzeExitTiming(null).hasData, false);
    });

    it('groups trades by exit reason', () => {
        const trades = [
            makeTrade({ exitReason: 'profit_target' }),
            makeTrade({ exitReason: 'stop_loss', profitLoss: -50 }),
            makeTrade({ exitReason: 'profit_target' }),
            makeTrade({ exitReason: 'manual' })
        ];
        const result = analyzeExitTiming(trades);
        assert.ok(result.hasData);
        assert.equal(result.byReason.profit_target.count, 2);
    });

    it('calculates hold time buckets', () => {
        const trades = [
            makeTrade({ holdTime: 1 * 86400000 }), // 0-1d
            makeTrade({ holdTime: 3 * 86400000 }), // 2-3d
            makeTrade({ holdTime: 5 * 86400000 })  // 4-7d
        ];
        const result = analyzeExitTiming(trades);
        assert.ok(result.holdBuckets['0-1d']);
        assert.ok(result.holdBuckets['2-3d']);
        assert.ok(result.holdBuckets['4-7d']);
    });
});

describe('analyzeConvictionAccuracy', () => {
    it('returns hasData: false for < 5 trades', () => {
        const result = analyzeConvictionAccuracy([makeTrade()]);
        assert.equal(result.hasData, false);
    });

    it('groups by conviction level', () => {
        const trades = [
            ...Array(3).fill(null).map(() => makeTrade({ entryConviction: 9 })),
            ...Array(3).fill(null).map(() => makeTrade({ entryConviction: 7 })),
            ...Array(3).fill(null).map(() => makeTrade({ entryConviction: 5 }))
        ];
        const result = analyzeConvictionAccuracy(trades);
        assert.ok(result.hasData);
        assert.ok(result.analysis['9-10']);
        assert.ok(result.analysis['7-8']);
        assert.ok(result.analysis['5-6']);
    });
});

describe('analyzeTechnicalAccuracy', () => {
    it('returns hasData: false for insufficient data', () => {
        assert.equal(analyzeTechnicalAccuracy([]).hasData, false);
    });

    it('returns structured analysis for sufficient trades', () => {
        const trades = Array.from({ length: 10 }, () => makeTrade());
        const result = analyzeTechnicalAccuracy(trades);
        assert.ok(result.hasData);
        assert.ok('momentum' in result);
        assert.ok('rsi' in result);
        assert.ok('macd' in result);
        assert.ok('structure' in result);
    });
});

describe('matchesPattern', () => {
    it('matches runner_entry for high todayChange', () => {
        assert.ok(matchesPattern('runner_entry', { momentum: { todayChange: 6 } }));
        assert.ok(!matchesPattern('runner_entry', { momentum: { todayChange: 2 } }));
    });

    it('matches overbought_rsi', () => {
        assert.ok(matchesPattern('overbought_rsi', { rsi: 75 }));
        assert.ok(!matchesPattern('overbought_rsi', { rsi: 45 }));
    });

    it('returns false for null data', () => {
        assert.ok(!matchesPattern('runner_entry', null));
    });
});

describe('summarizePostExitQuality', () => {
    it('returns null for < 3 tracked trades', () => {
        assert.equal(summarizePostExitQuality([]), null);
    });

    it('calculates week-after stats', () => {
        const trades = [
            { sellPrice: 100, tracking: { priceAfter1Week: 110, sellPrice: 100 } },
            { sellPrice: 100, tracking: { priceAfter1Week: 105, sellPrice: 100 } },
            { sellPrice: 100, tracking: { priceAfter1Week: 95, sellPrice: 100 } }
        ];
        const result = summarizePostExitQuality(trades);
        assert.ok(result);
        assert.equal(result.weekTracked, 3);
        assert.equal(result.weekWentHigher, 2);
    });
});

describe('getSignalAccuracyAdjustments', () => {
    it('returns empty object for insufficient data', () => {
        const result = getSignalAccuracyAdjustments([]);
        assert.deepEqual(result, {});
    });

    it('returns empty object for null input', () => {
        const result = getSignalAccuracyAdjustments(null);
        assert.deepEqual(result, {});
    });

    it('returns overboughtRsiExtraPenalty when overbought RSI trades have low win rate', () => {
        const trades = [
            // 4 overbought RSI losing trades (count >= 3, winRate < 35%)
            ...Array(4).fill(null).map(() => makeTrade({ profitLoss: -100, returnPercent: -5, entryTechnicals: { rsi: 75, macdCrossover: 'none', structure: 'ranging' } })),
            // 4 normal winning trades
            ...Array(4).fill(null).map(() => makeTrade({ profitLoss: 100, returnPercent: 5, entryTechnicals: { rsi: 50, macdCrossover: 'bullish', structure: 'bullish' } }))
        ];
        const result = getSignalAccuracyAdjustments(trades);
        assert.equal(result.overboughtRsiExtraPenalty, -1);
    });

    it('returns bullishMacdExtraBonus when bullish MACD trades have high win rate', () => {
        const trades = [
            // 4 bullish MACD winning trades (count >= 3, winRate > 65%)
            ...Array(4).fill(null).map(() => makeTrade({ profitLoss: 100, returnPercent: 5, entryTechnicals: { rsi: 50, macdCrossover: 'bullish', structure: 'bullish' } })),
            // 2 non-MACD trades
            ...Array(2).fill(null).map(() => makeTrade({ profitLoss: -50, returnPercent: -3, entryTechnicals: { rsi: 50, macdCrossover: 'none', structure: 'ranging' } }))
        ];
        const result = getSignalAccuracyAdjustments(trades);
        assert.equal(result.bullishMacdExtraBonus, 1);
    });
});

describe('formatPerformanceInsights', () => {
    it('returns insights string for sufficient trades', () => {
        const trades = Array.from({ length: 10 }, () => makeTrade());
        const result = formatPerformanceInsights(trades);
        assert.equal(typeof result, 'string');
        assert.ok(result.includes('TRADING RULES'));
    });

    it('includes killer prefix for low win rate', () => {
        const trades = Array.from({ length: 5 }, () => makeTrade({ profitLoss: -50, returnPercent: -5 }));
        const result = formatPerformanceInsights(trades);
        assert.ok(result.includes('BELOW 40%'));
    });
});
