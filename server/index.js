'use strict';

const path = require('path');
const config = require('./config');
const dbModule = require('./db');
const { createApp } = require('./api');
const { buildScanFunctions } = require('./scan-pipeline');
const { startScheduler, runFullScan } = require('./scheduler');

// Initialize database
const dbPath = path.join(__dirname, '..', 'data', 'apex.db');
const db = dbModule.initDB(dbPath);

// Build scan pipeline (wires core modules → scheduler interface)
const scanFns = buildScanFunctions(db, config);

// Create Express app with scan pipeline wired in
const app = createApp(db, config.API_SECRET, { scanFns, config, runFullScan });

// Serve static files from public/
app.use(require('express').static(path.join(__dirname, '..', 'public')));

// Start scheduled scans (cron jobs)
startScheduler(db, scanFns);

// Start server
const PORT = config.PORT;
app.listen(PORT, () => {
    console.log(`APEX server running on port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
});

module.exports = { app, db };
