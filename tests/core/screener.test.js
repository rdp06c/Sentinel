const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { screenStocks } = require('../../core/screener');

describe('screenStocks', () => {
    it('returns an array of stock symbols', () => {
        const stocks = screenStocks();
        assert.ok(Array.isArray(stocks));
        assert.ok(stocks.length > 400, `Expected > 400 stocks, got ${stocks.length}`);
    });

    it('returns unique symbols (no duplicates)', () => {
        const stocks = screenStocks();
        const unique = new Set(stocks);
        assert.equal(stocks.length, unique.size, 'Should not contain duplicates');
    });

    it('contains expected bellwether stocks', () => {
        const stocks = screenStocks();
        const expected = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'JPM', 'AMZN', 'XOM', 'LMT'];
        for (const sym of expected) {
            assert.ok(stocks.includes(sym), `Missing expected stock: ${sym}`);
        }
    });

    it('all symbols are non-empty strings', () => {
        const stocks = screenStocks();
        for (const sym of stocks) {
            assert.equal(typeof sym, 'string');
            assert.ok(sym.length > 0, 'Symbol should not be empty');
        }
    });
});
