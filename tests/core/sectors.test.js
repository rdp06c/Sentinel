const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { detectSectorRotation } = require('../../core/sectors');

// Helper: generate bars with known closes
function makeBars(closes) {
    return closes.map((c, i) => ({
        o: c,
        h: c + 1,
        l: c - 1,
        c,
        v: 1000000,
        t: Date.now() - (closes.length - i) * 86400000
    }));
}

describe('detectSectorRotation', () => {
    it('returns sector analysis object with correct keys', () => {
        const marketData = {
            AAPL: { changePercent: 1.5 },
            MSFT: { changePercent: 0.8 }
        };
        const barsMap = {};
        const stockSectors = { AAPL: 'Technology', MSFT: 'Technology' };

        const result = detectSectorRotation(marketData, barsMap, stockSectors);

        assert.ok(result.Technology, 'Should have Technology sector');
        const tech = result.Technology;
        assert.ok('avgChange' in tech, 'Missing avgChange');
        assert.ok('avgReturn5d' in tech, 'Missing avgReturn5d');
        assert.ok('leaders5d' in tech, 'Missing leaders5d');
        assert.ok('laggards5d' in tech, 'Missing laggards5d');
        assert.ok('leadersToday' in tech, 'Missing leadersToday');
        assert.ok('laggardsToday' in tech, 'Missing laggardsToday');
        assert.ok('total' in tech, 'Missing total');
        assert.ok('leaderRatio5d' in tech, 'Missing leaderRatio5d');
        assert.ok('moneyFlow' in tech, 'Missing moneyFlow');
        assert.ok('rotationSignal' in tech, 'Missing rotationSignal');
        assert.equal(tech.total, 2);
    });

    it('detects inflow when avgReturn5d > 2 and leaderRatio > 50%', () => {
        // 3 stocks, all with strong 5-day returns (>2%), so leader ratio = 100%
        const marketData = {
            A: { changePercent: 2 },
            B: { changePercent: 3 },
            C: { changePercent: 2.5 }
        };
        // Bars: each stock goes from 100 to 105+ over 5 bars (>2% return)
        const barsMap = {
            A: makeBars([100, 101, 102, 103, 105]),
            B: makeBars([100, 102, 104, 106, 108]),
            C: makeBars([100, 101, 103, 105, 106])
        };
        const stockSectors = { A: 'Tech', B: 'Tech', C: 'Tech' };

        const result = detectSectorRotation(marketData, barsMap, stockSectors);

        assert.equal(result.Tech.moneyFlow, 'inflow');
        assert.equal(result.Tech.rotationSignal, 'accumulate');
    });

    it('detects outflow when avgReturn5d < -2 and laggardRatio > 50%', () => {
        // 3 stocks, all with poor 5-day returns (<-2%), so laggard ratio = 100%
        const marketData = {
            X: { changePercent: -2 },
            Y: { changePercent: -3 },
            Z: { changePercent: -2.5 }
        };
        // Bars: each stock drops from 100 to below 98 over 5 bars (>2% loss)
        const barsMap = {
            X: makeBars([100, 99, 98, 97, 95]),
            Y: makeBars([100, 98, 96, 94, 92]),
            Z: makeBars([100, 99, 97, 96, 94])
        };
        const stockSectors = { X: 'Energy', Y: 'Energy', Z: 'Energy' };

        const result = detectSectorRotation(marketData, barsMap, stockSectors);

        assert.equal(result.Energy.moneyFlow, 'outflow');
        assert.equal(result.Energy.rotationSignal, 'avoid');
    });

    it('returns neutral for mixed data', () => {
        // Mix of gainers and losers — avg near zero, no dominant ratio
        const marketData = {
            A: { changePercent: 1.5 },
            B: { changePercent: -1.5 },
            C: { changePercent: 0.2 },
            D: { changePercent: -0.3 }
        };
        // Bars with modest mixed returns that average near zero
        const barsMap = {
            A: makeBars([100, 100.5, 101, 101.5, 101]),   // +1%
            B: makeBars([100, 99.5, 99, 98.5, 99]),       // -1%
            C: makeBars([100, 100.2, 100.4, 100.3, 100.5]), // +0.5%
            D: makeBars([100, 99.8, 99.7, 99.9, 99.5])    // -0.5%
        };
        const stockSectors = { A: 'Mixed', B: 'Mixed', C: 'Mixed', D: 'Mixed' };

        const result = detectSectorRotation(marketData, barsMap, stockSectors);

        assert.equal(result.Mixed.moneyFlow, 'neutral');
        assert.equal(result.Mixed.rotationSignal, 'hold');
    });

    it('handles empty marketData', () => {
        const result = detectSectorRotation({}, {}, {});
        assert.deepEqual(result, {});
    });

    it('falls back to changePercent when no bars available', () => {
        const marketData = {
            A: { changePercent: 5 },
            B: { changePercent: 4 }
        };
        const barsMap = {};
        const stockSectors = { A: 'Sector1', B: 'Sector1' };

        const result = detectSectorRotation(marketData, barsMap, stockSectors);

        // Without bars, return5d = changePercent. Avg = 4.5 > 2, both > 2 so leaders = 2/2 = 100%
        assert.equal(result.Sector1.moneyFlow, 'inflow');
        assert.equal(result.Sector1.total, 2);
    });

    it('assigns Unknown sector for unmapped symbols', () => {
        const marketData = {
            UNKNOWN1: { changePercent: 1 }
        };
        const barsMap = {};
        const stockSectors = {};

        const result = detectSectorRotation(marketData, barsMap, stockSectors);

        assert.ok(result.Unknown, 'Unmapped symbols should go to Unknown sector');
        assert.equal(result.Unknown.total, 1);
    });

    it('groups stocks into correct sectors', () => {
        const marketData = {
            AAPL: { changePercent: 1 },
            MSFT: { changePercent: 2 },
            XOM: { changePercent: -1 }
        };
        const barsMap = {};
        const stockSectors = { AAPL: 'Tech', MSFT: 'Tech', XOM: 'Energy' };

        const result = detectSectorRotation(marketData, barsMap, stockSectors);

        assert.equal(result.Tech.total, 2);
        assert.equal(result.Energy.total, 1);
    });

    it('detects modest-inflow when avgReturn5d > 1 and leaderRatio > 35%', () => {
        // 3 stocks: 2 with return > 2% (leaders), 1 flat. Leader ratio = 2/3 ≈ 67% > 35%
        // Avg return needs to be > 1 but <= 2
        const marketData = {
            A: { changePercent: 1 },
            B: { changePercent: 1.5 },
            C: { changePercent: 0 }
        };
        const barsMap = {
            A: makeBars([100, 100.5, 101, 101.5, 103]),   // +3% (leader)
            B: makeBars([100, 100.5, 101, 101.5, 102.5]), // +2.5% (leader)
            C: makeBars([100, 99.8, 100, 99.5, 99.7])     // -0.3% (neither)
        };
        // Avg return5d = (3 + 2.5 + (-0.3)) / 3 ≈ 1.73, leaders = 2/3 ≈ 67%
        const stockSectors = { A: 'Fin', B: 'Fin', C: 'Fin' };

        const result = detectSectorRotation(marketData, barsMap, stockSectors);

        assert.equal(result.Fin.moneyFlow, 'modest-inflow');
        assert.equal(result.Fin.rotationSignal, 'favorable');
    });

    it('detects modest-outflow when avgReturn5d < -1 and laggardRatio > 35%', () => {
        // 3 stocks: 2 with return < -2% (laggards), 1 flat. Laggard ratio = 2/3 ≈ 67%
        const marketData = {
            A: { changePercent: -1 },
            B: { changePercent: -1.5 },
            C: { changePercent: 0 }
        };
        const barsMap = {
            A: makeBars([100, 99.5, 99, 98.5, 97]),       // -3% (laggard)
            B: makeBars([100, 99.5, 99, 98.5, 97.5]),     // -2.5% (laggard)
            C: makeBars([100, 100.2, 100, 100.1, 100.3])  // +0.3% (neither)
        };
        // Avg return5d = (-3 + -2.5 + 0.3) / 3 ≈ -1.73, laggards = 2/3 ≈ 67%
        const stockSectors = { A: 'RE', B: 'RE', C: 'RE' };

        const result = detectSectorRotation(marketData, barsMap, stockSectors);

        assert.equal(result.RE.moneyFlow, 'modest-outflow');
        assert.equal(result.RE.rotationSignal, 'caution');
    });
});
