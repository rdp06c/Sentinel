'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createDatabase } = require('../helpers/sqlite-shim');

// We test the Express app by starting it on a random port
let app, server, baseUrl, db;

async function setup() {
    const shimDb = await createDatabase();
    const { initDB } = require('../../server/db');
    db = initDB(shimDb);

    const { createApp } = require('../../server/api');
    app = createApp(db, 'test-secret-key');

    return new Promise((resolve) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
}

async function teardown() {
    return new Promise((resolve) => {
        if (server) server.close(resolve);
        else resolve();
    });
}

function request(path, options = {}) {
    const { method = 'GET', body, headers = {} } = options;
    const url = `${baseUrl}${path}`;
    headers['X-API-Key'] = headers['X-API-Key'] ?? 'test-secret-key';
    if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

    return new Promise((resolve, reject) => {
        const req = http.request(url, { method, headers }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
                } catch {
                    resolve({ status: res.statusCode, body: data, headers: res.headers });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

describe('API', () => {
    before(async () => { await setup(); });
    after(async () => { await teardown(); });

    describe('auth middleware', () => {
        it('returns 401 without API key', async () => {
            const res = await request('/api/portfolio', { headers: { 'X-API-Key': '' } });
            assert.equal(res.status, 401);
        });

        it('returns 401 with wrong API key', async () => {
            const res = await request('/api/portfolio', { headers: { 'X-API-Key': 'wrong-key' } });
            assert.equal(res.status, 401);
        });

        it('allows request with correct API key', async () => {
            const res = await request('/api/portfolio');
            assert.equal(res.status, 200);
        });
    });

    describe('GET /api/health', () => {
        it('returns server status', async () => {
            const res = await request('/api/health');
            assert.equal(res.status, 200);
            assert.ok(res.body.uptime >= 0);
            assert.ok(res.body.status === 'ok');
        });
    });

    describe('GET /api/portfolio', () => {
        it('returns portfolio state', async () => {
            const res = await request('/api/portfolio');
            assert.equal(res.status, 200);
            assert.equal(res.body.cash, 100000);
            assert.ok(res.body.settings);
        });
    });

    describe('PUT /api/portfolio', () => {
        it('updates portfolio settings', async () => {
            const res = await request('/api/portfolio', {
                method: 'PUT',
                body: { settings: { scanEnabled: false } }
            });
            assert.equal(res.status, 200);
            const get = await request('/api/portfolio');
            assert.equal(get.body.settings.scanEnabled, false);
        });
    });

    describe('POST /api/trades', () => {
        it('records a BUY trade', async () => {
            const res = await request('/api/trades', {
                method: 'POST',
                body: { symbol: 'NVDA', action: 'BUY', shares: 5, price: 500, date: '2025-01-15' }
            });
            assert.equal(res.status, 201);
            assert.ok(res.body.transactionId);
        });

        it('records a SELL trade', async () => {
            const res = await request('/api/trades', {
                method: 'POST',
                body: { symbol: 'NVDA', action: 'SELL', shares: 5, price: 520, date: '2025-01-20' }
            });
            assert.equal(res.status, 201);
        });

        it('returns 400 for missing fields', async () => {
            const res = await request('/api/trades', {
                method: 'POST',
                body: { symbol: 'AAPL' }
            });
            assert.equal(res.status, 400);
        });
    });

    describe('GET /api/trades', () => {
        it('returns transaction history', async () => {
            const res = await request('/api/trades');
            assert.equal(res.status, 200);
            assert.ok(Array.isArray(res.body));
        });
    });

    describe('scans', () => {
        it('GET /api/scans/latest returns null when no scans', async () => {
            const res = await request('/api/scans/latest');
            assert.equal(res.status, 200);
        });

        it('GET /api/scans returns scan list', async () => {
            const res = await request('/api/scans');
            assert.equal(res.status, 200);
            assert.ok(Array.isArray(res.body));
        });
    });

    describe('alerts', () => {
        it('GET /api/alerts returns empty array initially', async () => {
            const res = await request('/api/alerts');
            assert.equal(res.status, 200);
            assert.deepEqual(res.body, []);
        });
    });

    describe('watchlist', () => {
        it('POST /api/watchlist adds symbol', async () => {
            const res = await request('/api/watchlist', {
                method: 'POST',
                body: { symbol: 'AAPL', threshold: 8 }
            });
            assert.equal(res.status, 201);
        });

        it('GET /api/watchlist returns items', async () => {
            const res = await request('/api/watchlist');
            assert.equal(res.status, 200);
            assert.ok(res.body.length >= 1);
        });

        it('DELETE /api/watchlist/:symbol removes symbol', async () => {
            const res = await request('/api/watchlist/AAPL', { method: 'DELETE' });
            assert.equal(res.status, 200);
        });
    });

    describe('learning', () => {
        it('GET /api/learning returns insights', async () => {
            const res = await request('/api/learning');
            assert.equal(res.status, 200);
        });
    });

    describe('performance', () => {
        it('GET /api/performance returns history', async () => {
            const res = await request('/api/performance');
            assert.equal(res.status, 200);
            assert.ok(Array.isArray(res.body));
        });
    });

    describe('calibration', () => {
        it('GET /api/calibration returns calibration data', async () => {
            const res = await request('/api/calibration');
            assert.equal(res.status, 200);
            assert.ok(typeof res.body === 'object');
        });
    });
});
