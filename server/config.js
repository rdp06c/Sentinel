'use strict';

require('dotenv').config();

const config = {
    MASSIVE_API_KEY: process.env.MASSIVE_API_KEY || '',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    NTFY_TOPIC: process.env.NTFY_TOPIC || '',
    API_SECRET: process.env.API_SECRET || '',
    PORT: parseInt(process.env.PORT, 10) || 4000,

    // Scan schedule (ET times, weekdays only)
    schedule: {
        fullScans: ['9:35', '12:30', '16:05'],
        holdingsScans: ['11:00', '15:00'],
        timezone: 'America/New_York'
    },

    // Data retention
    retention: {
        scanCandidatesDays: 90,
        backupCount: 30
    }
};

module.exports = config;
