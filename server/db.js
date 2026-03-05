'use strict';

// Database layer using better-sqlite3 (synchronous SQLite for Node.js)
// On Pi: `const Database = require('better-sqlite3');`
// For dev/test without native compilation, see tests/helpers/sqlite-shim.js

const SCHEMA = `
CREATE TABLE IF NOT EXISTS portfolio (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cash REAL NOT NULL DEFAULT 100000,
    settings TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    shares REAL NOT NULL,
    avg_price REAL NOT NULL,
    entry_date TEXT NOT NULL,
    conviction INTEGER,
    notes TEXT,
    thesis TEXT DEFAULT '{}',
    entry_technicals TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
    shares REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL,
    date TEXT NOT NULL,
    conviction INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS closed_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    shares REAL NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL NOT NULL,
    entry_date TEXT NOT NULL,
    exit_date TEXT NOT NULL,
    profit_loss REAL NOT NULL,
    return_percent REAL NOT NULL,
    hold_time_ms INTEGER,
    exit_reason TEXT DEFAULT 'manual',
    entry_conviction INTEGER,
    entry_technicals TEXT DEFAULT '{}',
    sector TEXT,
    notes TEXT,
    tracking TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('full', 'holdings')),
    stock_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scan_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scans(id),
    symbol TEXT NOT NULL,
    composite_score REAL NOT NULL,
    conviction INTEGER NOT NULL,
    sector TEXT,
    data TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    message TEXT NOT NULL,
    dismissed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS performance_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_value REAL NOT NULL,
    cash REAL NOT NULL,
    holdings_value REAL NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    threshold INTEGER NOT NULL DEFAULT 7,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calibration (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trading_rules (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scan_candidates_scan ON scan_candidates(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_candidates_symbol ON scan_candidates(symbol);
CREATE INDEX IF NOT EXISTS idx_alerts_dismissed ON alerts(dismissed);
CREATE INDEX IF NOT EXISTS idx_closed_trades_symbol ON closed_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_transactions_symbol ON transactions(symbol);
`;

function initDB(dbPathOrInstance) {
    let db;
    if (typeof dbPathOrInstance === 'object' && dbPathOrInstance !== null) {
        // Already a database instance (for testing with shim)
        db = dbPathOrInstance;
    } else {
        const Database = require('better-sqlite3');
        db = new Database(dbPathOrInstance);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }

    // Execute schema
    db.exec(SCHEMA);

    // Ensure default portfolio row exists
    const row = db.prepare('SELECT id FROM portfolio WHERE id = 1').get();
    if (!row) {
        db.prepare('INSERT INTO portfolio (id, cash, settings) VALUES (1, 100000, ?)').run(JSON.stringify({
            scanEnabled: true,
            notificationsEnabled: true
        }));
    }

    // Ensure default calibration row
    const calRow = db.prepare('SELECT id FROM calibration WHERE id = 1').get();
    if (!calRow) {
        db.prepare('INSERT INTO calibration (id, data) VALUES (1, ?)').run('{}');
    }

    // Ensure default trading_rules row
    const rulesRow = db.prepare('SELECT id FROM trading_rules WHERE id = 1').get();
    if (!rulesRow) {
        db.prepare('INSERT INTO trading_rules (id, data) VALUES (1, ?)').run('{}');
    }

    return db;
}

// ── Portfolio ──

function getPortfolio(db) {
    const row = db.prepare('SELECT * FROM portfolio WHERE id = 1').get();
    return {
        cash: row.cash,
        settings: JSON.parse(row.settings || '{}'),
        updatedAt: row.updated_at
    };
}

function updatePortfolio(db, updates) {
    if (updates.cash !== undefined) {
        db.prepare('UPDATE portfolio SET cash = ?, updated_at = datetime(\'now\') WHERE id = 1').run(updates.cash);
    }
    if (updates.settings !== undefined) {
        const current = getPortfolio(db);
        const merged = { ...current.settings, ...updates.settings };
        db.prepare('UPDATE portfolio SET settings = ?, updated_at = datetime(\'now\') WHERE id = 1').run(JSON.stringify(merged));
    }
}

// ── Holdings ──

function getHoldings(db) {
    const rows = db.prepare('SELECT * FROM holdings ORDER BY created_at DESC').all();
    return rows.map(r => ({
        id: r.id,
        symbol: r.symbol,
        shares: r.shares,
        avgPrice: r.avg_price,
        entryDate: r.entry_date,
        conviction: r.conviction,
        notes: r.notes,
        thesis: JSON.parse(r.thesis || '{}'),
        entryTechnicals: JSON.parse(r.entry_technicals || '{}'),
        createdAt: r.created_at
    }));
}

// ── Trades ──

function insertTrade(db, trade) {
    const { symbol, action, shares, price, date, conviction, notes, thesis, entryTechnicals } = trade;
    const total = shares * price;

    const txn = db.transaction(() => {
        if (action === 'BUY') {
            // Check if already holding
            const existing = db.prepare('SELECT * FROM holdings WHERE symbol = ?').get(symbol);
            if (existing) {
                // Average up/down
                const newShares = existing.shares + shares;
                const newAvg = ((existing.shares * existing.avg_price) + (shares * price)) / newShares;
                db.prepare('UPDATE holdings SET shares = ?, avg_price = ? WHERE symbol = ?').run(newShares, newAvg, symbol);
            } else {
                db.prepare(`INSERT INTO holdings (symbol, shares, avg_price, entry_date, conviction, notes, thesis, entry_technicals)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                    symbol, shares, price, date, conviction || null, notes || null,
                    JSON.stringify(thesis || {}), JSON.stringify(entryTechnicals || {})
                );
            }
            // Deduct cash
            db.prepare('UPDATE portfolio SET cash = cash - ?, updated_at = datetime(\'now\') WHERE id = 1').run(total);
        } else if (action === 'SELL') {
            const holding = db.prepare('SELECT * FROM holdings WHERE symbol = ?').get(symbol);
            if (!holding) throw new Error(`No holding found for ${symbol}`);
            if (holding.shares < shares) throw new Error(`Insufficient shares: have ${holding.shares}, trying to sell ${shares}`);

            const profitLoss = (price - holding.avg_price) * shares;
            const returnPercent = ((price - holding.avg_price) / holding.avg_price) * 100;
            const holdTimeMs = date && holding.entry_date
                ? new Date(date).getTime() - new Date(holding.entry_date).getTime()
                : null;

            // Insert closed trade
            db.prepare(`INSERT INTO closed_trades (symbol, shares, entry_price, exit_price, entry_date, exit_date,
                profit_loss, return_percent, hold_time_ms, exit_reason, entry_conviction, entry_technicals, sector, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                symbol, shares, holding.avg_price, price, holding.entry_date, date,
                profitLoss, returnPercent, holdTimeMs, trade.exitReason || 'manual',
                holding.conviction, holding.entry_technicals || '{}',
                trade.sector || null, notes || null
            );

            if (holding.shares === shares) {
                db.prepare('DELETE FROM holdings WHERE symbol = ?').run(symbol);
            } else {
                db.prepare('UPDATE holdings SET shares = ? WHERE symbol = ?').run(holding.shares - shares, symbol);
            }
            // Add cash
            db.prepare('UPDATE portfolio SET cash = cash + ?, updated_at = datetime(\'now\') WHERE id = 1').run(total);
        }

        // Record transaction
        const txnResult = db.prepare(`INSERT INTO transactions (symbol, action, shares, price, total, date, conviction, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
            symbol, action, shares, price, total, date, conviction || null, notes || null
        );

        return { transactionId: txnResult.lastInsertRowid };
    });

    return txn();
}

function getClosedTrades(db, options = {}) {
    const { limit = 100, offset = 0 } = options;
    const rows = db.prepare('SELECT * FROM closed_trades ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
    return rows.map(r => ({
        id: r.id,
        symbol: r.symbol,
        shares: r.shares,
        entryPrice: r.entry_price,
        exitPrice: r.exit_price,
        entryDate: r.entry_date,
        exitDate: r.exit_date,
        profitLoss: r.profit_loss,
        returnPercent: r.return_percent,
        holdTime: r.hold_time_ms,
        exitReason: r.exit_reason,
        entryConviction: r.entry_conviction,
        entryTechnicals: JSON.parse(r.entry_technicals || '{}'),
        sector: r.sector,
        notes: r.notes,
        tracking: JSON.parse(r.tracking || '{}')
    }));
}

// ── Scans ──

function insertScan(db, scan) {
    const result = db.prepare('INSERT INTO scans (type, stock_count, duration_ms) VALUES (?, ?, ?)').run(
        scan.type, scan.stockCount || 0, scan.duration || 0
    );
    return result.lastInsertRowid;
}

function insertScanCandidates(db, scanId, candidates) {
    const stmt = db.prepare(`INSERT INTO scan_candidates (scan_id, symbol, composite_score, conviction, sector, data)
        VALUES (?, ?, ?, ?, ?, ?)`);
    const insertMany = db.transaction((items) => {
        for (const c of items) {
            stmt.run(scanId, c.symbol, c.compositeScore, c.conviction, c.sector || null, JSON.stringify(c.data || {}));
        }
    });
    insertMany(candidates);
}

function getLatestScan(db) {
    const scan = db.prepare('SELECT * FROM scans ORDER BY id DESC LIMIT 1').get();
    if (!scan) return null;
    const candidates = db.prepare('SELECT * FROM scan_candidates WHERE scan_id = ? ORDER BY composite_score DESC').all(scan.id);
    return {
        id: scan.id,
        type: scan.type,
        stockCount: scan.stock_count,
        durationMs: scan.duration_ms,
        createdAt: scan.created_at,
        candidates: candidates.map(c => ({
            symbol: c.symbol,
            compositeScore: c.composite_score,
            conviction: c.conviction,
            sector: c.sector,
            data: JSON.parse(c.data || '{}')
        }))
    };
}

function getScanById(db, id) {
    const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(id);
    if (!scan) return null;
    const candidates = db.prepare('SELECT * FROM scan_candidates WHERE scan_id = ? ORDER BY composite_score DESC').all(id);
    return {
        id: scan.id,
        type: scan.type,
        stockCount: scan.stock_count,
        durationMs: scan.duration_ms,
        createdAt: scan.created_at,
        candidates: candidates.map(c => ({
            symbol: c.symbol,
            compositeScore: c.composite_score,
            conviction: c.conviction,
            sector: c.sector,
            data: JSON.parse(c.data || '{}')
        }))
    };
}

function getScans(db, options = {}) {
    const { limit = 20, offset = 0 } = options;
    return db.prepare('SELECT id, type, stock_count, duration_ms, created_at FROM scans ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(limit, offset)
        .map(s => ({
            id: s.id,
            type: s.type,
            stockCount: s.stock_count,
            durationMs: s.duration_ms,
            createdAt: s.created_at
        }));
}

// ── Alerts ──

function insertAlert(db, alert) {
    const result = db.prepare('INSERT INTO alerts (symbol, type, severity, message) VALUES (?, ?, ?, ?)').run(
        alert.symbol, alert.type, alert.severity, alert.message
    );
    return result.lastInsertRowid;
}

function getAlerts(db, includeAll = false) {
    const query = includeAll
        ? 'SELECT * FROM alerts ORDER BY created_at DESC'
        : 'SELECT * FROM alerts WHERE dismissed = 0 ORDER BY created_at DESC';
    return db.prepare(query).all().map(a => ({
        id: a.id,
        symbol: a.symbol,
        type: a.type,
        severity: a.severity,
        message: a.message,
        dismissed: !!a.dismissed,
        createdAt: a.created_at
    }));
}

function dismissAlert(db, id) {
    db.prepare('UPDATE alerts SET dismissed = 1 WHERE id = ?').run(id);
}

// ── Watchlist ──

function getWatchlist(db) {
    return db.prepare('SELECT * FROM watchlist ORDER BY created_at DESC').all().map(w => ({
        id: w.id,
        symbol: w.symbol,
        threshold: w.threshold,
        notes: w.notes,
        createdAt: w.created_at
    }));
}

function addToWatchlist(db, item) {
    db.prepare('INSERT OR REPLACE INTO watchlist (symbol, threshold, notes) VALUES (?, ?, ?)').run(
        item.symbol, item.threshold || 7, item.notes || null
    );
}

function removeFromWatchlist(db, symbol) {
    db.prepare('DELETE FROM watchlist WHERE symbol = ?').run(symbol);
}

function updateWatchlistThreshold(db, symbol, threshold) {
    db.prepare('UPDATE watchlist SET threshold = ? WHERE symbol = ?').run(threshold, symbol);
}

// ── Performance History ──

function getPerformanceHistory(db, options = {}) {
    const { limit = 365 } = options;
    return db.prepare('SELECT * FROM performance_history ORDER BY date ASC LIMIT ?').all(limit).map(p => ({
        id: p.id,
        portfolioValue: p.portfolio_value,
        cash: p.cash,
        holdingsValue: p.holdings_value,
        date: p.date
    }));
}

function insertPerformanceSnapshot(db, snapshot) {
    db.prepare('INSERT INTO performance_history (portfolio_value, cash, holdings_value, date) VALUES (?, ?, ?, ?)').run(
        snapshot.portfolioValue, snapshot.cash, snapshot.holdingsValue, snapshot.date
    );
}

// ── Trading Rules ──

function getTradingRules(db) {
    const row = db.prepare('SELECT data FROM trading_rules WHERE id = 1').get();
    return JSON.parse(row?.data || '{}');
}

function saveTradingRules(db, rules) {
    db.prepare('UPDATE trading_rules SET data = ?, updated_at = datetime(\'now\') WHERE id = 1').run(JSON.stringify(rules));
}

// ── Calibration ──

function getCalibration(db) {
    const row = db.prepare('SELECT data FROM calibration WHERE id = 1').get();
    return JSON.parse(row?.data || '{}');
}

function saveCalibration(db, cal) {
    db.prepare('UPDATE calibration SET data = ?, updated_at = datetime(\'now\') WHERE id = 1').run(JSON.stringify(cal));
}

// ── Stock History (conviction over time) ──

function getStockHistory(db, symbol, options = {}) {
    const { limit = 90 } = options;
    return db.prepare(`
        SELECT sc.composite_score, sc.conviction, sc.sector, s.created_at as scan_date
        FROM scan_candidates sc
        JOIN scans s ON s.id = sc.scan_id
        WHERE sc.symbol = ?
        ORDER BY s.created_at DESC
        LIMIT ?
    `).all(symbol, limit).map(r => ({
        compositeScore: r.composite_score,
        conviction: r.conviction,
        sector: r.sector,
        scanDate: r.scan_date
    })).reverse();
}

// ── Cleanup ──

function cleanOldScanCandidates(db, retentionDays = 90) {
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    const result = db.prepare(`
        DELETE FROM scan_candidates WHERE scan_id IN (
            SELECT id FROM scans WHERE created_at < ?
        )
    `).run(cutoff);
    return result.changes;
}

module.exports = {
    initDB,
    getPortfolio,
    updatePortfolio,
    getHoldings,
    insertTrade,
    getClosedTrades,
    insertScan,
    insertScanCandidates,
    getLatestScan,
    getScanById,
    getScans,
    insertAlert,
    getAlerts,
    dismissAlert,
    getWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    updateWatchlistThreshold,
    getPerformanceHistory,
    insertPerformanceSnapshot,
    getTradingRules,
    saveTradingRules,
    getCalibration,
    saveCalibration,
    getStockHistory,
    cleanOldScanCandidates
};
