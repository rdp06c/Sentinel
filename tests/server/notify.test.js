'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { sendNotification, sendScanSummary, sendAlertNotification, sendErrorNotification } = require('../../server/notify');

describe('notify', () => {
    it('sendNotification returns not sent when no topic', async () => {
        const result = await sendNotification('', { title: 'test', message: 'hi' });
        assert.equal(result.sent, false);
        assert.equal(result.reason, 'no topic configured');
    });

    it('sendNotification returns not sent for null topic', async () => {
        const result = await sendNotification(null, { title: 'test', message: 'hi' });
        assert.equal(result.sent, false);
    });

    it('sendScanSummary does not throw without topic', async () => {
        const result = await sendScanSummary('', { type: 'full', stockCount: 490, durationMs: 12000 });
        assert.equal(result, undefined);
    });

    it('sendAlertNotification does not throw without topic', async () => {
        const result = await sendAlertNotification('', { symbol: 'NVDA', type: 'choch', severity: 'critical', message: 'test' });
        assert.equal(result, undefined);
    });

    it('sendErrorNotification does not throw without topic', async () => {
        const result = await sendErrorNotification('', new Error('test error'));
        assert.equal(result, undefined);
    });
});
