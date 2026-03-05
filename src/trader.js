'use strict';

// ══════════════════════════════════════════════════════════════
// APEX Advisory Dashboard — Browser Client
// Thin API client: all data comes from Pi server REST API.
// No analytical logic here — just rendering and user interaction.
// ══════════════════════════════════════════════════════════════

// ── Configuration ──
const API_BASE = window.location.origin;
let API_KEY = localStorage.getItem('apex_api_key') || '';
const PAGE_SIZE = 50;

// ── State ──
let currentPage = 1;
let totalPages = 1;
let sortBy = 'conviction';
let sortDir = 'desc';
let filterSector = '';
let filterConvictionMin = 0;
let filterWatchlistOnly = false;
let scanData = null;
let portfolio = null;
let alerts = [];
let watchlist = [];
let chatMessageCount = 0;
let lastChatTime = 0;

// ── API Client ──
async function apiCall(path, options = {}) {
    const { method = 'GET', body } = options;
    const headers = { 'X-API-Key': API_KEY };
    if (body) headers['Content-Type'] = 'application/json';

    try {
        const resp = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
            throw new Error(err.error || `HTTP ${resp.status}`);
        }
        return await resp.json();
    } catch (e) {
        console.error(`API ${method} ${path} failed:`, e.message);
        throw e;
    }
}

// ── Server Status ──
async function checkServerStatus() {
    const dot = document.getElementById('serverStatusDot');
    const text = document.getElementById('serverStatusText');
    try {
        const health = await apiCall('/api/health');
        if (dot) { dot.className = 'server-status-dot dot connected'; }
        if (text) { text.textContent = 'Connected'; }
        return health;
    } catch (e) {
        if (dot) { dot.className = 'server-status-dot dot disconnected'; }
        if (text) { text.textContent = e.message === 'Unauthorized' ? 'Invalid API key' : 'Disconnected'; }
        return null;
    }
}

// ── Data Loading ──
async function loadPortfolio() {
    try {
        portfolio = await apiCall('/api/portfolio');
        renderPortfolio();
    } catch (e) {
        console.error('Failed to load portfolio:', e.message);
    }
}

async function loadLatestScan() {
    try {
        scanData = await apiCall('/api/scans/latest');
        if (scanData) {
            renderScorecard();
            updateScanInfo();
        }
    } catch (e) {
        console.error('Failed to load scan:', e.message);
    }
}

async function loadAlerts() {
    try {
        alerts = await apiCall('/api/alerts');
        renderAlerts();
        updateAlertBadge();
    } catch (e) {
        console.error('Failed to load alerts:', e.message);
    }
}

async function loadWatchlist() {
    try {
        watchlist = await apiCall('/api/watchlist');
    } catch (e) {
        console.error('Failed to load watchlist:', e.message);
    }
}

async function loadPerformance() {
    try {
        const history = await apiCall('/api/performance');
        renderPerformanceChart(history);
    } catch (e) {
        console.error('Failed to load performance:', e.message);
    }
}

// ── Rendering: Portfolio ──
function renderPortfolio() {
    if (!portfolio) return;

    const holdingsValue = (portfolio.holdings || []).reduce((sum, h) => sum + (h.shares * (h.currentPrice || h.avgPrice)), 0);
    const totalValue = portfolio.cash + holdingsValue;

    setText('portfolioValue', formatCurrency(totalValue));
    setText('cashValue', formatCurrency(portfolio.cash));
    setText('investedValue', formatCurrency(holdingsValue));
    setText('positionsCount', (portfolio.holdings || []).length);

    renderHoldings(portfolio.holdings || []);
}

function renderHoldings(holdings) {
    const list = document.getElementById('holdingsList');
    if (!list) return;

    if (holdings.length === 0) {
        list.innerHTML = '<div class="empty-state">No positions yet</div>';
        return;
    }

    list.innerHTML = holdings.map(h => {
        const currentPrice = h.currentPrice || h.avgPrice;
        const pnl = (currentPrice - h.avgPrice) * h.shares;
        const pnlPercent = ((currentPrice - h.avgPrice) / h.avgPrice * 100);
        const pnlClass = pnl >= 0 ? 'positive' : 'negative';

        return `<div class="holding-item">
            <div class="holding-header">
                <span class="holding-symbol">${h.symbol}</span>
                <span class="holding-pnl ${pnlClass}">${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)} (${pnlPercent.toFixed(1)}%)</span>
            </div>
            <div class="holding-details">
                <span>${h.shares} shares @ ${formatCurrency(h.avgPrice)}</span>
                ${h.thesis?.targets ? `<span class="holding-targets">SL: ${formatCurrency(h.thesis.targets.stopLoss)} | T1: ${formatCurrency(h.thesis.targets.target1)}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ── Rendering: Scorecard ──
function renderScorecard() {
    if (!scanData || !scanData.candidates) return;

    let candidates = [...scanData.candidates];

    // Apply filters
    if (filterSector) {
        candidates = candidates.filter(c => c.sector === filterSector);
    }
    if (filterConvictionMin > 0) {
        candidates = candidates.filter(c => c.conviction >= filterConvictionMin);
    }
    if (filterWatchlistOnly) {
        const watchSymbols = new Set(watchlist.map(w => w.symbol));
        candidates = candidates.filter(c => watchSymbols.has(c.symbol));
    }

    // Sort
    candidates.sort((a, b) => {
        let va, vb;
        if (sortBy === 'conviction') { va = a.conviction; vb = b.conviction; }
        else if (sortBy === 'score') { va = a.compositeScore; vb = b.compositeScore; }
        else if (sortBy === 'symbol') { va = a.symbol; vb = b.symbol; }
        else if (sortBy === 'sector') { va = a.sector || ''; vb = b.sector || ''; }
        else { va = a.compositeScore; vb = b.compositeScore; }

        if (typeof va === 'string') {
            return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return sortDir === 'asc' ? va - vb : vb - va;
    });

    // Paginate
    totalPages = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = candidates.slice(start, start + PAGE_SIZE);

    // Render table
    const tbody = document.getElementById('scorecardBody');
    if (!tbody) return;

    const watchSymbols = new Set(watchlist.map(w => w.symbol));

    tbody.innerHTML = pageItems.map(c => {
        const convClass = c.conviction >= 8 ? 'conviction-high' : c.conviction >= 5 ? 'conviction-mid' : 'conviction-low';
        const isWatched = watchSymbols.has(c.symbol);

        return `<tr class="scorecard-row" onclick="toggleRowExpand(this, '${c.symbol}')">
            <td><span class="watchlist-star ${isWatched ? 'active' : ''}" onclick="event.stopPropagation(); toggleWatchlist('${c.symbol}')">${isWatched ? '\u2605' : '\u2606'}</span></td>
            <td class="symbol-cell">${c.symbol}</td>
            <td class="${convClass}">${c.conviction}</td>
            <td>${c.compositeScore.toFixed(1)}</td>
            <td>${c.sector || '-'}</td>
        </tr>`;
    }).join('');

    // Pagination controls
    setText('pageInfo', `Page ${currentPage} of ${totalPages} (${candidates.length} stocks)`);
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    // Populate sector filter
    populateSectorFilter();
}

function populateSectorFilter() {
    const select = document.getElementById('filterSector');
    if (!select || select.children.length > 1) return;
    if (!scanData?.candidates) return;

    const sectors = [...new Set(scanData.candidates.map(c => c.sector).filter(Boolean))].sort();
    for (const s of sectors) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        select.appendChild(opt);
    }
}

function toggleRowExpand(row, symbol) {
    const existing = row.nextElementSibling;
    if (existing && existing.classList.contains('expanded-row')) {
        existing.remove();
        return;
    }

    // Remove other expanded rows
    document.querySelectorAll('.expanded-row').forEach(r => r.remove());

    const candidate = scanData?.candidates?.find(c => c.symbol === symbol);
    if (!candidate) return;

    const data = candidate.data || {};
    const expandedRow = document.createElement('tr');
    expandedRow.className = 'expanded-row';
    expandedRow.innerHTML = `<td colspan="5">
        <div class="expanded-content">
            <div class="score-breakdown">
                ${data.breakdown ? Object.entries(data.breakdown).map(([k, v]) =>
                    `<div class="breakdown-item"><span class="breakdown-label">${k}</span><span class="breakdown-value">${typeof v === 'number' ? v.toFixed(2) : v}</span></div>`
                ).join('') : '<span class="text-muted">No breakdown available</span>'}
            </div>
            ${data.news ? `<div class="news-section"><strong>News:</strong> ${data.news.map(n => n.title).join(' | ')}</div>` : ''}
        </div>
    </td>`;
    row.after(expandedRow);
}

// ── Rendering: Alerts ──
function renderAlerts() {
    const container = document.getElementById('alertsList');
    if (!container) return;

    if (alerts.length === 0) {
        container.innerHTML = '<div class="empty-state">No active alerts</div>';
        return;
    }

    container.innerHTML = alerts.map(a => `
        <div class="alert-item ${a.severity}">
            <span class="alert-badge ${a.severity}">${a.severity}</span>
            <span class="alert-symbol">${a.symbol}</span>
            <span class="alert-message">${a.message}</span>
            <button class="dismiss-btn" onclick="dismissAlert(${a.id})">&times;</button>
        </div>
    `).join('');
}

function updateAlertBadge() {
    const badge = document.getElementById('alertBadge');
    if (badge) {
        if (alerts.length > 0) {
            badge.textContent = alerts.length;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }
}

// ── Rendering: Performance Chart ──
let perfChart = null;

function renderPerformanceChart(history) {
    const canvas = document.getElementById('performanceChart');
    if (!canvas || !history || history.length === 0) return;

    if (typeof Chart === 'undefined') return;

    const labels = history.map(p => p.date);
    const values = history.map(p => p.portfolioValue);

    if (perfChart) perfChart.destroy();

    perfChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Portfolio Value',
                data: values,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: '#888', maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#888', callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// ── Actions ──
async function triggerScan() {
    const btn = document.querySelector('.scan-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Scanning...'; }
    try {
        await apiCall('/api/scans/trigger', { method: 'POST' });
        // Poll for completion
        let attempts = 0;
        const poll = setInterval(async () => {
            attempts++;
            try {
                const newScan = await apiCall('/api/scans/latest');
                if (newScan && (!scanData || newScan.id !== scanData.id)) {
                    clearInterval(poll);
                    scanData = newScan;
                    renderScorecard();
                    updateScanInfo();
                    if (btn) { btn.disabled = false; btn.textContent = 'Scan Market'; }
                }
            } catch { /* keep polling */ }
            if (attempts > 120) { // 2 minutes timeout
                clearInterval(poll);
                if (btn) { btn.disabled = false; btn.textContent = 'Scan Market'; }
            }
        }, 1000);
    } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Scan Market'; }
        showToast(`Scan failed: ${e.message}`, 'error');
    }
}

async function dismissAlert(id) {
    try {
        await apiCall(`/api/alerts/${id}/dismiss`, { method: 'PUT' });
        alerts = alerts.filter(a => a.id !== id);
        renderAlerts();
        updateAlertBadge();
    } catch (e) {
        showToast(`Failed to dismiss: ${e.message}`, 'error');
    }
}

async function toggleWatchlist(symbol) {
    const isWatched = watchlist.some(w => w.symbol === symbol);
    try {
        if (isWatched) {
            await apiCall(`/api/watchlist/${symbol}`, { method: 'DELETE' });
            watchlist = watchlist.filter(w => w.symbol !== symbol);
        } else {
            await apiCall('/api/watchlist', { method: 'POST', body: { symbol, threshold: 7 } });
            watchlist.push({ symbol, threshold: 7 });
        }
        renderScorecard();
    } catch (e) {
        showToast(`Watchlist update failed: ${e.message}`, 'error');
    }
}

// ── Trade Modal ──
function openTradeModal() {
    const modal = document.getElementById('tradeModal');
    if (modal) modal.classList.add('active');
    // Default date to today
    const dateInput = document.getElementById('tradeDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
}

function closeTradeModal() {
    const modal = document.getElementById('tradeModal');
    if (modal) modal.classList.remove('active');
}

async function submitTrade() {
    const symbol = document.getElementById('tradeSymbol')?.value?.toUpperCase()?.trim();
    const action = document.querySelector('input[name="tradeAction"]:checked')?.value;
    const shares = parseFloat(document.getElementById('tradeShares')?.value);
    const price = parseFloat(document.getElementById('tradePrice')?.value);
    const date = document.getElementById('tradeDate')?.value;
    const conviction = parseInt(document.getElementById('tradeConviction')?.value) || 5;
    const notes = document.getElementById('tradeNotes')?.value?.trim();

    if (!symbol || !action || !shares || !price) {
        showToast('Fill in all required fields', 'error');
        return;
    }

    try {
        await apiCall('/api/trades', {
            method: 'POST',
            body: { symbol, action, shares, price, date, conviction, notes }
        });
        closeTradeModal();
        showToast(`${action} ${shares} ${symbol} @ ${formatCurrency(price)}`, 'success');
        await loadPortfolio();
    } catch (e) {
        showToast(`Trade failed: ${e.message}`, 'error');
    }
}

function updateConvictionDisplay() {
    const slider = document.getElementById('tradeConviction');
    const display = document.getElementById('convictionDisplay');
    if (slider && display) {
        const val = parseInt(slider.value);
        display.textContent = val;
        display.className = 'conviction-value ' + (val >= 8 ? 'conviction-high' : val >= 5 ? 'conviction-mid' : 'conviction-low');
    }
}

// ── Chat ──
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input?.value?.trim();
    if (!message) return;

    const now = Date.now();
    if (now - lastChatTime < 5000) {
        addChatMessage('Please wait a few seconds between messages.', 'system');
        return;
    }
    if (chatMessageCount >= 20) {
        addChatMessage('Session limit reached (20). Refresh to start a new session.', 'system');
        return;
    }
    lastChatTime = now;
    chatMessageCount++;

    addChatMessage(message, 'user');
    input.value = '';

    try {
        const data = await apiCall('/api/chat', { method: 'POST', body: { message } });
        addChatMessage(data.response || data.error || 'No response', 'assistant');
    } catch (e) {
        addChatMessage(`Error: ${e.message}`, 'system');
    }
}

function addChatMessage(text, role) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `chat-message ${role}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ── Learning Insights ──
async function loadLearningInsights() {
    try {
        const data = await apiCall('/api/learning');
        renderLearningInsights(data);
    } catch (e) {
        console.error('Failed to load learning insights:', e.message);
    }
}

function renderLearningInsights(data) {
    const container = document.getElementById('learningContent');
    if (!container) return;

    const { trades, rules } = data;
    if (!trades || trades.length < 3) {
        container.innerHTML = '<div class="empty-state">Need at least 3 closed trades for insights</div>';
        return;
    }

    const wins = trades.filter(t => t.profitLoss > 0).length;
    const losses = trades.filter(t => t.profitLoss < 0).length;
    const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(0) : 0;
    const avgWin = wins > 0 ? trades.filter(t => t.profitLoss > 0).reduce((s, t) => s + t.returnPercent, 0) / wins : 0;
    const avgLoss = losses > 0 ? trades.filter(t => t.profitLoss < 0).reduce((s, t) => s + t.returnPercent, 0) / losses : 0;

    // By conviction level
    const byConviction = {};
    trades.forEach(t => {
        const bucket = t.entryConviction >= 9 ? '9-10' : t.entryConviction >= 7 ? '7-8' : t.entryConviction >= 5 ? '5-6' : '1-4';
        if (!byConviction[bucket]) byConviction[bucket] = { wins: 0, total: 0, totalReturn: 0 };
        byConviction[bucket].total++;
        byConviction[bucket].totalReturn += t.returnPercent || 0;
        if (t.profitLoss > 0) byConviction[bucket].wins++;
    });

    container.innerHTML = `
        <div class="learning-summary">
            <div class="learning-stat"><span class="label">Win Rate</span><span class="value ${winRate >= 50 ? 'conviction-high' : 'conviction-low'}">${winRate}%</span></div>
            <div class="learning-stat"><span class="label">Trades</span><span class="value">${trades.length}</span></div>
            <div class="learning-stat"><span class="label">Avg Win</span><span class="value conviction-high">+${avgWin.toFixed(1)}%</span></div>
            <div class="learning-stat"><span class="label">Avg Loss</span><span class="value conviction-low">${avgLoss.toFixed(1)}%</span></div>
        </div>
        <div class="conviction-table">
            <div class="conviction-header">Win Rate by Conviction</div>
            ${Object.entries(byConviction).sort().map(([bucket, d]) => {
                const wr = d.total > 0 ? ((d.wins / d.total) * 100).toFixed(0) : 0;
                return `<div class="conviction-row">
                    <span>${bucket}</span>
                    <span>${wr}% (${d.wins}/${d.total})</span>
                    <span>Avg: ${(d.totalReturn / d.total).toFixed(1)}%</span>
                </div>`;
            }).join('')}
        </div>
        ${rules?.rules?.length > 0 ? `
        <div class="trading-rules-section">
            <div class="conviction-header">Derived Trading Rules</div>
            ${rules.rules.slice(0, 10).map(r => `
                <div class="rule-item ${r.type}">
                    <span class="rule-type ${r.type}">${r.type}</span>
                    <span class="rule-desc">${r.description || r.id}</span>
                </div>
            `).join('')}
        </div>` : ''}
    `;
}

// ── Calibration UI ──
async function triggerCalibration() {
    const btn = document.getElementById('calibrateBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Calibrating...'; }
    try {
        await apiCall('/api/calibrate', { method: 'POST' });
        showToast('Calibration started — this may take a few minutes', 'info');
    } catch (e) {
        showToast(`Calibration failed: ${e.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Run Calibration'; }
    }
}

async function loadCalibration() {
    try {
        const cal = await apiCall('/api/stock/calibration/history'); // Will 404 for now, that's fine
        renderCalibration(cal);
    } catch { /* not yet available */ }
}

function renderCalibration(cal) {
    const container = document.getElementById('calibrationContent');
    if (!container || !cal || !cal.weights) return;
    container.innerHTML = `
        <div class="calibration-info">
            <div class="cal-stat"><span>Last Calibrated:</span><span>${cal.timestamp ? new Date(cal.timestamp).toLocaleDateString() : 'Never'}</span></div>
            <div class="cal-stat"><span>Data Points:</span><span>${cal.dataPoints || '-'}</span></div>
            <div class="cal-stat"><span>Improvement:</span><span>${cal.validation?.improvement?.toFixed(2) || '-'}%</span></div>
        </div>
    `;
}

// ── Conviction Evolution (sparkline) ──
async function loadConvictionHistory(symbol) {
    try {
        const history = await apiCall(`/api/stock/${symbol}/history`);
        return history;
    } catch {
        return [];
    }
}

// ── Scorecard controls ──
function changeSort(value) {
    sortBy = value;
    currentPage = 1;
    renderScorecard();
}

function changeSectorFilter(value) {
    filterSector = value;
    currentPage = 1;
    renderScorecard();
}

function changeConvictionFilter(value) {
    filterConvictionMin = parseInt(value) || 0;
    currentPage = 1;
    renderScorecard();
}

function toggleWatchlistFilter() {
    filterWatchlistOnly = !filterWatchlistOnly;
    currentPage = 1;
    renderScorecard();
}

function prevPage() {
    if (currentPage > 1) { currentPage--; renderScorecard(); }
}

function nextPage() {
    if (currentPage < totalPages) { currentPage++; renderScorecard(); }
}

// ── Section toggling ──
function toggleSection(sectionId) {
    const body = document.getElementById(sectionId + 'Body');
    const toggle = document.getElementById(sectionId + 'Toggle');
    if (body) body.classList.toggle('collapsed');
    if (toggle) toggle.classList.toggle('collapsed');
}

// ── Scan info ──
function updateScanInfo() {
    if (!scanData) return;
    const info = document.getElementById('scanInfo');
    if (info) {
        const time = new Date(scanData.createdAt).toLocaleTimeString();
        info.textContent = `Last scan: ${time} (${scanData.stockCount} stocks, ${(scanData.durationMs / 1000).toFixed(1)}s)`;
    }
}

// ── Utilities ──
function formatCurrency(n) {
    if (n == null) return '-';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── API Key Prompt ──
function promptForApiKey() {
    const key = prompt('Enter your APEX API secret (from .env on the Pi):');
    if (key && key.trim()) {
        API_KEY = key.trim();
        localStorage.setItem('apex_api_key', API_KEY);
        return true;
    }
    return false;
}

function clearApiKey() {
    API_KEY = '';
    localStorage.removeItem('apex_api_key');
}

// ── Initialization ──
async function init() {
    // If no API key stored, prompt for it
    if (!API_KEY) {
        if (!promptForApiKey()) {
            const text = document.getElementById('serverStatusText');
            if (text) text.textContent = 'API key required';
            return;
        }
    }

    // Test the key
    const health = await checkServerStatus();
    if (!health) {
        // Key might be wrong — offer to re-enter
        clearApiKey();
        if (promptForApiKey()) {
            return init(); // Retry with new key
        }
        return;
    }

    await Promise.all([
        loadPortfolio(),
        loadLatestScan(),
        loadAlerts(),
        loadWatchlist(),
        loadPerformance(),
        loadLearningInsights()
    ]);

    // Health check every 30s
    setInterval(checkServerStatus, 30000);

    // Refresh data every 60s
    setInterval(async () => {
        await loadAlerts();
        await loadPortfolio();
    }, 60000);
}

// Start on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
