'use strict';

const express = require('express');
const db = require('./db');

function createApp(database, apiSecret, opts = {}) {
    const { scanFns, config: appConfig, runFullScan } = opts;
    const app = express();
    app.use(express.json());

    // ── CORS: allow browser requests with custom X-API-Key header ──
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });

    // ── Auth middleware ──
    app.use('/api', (req, res, next) => {
        const key = req.headers['x-api-key'];
        if (!key || key !== apiSecret) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    });

    // ── Health ──
    const startTime = Date.now();
    app.get('/api/health', (req, res) => {
        const lastScan = db.getLatestScan(database);
        res.json({
            status: 'ok',
            uptime: Math.floor((Date.now() - startTime) / 1000),
            lastScanAt: lastScan?.createdAt || null,
            lastScanType: lastScan?.type || null
        });
    });

    // ── Portfolio ──
    app.get('/api/portfolio', (req, res) => {
        const portfolio = db.getPortfolio(database);
        const holdings = db.getHoldings(database);
        res.json({ ...portfolio, holdings });
    });

    app.put('/api/portfolio', (req, res) => {
        db.updatePortfolio(database, req.body);
        res.json(db.getPortfolio(database));
    });

    // ── Trades ──
    app.post('/api/trades', (req, res) => {
        const { symbol, action, shares, price, date } = req.body;
        if (!symbol || !action || !shares || !price) {
            return res.status(400).json({ error: 'Missing required fields: symbol, action, shares, price' });
        }
        try {
            const result = db.insertTrade(database, req.body);
            res.status(201).json(result);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    app.get('/api/trades', (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const rows = database.prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
        res.json(rows);
    });

    // ── Scans ──
    app.get('/api/scans/latest', (req, res) => {
        const scan = db.getLatestScan(database);
        res.json(scan);
    });

    app.get('/api/scans/:id', (req, res) => {
        const scan = db.getScanById(database, parseInt(req.params.id));
        if (!scan) return res.status(404).json({ error: 'Scan not found' });
        res.json(scan);
    });

    app.get('/api/scans', (req, res) => {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        res.json(db.getScans(database, { limit, offset }));
    });

    app.post('/api/scans/trigger', (req, res) => {
        if (!scanFns || !runFullScan) {
            return res.json({ status: 'error', message: 'Scan pipeline not configured' });
        }
        // Fire and forget — scan runs in background
        runFullScan(database, scanFns).catch(err => {
            console.error('Manual scan trigger failed:', err.message);
        });
        res.json({ status: 'queued', message: 'Full scan triggered' });
    });

    // ── Alerts ──
    app.get('/api/alerts', (req, res) => {
        res.json(db.getAlerts(database));
    });

    app.put('/api/alerts/:id/dismiss', (req, res) => {
        db.dismissAlert(database, parseInt(req.params.id));
        res.json({ ok: true });
    });

    // ── Watchlist ──
    app.get('/api/watchlist', (req, res) => {
        res.json(db.getWatchlist(database));
    });

    app.post('/api/watchlist', (req, res) => {
        const { symbol, threshold } = req.body;
        if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
        db.addToWatchlist(database, { symbol, threshold: threshold || 7 });
        res.status(201).json({ ok: true });
    });

    app.delete('/api/watchlist/:symbol', (req, res) => {
        db.removeFromWatchlist(database, req.params.symbol);
        res.json({ ok: true });
    });

    app.put('/api/watchlist/:symbol', (req, res) => {
        const { threshold } = req.body;
        if (threshold == null) return res.status(400).json({ error: 'Missing threshold' });
        db.updateWatchlistThreshold(database, req.params.symbol, threshold);
        res.json({ ok: true });
    });

    // ── Learning ──
    app.get('/api/learning', (req, res) => {
        const closedTrades = db.getClosedTrades(database, { limit: 500 });
        // Format trades for learning module
        const trades = closedTrades.map(t => ({
            symbol: t.symbol,
            profitLoss: t.profitLoss,
            returnPercent: t.returnPercent,
            holdTime: t.holdTime,
            exitReason: t.exitReason,
            entryConviction: t.entryConviction,
            entryTechnicals: t.entryTechnicals,
            sector: t.sector
        }));
        const rules = db.getTradingRules(database);
        res.json({ trades, rules });
    });

    // ── Performance ──
    app.get('/api/performance', (req, res) => {
        res.json(db.getPerformanceHistory(database));
    });

    // ── Calibration ──
    app.post('/api/calibrate', (req, res) => {
        if (!scanFns || !appConfig) {
            return res.json({ status: 'error', message: 'Calibration not configured' });
        }
        // Fire and forget — calibration runs in background
        const { runCalibrationSweep } = require('../core/calibration');
        const apiKey = appConfig.MASSIVE_API_KEY;
        runCalibrationSweep(apiKey).then(result => {
            if (result && result.weights) {
                db.saveCalibration(database, {
                    weights: result.weights,
                    regimeWeights: result.regimeWeights || null,
                    calibratedAt: new Date().toISOString(),
                    sweepResults: result
                });
                console.log('Calibration complete, weights saved');
            }
        }).catch(err => {
            console.error('Calibration failed:', err.message);
        });
        res.json({ status: 'queued', message: 'Calibration triggered' });
    });

    // ── Calibration Data ──
    app.get('/api/calibration', (req, res) => {
        res.json(db.getCalibration(database));
    });

    // ── Stock History ──
    app.get('/api/stock/:symbol/history', (req, res) => {
        const history = db.getStockHistory(database, req.params.symbol);
        res.json(history);
    });

    // ── Chat (Anthropic proxy) ──
    app.post('/api/chat', async (req, res) => {
        const anthropicKey = appConfig ? appConfig.ANTHROPIC_API_KEY : null;
        if (!anthropicKey) {
            return res.status(503).json({ error: 'Anthropic API key not configured' });
        }
        const { message, context } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Missing message' });
        }

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-6',
                    max_tokens: 1024,
                    system: 'You are a stock market analysis assistant for the APEX Advisory Dashboard. Answer concisely about stocks, market structure, and trading strategies.' + (context ? `\n\nContext: ${context}` : ''),
                    messages: [{ role: 'user', content: message }]
                })
            });

            if (!response.ok) {
                const errBody = await response.text();
                return res.status(response.status).json({ error: `Anthropic API error: ${response.status}`, details: errBody });
            }

            const data = await response.json();
            const reply = data.content && data.content[0] ? data.content[0].text : '';
            res.json({ reply });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    return app;
}

module.exports = { createApp };
