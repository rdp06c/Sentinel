const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
    stockNames,
    stockSectors,
    throttled,
    throttledAll,
    _resetThrottle,
    clearCache,
    getCache,
    fetchBulkSnapshot,
    fetchVIX,
    fetchTickerDetails,
    fetchShortInterest,
    fetchNewsForStocks,
    fetchServerIndicators,
    fetchGroupedDailyBars
} = require('../../core/data');

// === Static Data Tests ===

describe('stockNames', () => {
    it('is an object with > 400 keys', () => {
        assert.ok(typeof stockNames === 'object' && stockNames !== null);
        const count = Object.keys(stockNames).length;
        assert.ok(count > 400, `Expected > 400 stock names, got ${count}`);
    });

    it('all values are non-empty strings', () => {
        for (const [ticker, name] of Object.entries(stockNames)) {
            assert.equal(typeof name, 'string', `stockNames["${ticker}"] is not a string`);
            assert.ok(name.length > 0, `stockNames["${ticker}"] is empty`);
        }
    });

    it('contains expected bellwether stocks', () => {
        const expected = {
            'NVDA': 'NVIDIA',
            'AAPL': 'Apple',
            'MSFT': 'Microsoft',
            'TSLA': 'Tesla',
            'JPM': 'JPMorgan Chase',
            'AMZN': 'Amazon',
            'XOM': 'ExxonMobil',
            'LMT': 'Lockheed Martin',
            'SPY': 'S&P 500 ETF'
        };
        for (const [ticker, name] of Object.entries(expected)) {
            assert.equal(stockNames[ticker], name, `Expected stockNames["${ticker}"] === "${name}"`);
        }
    });

    it('all keys are non-empty uppercase strings (with dots allowed)', () => {
        for (const ticker of Object.keys(stockNames)) {
            assert.ok(ticker.length > 0, 'Ticker should not be empty');
            assert.ok(/^[A-Z0-9.]+$/.test(ticker), `Ticker "${ticker}" should be uppercase alphanumeric (dots allowed)`);
        }
    });
});

describe('stockSectors', () => {
    const VALID_SECTORS = [
        'Technology', 'Automotive', 'Financial', 'Consumer',
        'Healthcare', 'Energy', 'Industrials', 'Real Estate',
        'Materials', 'Defense', 'Index Fund'
    ];

    it('is an object with > 400 keys', () => {
        assert.ok(typeof stockSectors === 'object' && stockSectors !== null);
        const count = Object.keys(stockSectors).length;
        assert.ok(count > 400, `Expected > 400 sector mappings, got ${count}`);
    });

    it('all values are one of the known sector strings', () => {
        for (const [ticker, sector] of Object.entries(stockSectors)) {
            assert.ok(
                VALID_SECTORS.includes(sector),
                `stockSectors["${ticker}"] = "${sector}" is not a valid sector. Valid: ${VALID_SECTORS.join(', ')}`
            );
        }
    });

    it('every ticker in stockNames has a sector mapping', () => {
        const missingFromSectors = Object.keys(stockNames).filter(t => !stockSectors[t]);
        assert.equal(
            missingFromSectors.length, 0,
            `Tickers in stockNames but missing from stockSectors: ${missingFromSectors.join(', ')}`
        );
    });

    it('covers all 11 sectors plus Index Fund', () => {
        const usedSectors = new Set(Object.values(stockSectors));
        for (const sector of VALID_SECTORS) {
            assert.ok(usedSectors.has(sector), `Sector "${sector}" not represented in stockSectors`);
        }
    });
});

// === Throttle Tests ===

describe('throttle', () => {
    beforeEach(() => {
        _resetThrottle();
    });

    it('throttled() executes a function and returns its result', async () => {
        const result = await throttled(async () => 42);
        assert.equal(result, 42);
    });

    it('throttledAll() executes all thunks and returns results', async () => {
        const thunks = [1, 2, 3].map(n => async () => n * 10);
        const results = await throttledAll(thunks);
        assert.deepEqual(results, [10, 20, 30]);
    });

    it('limits concurrency to MAX_CONCURRENT (20)', async () => {
        let peakConcurrency = 0;
        let currentConcurrency = 0;

        const thunks = Array.from({ length: 50 }, () => async () => {
            currentConcurrency++;
            if (currentConcurrency > peakConcurrency) {
                peakConcurrency = currentConcurrency;
            }
            // Yield to allow other tasks to start
            await new Promise(r => setTimeout(r, 10));
            currentConcurrency--;
            return true;
        });

        await throttledAll(thunks);
        assert.ok(peakConcurrency <= 20, `Peak concurrency was ${peakConcurrency}, expected <= 20`);
        assert.ok(peakConcurrency > 1, `Peak concurrency was ${peakConcurrency}, expected > 1 (parallelism)`);
    });

    it('releases slot even when function throws', async () => {
        try {
            await throttled(async () => { throw new Error('test error'); });
        } catch {
            // Expected
        }
        // Should still be able to acquire slots after error
        const result = await throttled(async () => 'ok');
        assert.equal(result, 'ok');
    });
});

// === Cache Tests ===

describe('cache management', () => {
    beforeEach(() => {
        clearCache();
    });

    it('getCache() returns the cache object', () => {
        const c = getCache();
        assert.ok(c.bulkSnapshot);
        assert.ok(c.multiDay);
        assert.ok(c.tickerDetails);
        assert.ok(c.shortInterest);
        assert.ok(c.news);
        assert.ok(c.serverIndicators);
        assert.ok('vix' in c);
    });

    it('clearCache() resets all cache entries', () => {
        const c = getCache();
        c.bulkSnapshot.data = { 'AAPL': { price: 100 } };
        c.bulkSnapshot.ts = Date.now();
        clearCache();
        const fresh = getCache();
        assert.deepEqual(fresh.bulkSnapshot.data, {});
        assert.equal(fresh.bulkSnapshot.ts, 0);
        assert.equal(fresh.vix.data, null);
    });
});

// === Fetch Function Signature Tests ===
// These verify functions exist and have the right shape without making real API calls

describe('fetch function signatures', () => {
    it('fetchBulkSnapshot requires apiKey', async () => {
        await assert.rejects(
            () => fetchBulkSnapshot(['AAPL'], undefined),
            { message: 'API_KEY_MISSING' }
        );
    });

    it('fetchTickerDetails requires apiKey for uncached symbols', async () => {
        clearCache();
        await assert.rejects(
            () => fetchTickerDetails(['AAPL'], undefined),
            { message: 'API_KEY_MISSING' }
        );
    });

    it('fetchShortInterest requires apiKey for uncached symbols', async () => {
        clearCache();
        await assert.rejects(
            () => fetchShortInterest(['AAPL'], undefined),
            { message: 'API_KEY_MISSING' }
        );
    });

    it('fetchNewsForStocks requires apiKey for uncached symbols', async () => {
        clearCache();
        await assert.rejects(
            () => fetchNewsForStocks(['AAPL'], undefined),
            { message: 'API_KEY_MISSING' }
        );
    });

    it('fetchServerIndicators returns empty object without apiKey', async () => {
        clearCache();
        const result = await fetchServerIndicators(['AAPL'], undefined);
        assert.deepEqual(result, {});
    });

    it('fetchGroupedDailyBars requires apiKey', async () => {
        clearCache();
        await assert.rejects(
            () => fetchGroupedDailyBars(new Set(['AAPL']), undefined),
            { message: 'API_KEY_MISSING' }
        );
    });

    it('fetchVIX returns null when both sources fail and no apiKey', async () => {
        clearCache();
        // Without a real network, Yahoo will fail and no Polygon apiKey fallback
        const result = await fetchVIX(undefined);
        // Result is either null (network fails) or a valid VIX object (if Yahoo responds)
        if (result !== null) {
            assert.ok(typeof result.level === 'number');
            assert.ok(typeof result.interpretation === 'string');
        }
    });
});
