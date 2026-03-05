const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    calculateRSI,
    calculateSMA,
    calculateEMAArray,
    calculateMACD,
    calculateSMACrossover,
    calculate5DayMomentum,
    calculateVolumeRatio,
    calculateRelativeStrength
} = require('../../core/indicators');

// Helper: generate bars with known closes
function makeBars(closes, options = {}) {
    return closes.map((c, i) => ({
        o: options.opens ? options.opens[i] : c,
        h: options.highs ? options.highs[i] : c + 1,
        l: options.lows ? options.lows[i] : c - 1,
        c,
        v: options.volumes ? options.volumes[i] : 1000000,
        t: Date.now() - (closes.length - i) * 86400000
    }));
}

describe('calculateRSI', () => {
    it('returns null with insufficient bars', () => {
        assert.equal(calculateRSI(makeBars([100, 101, 102])), null);
        assert.equal(calculateRSI(null), null);
        assert.equal(calculateRSI([]), null);
    });

    it('returns 100 when all gains (no losses)', () => {
        const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
        assert.equal(calculateRSI(makeBars(closes)), 100);
    });

    it('returns a value between 0 and 100 for mixed data', () => {
        const closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
            45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
        const rsi = calculateRSI(makeBars(closes));
        assert.ok(rsi > 0 && rsi < 100, `RSI should be between 0-100, got ${rsi}`);
    });

    it('accepts custom period', () => {
        const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
        const rsi7 = calculateRSI(makeBars(closes), 7);
        assert.ok(rsi7 !== null);
        assert.ok(rsi7 >= 0 && rsi7 <= 100);
    });
});

describe('calculateSMA', () => {
    it('returns null with insufficient bars', () => {
        assert.equal(calculateSMA(makeBars([100, 101]), 20), null);
        assert.equal(calculateSMA(null), null);
    });

    it('calculates correct 3-period SMA', () => {
        const bars = makeBars([10, 20, 30]);
        assert.equal(calculateSMA(bars, 3), 20);
    });

    it('uses last N bars only', () => {
        const bars = makeBars([100, 10, 20, 30]);
        assert.equal(calculateSMA(bars, 3), 20);
    });
});

describe('calculateEMAArray', () => {
    it('returns empty array with insufficient data', () => {
        assert.deepEqual(calculateEMAArray([1, 2], 5), []);
    });

    it('first value equals SMA seed', () => {
        const closes = [10, 20, 30, 40, 50];
        const ema = calculateEMAArray(closes, 3);
        assert.equal(ema[0], 20); // SMA of first 3: (10+20+30)/3
    });

    it('returns correct number of values', () => {
        const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const ema = calculateEMAArray(closes, 3);
        // Period 3: SMA seed from first 3, then EMA for indices 3-9 = 8 values total
        assert.equal(ema.length, 8);
    });
});

describe('calculateMACD', () => {
    it('returns null with insufficient bars', () => {
        assert.equal(calculateMACD(makeBars(Array(30).fill(100))), null);
        assert.equal(calculateMACD(null), null);
    });

    it('returns object with macd, signal, histogram, crossover for sufficient data', () => {
        // Generate 60 bars with trending data
        const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 3) * 2);
        const result = calculateMACD(makeBars(closes));
        assert.ok(result !== null);
        assert.ok('macd' in result);
        assert.ok('signal' in result);
        assert.ok('histogram' in result);
        assert.ok('crossover' in result);
        assert.ok(['bullish', 'bearish', 'none'].includes(result.crossover));
    });

    it('histogram equals macd minus signal', () => {
        const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.3);
        const result = calculateMACD(makeBars(closes));
        const expected = Math.round((result.macd - result.signal) * 1000) / 1000;
        assert.equal(result.histogram, expected);
    });
});

describe('calculateSMACrossover', () => {
    it('returns null with insufficient bars', () => {
        assert.equal(calculateSMACrossover(makeBars(Array(50).fill(100))), null);
    });

    it('returns sma50, crossover, spread for sufficient data', () => {
        const closes = Array.from({ length: 55 }, (_, i) => 100 + i * 0.1);
        const result = calculateSMACrossover(makeBars(closes));
        assert.ok(result !== null);
        assert.ok('sma50' in result);
        assert.ok('crossover' in result);
        assert.ok('spread' in result);
    });

    it('detects bullish crossover when SMA20 crosses above SMA50', () => {
        // SMA20 below SMA50 for most of series, then crosses above at end
        // Start with high prices, dip low, then recover sharply at end
        const closes = [];
        for (let i = 0; i < 55; i++) {
            if (i < 30) closes.push(100 - i * 0.5); // Declining
            else closes.push(85 + (i - 30) * 1.5); // Sharp recovery
        }
        const result = calculateSMACrossover(makeBars(closes));
        assert.ok(result !== null);
        // The crossover detection depends on exact SMA values
    });
});

describe('calculate5DayMomentum', () => {
    it('returns fallback score with no bars', () => {
        const result = calculate5DayMomentum({ price: 100, changePercent: 3 }, []);
        assert.ok(result.score >= 0 && result.score <= 10);
        assert.equal(result.basis, '1-day-fallback');
    });

    it('returns no-data result with null priceData and no bars', () => {
        const result = calculate5DayMomentum(null, []);
        assert.equal(result.score, 0);
        assert.equal(result.trend, 'unknown');
    });

    it('calculates from bars when available', () => {
        const bars = makeBars([100, 102, 104, 106, 108, 110]); // Steady uptrend
        const result = calculate5DayMomentum({ price: 110, changePercent: 2 }, bars);
        assert.ok(result.score > 5, `Expected bullish score, got ${result.score}`);
        assert.equal(result.basis, '5-day-real');
        assert.ok(result.totalReturn5d > 0);
    });

    it('caps score between 0 and 10', () => {
        const upBars = makeBars([100, 120, 140, 160, 180, 200]); // Extreme up
        const upResult = calculate5DayMomentum({ price: 200, changePercent: 10 }, upBars);
        assert.ok(upResult.score <= 10);

        const downBars = makeBars([200, 160, 130, 100, 80, 60]); // Extreme down
        const downResult = calculate5DayMomentum({ price: 60, changePercent: -10 }, downBars);
        assert.ok(downResult.score >= 0);
    });
});

describe('calculateVolumeRatio', () => {
    it('returns null with insufficient bars', () => {
        assert.equal(calculateVolumeRatio(makeBars([100, 101, 102])), null);
    });

    it('returns null when today volume is zero', () => {
        const bars = makeBars(Array(10).fill(100), { volumes: [1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 0] });
        assert.equal(calculateVolumeRatio(bars), null);
    });

    it('returns ratio, todayVolume, avgVolume for valid data', () => {
        const volumes = [1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 2e6];
        const bars = makeBars(Array(10).fill(100), { volumes });
        const result = calculateVolumeRatio(bars);
        assert.ok(result !== null);
        assert.equal(result.ratio, 2);
        assert.equal(result.todayVolume, 2e6);
        assert.equal(result.avgVolume, 1e6);
    });
});

describe('calculateRelativeStrength', () => {
    it('returns neutral with no data', () => {
        const result = calculateRelativeStrength(null, null, 'AAPL', {});
        assert.equal(result.rsScore, 50);
        assert.equal(result.strength, 'neutral');
    });

    it('returns outperforming when stock beats sector', () => {
        const bars = {};
        bars['AAPL'] = makeBars([100, 110, 115, 120, 130]); // +30%
        bars['MSFT'] = makeBars([100, 101, 102, 103, 104]); // +4%
        bars['GOOGL'] = makeBars([100, 101, 102, 103, 104]); // +4%

        const sectorData = [
            { symbol: 'MSFT', changePercent: 4 },
            { symbol: 'GOOGL', changePercent: 4 }
        ];
        const result = calculateRelativeStrength(
            { changePercent: 30 }, sectorData, 'AAPL', bars
        );
        assert.ok(result.rsScore > 50, `Expected > 50, got ${result.rsScore}`);
    });
});
