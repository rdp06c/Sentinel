'use strict';

// Shim that wraps sql.js (pure JS SQLite) to match better-sqlite3's synchronous API.
// Used for dev/test on machines without native compilation toolchain.
// Production Pi uses better-sqlite3 directly.

const initSqlJs = require('sql.js');

let SQL = null;

async function createDatabase() {
    if (!SQL) {
        SQL = await initSqlJs();
    }
    const rawDb = new SQL.Database();

    // Wrap sql.js in better-sqlite3-compatible API
    const db = {
        _raw: rawDb,
        open: true,

        exec(sql) {
            rawDb.run(sql);
        },

        pragma(str) {
            try { rawDb.run(`PRAGMA ${str}`); } catch (e) { /* ignore unsupported pragmas */ }
        },

        prepare(sql) {
            return {
                _sql: sql,
                run(...params) {
                    rawDb.run(sql, params);
                    // Simulate better-sqlite3's RunResult
                    const lastId = rawDb.exec('SELECT last_insert_rowid() as id');
                    const changes = rawDb.exec('SELECT changes() as c');
                    return {
                        lastInsertRowid: lastId[0]?.values[0]?.[0] || 0,
                        changes: changes[0]?.values[0]?.[0] || 0
                    };
                },
                get(...params) {
                    const stmt = rawDb.prepare(sql);
                    stmt.bind(params);
                    if (stmt.step()) {
                        const cols = stmt.getColumnNames();
                        const vals = stmt.get();
                        const row = {};
                        cols.forEach((c, i) => { row[c] = vals[i]; });
                        stmt.free();
                        return row;
                    }
                    stmt.free();
                    return undefined;
                },
                all(...params) {
                    const results = [];
                    const stmt = rawDb.prepare(sql);
                    stmt.bind(params);
                    while (stmt.step()) {
                        const cols = stmt.getColumnNames();
                        const vals = stmt.get();
                        const row = {};
                        cols.forEach((c, i) => { row[c] = vals[i]; });
                        results.push(row);
                    }
                    stmt.free();
                    return results;
                }
            };
        },

        transaction(fn) {
            return (...args) => {
                rawDb.run('BEGIN');
                try {
                    const result = fn(...args);
                    rawDb.run('COMMIT');
                    return result;
                } catch (e) {
                    rawDb.run('ROLLBACK');
                    throw e;
                }
            };
        },

        close() {
            rawDb.close();
            db.open = false;
        }
    };

    return db;
}

module.exports = { createDatabase };
