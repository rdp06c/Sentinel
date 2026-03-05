'use strict';

// ntfy.sh integration for push notifications
// Docs: https://ntfy.sh/docs/publish/

const PRIORITY_MAP = {
    critical: 'urgent',
    high: 'high',
    medium: 'default',
    low: 'low'
};

async function sendNotification(topic, { title, message, priority = 'medium', tags = [] }) {
    if (!topic) return { sent: false, reason: 'no topic configured' };

    const ntfyPriority = PRIORITY_MAP[priority] || 'default';

    try {
        const resp = await fetch(`https://ntfy.sh/${topic}`, {
            method: 'POST',
            headers: {
                'Title': title || 'APEX Alert',
                'Priority': ntfyPriority,
                'Tags': tags.join(',')
            },
            body: message
        });

        if (!resp.ok) {
            return { sent: false, reason: `HTTP ${resp.status}` };
        }
        return { sent: true };
    } catch (e) {
        return { sent: false, reason: e.message };
    }
}

async function sendScanSummary(topic, scan) {
    if (!topic) return;
    const { type, stockCount, durationMs, topCandidates = [] } = scan;
    const top3 = topCandidates.slice(0, 3).map(c => `${c.symbol}(${c.conviction})`).join(', ');
    const message = `${type === 'full' ? 'Full' : 'Holdings'} scan: ${stockCount} stocks in ${Math.round(durationMs / 1000)}s${top3 ? `\nTop: ${top3}` : ''}`;
    return sendNotification(topic, { title: 'Scan Complete', message, priority: 'low', tags: ['chart_with_upwards_trend'] });
}

async function sendAlertNotification(topic, alert) {
    if (!topic) return;
    const { symbol, type, severity, message } = alert;
    const tags = severity === 'critical' ? ['rotating_light'] : severity === 'high' ? ['warning'] : ['information_source'];
    return sendNotification(topic, {
        title: `${severity.toUpperCase()}: ${symbol}`,
        message: `${type}: ${message}`,
        priority: severity,
        tags
    });
}

async function sendErrorNotification(topic, error) {
    if (!topic) return;
    return sendNotification(topic, {
        title: 'APEX Error',
        message: typeof error === 'string' ? error : error.message || 'Unknown error',
        priority: 'high',
        tags: ['x']
    });
}

module.exports = {
    sendNotification,
    sendScanSummary,
    sendAlertNotification,
    sendErrorNotification
};
