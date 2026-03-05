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
let closedTrades = [];
let transactions = [];
let chatMessageCount = 0;
let lastChatTime = 0;
let stockNames = {}; // loaded from /api/stock-names

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
        renderHoldingsDetail();
    } catch (e) {
        console.error('Failed to load portfolio:', e.message);
    }
}

async function loadLatestScan() {
    try {
        scanData = await apiCall('/api/scans/latest');
        if (scanData) {
            populateSectorFilter();
            renderScorecard();
            updateScanInfo();
            renderRegimeBanner();
            renderSectorRotation();
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

async function loadLearningInsights() {
    try {
        const data = await apiCall('/api/learning');
        closedTrades = data.trades || [];
        renderLearningInsights(data);
        renderPerformanceAnalytics();
    } catch (e) {
        console.error('Failed to load learning insights:', e.message);
    }
}

async function loadTrades() {
    try {
        transactions = await apiCall('/api/trades?limit=50');
        renderTradeJournal();
        renderActivityFeed();
    } catch (e) {
        console.error('Failed to load trades:', e.message);
    }
}

async function loadCalibration() {
    try {
        const cal = await apiCall('/api/calibration');
        renderCalibration(cal);
    } catch { /* calibration may not be available yet */ }
}

async function loadStockNames() {
    try {
        stockNames = await apiCall('/api/stock-names');
    } catch { /* non-critical */ }
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
    renderSectorChart(portfolio.holdings || []);
}

function renderHoldings(holdings) {
    const list = document.getElementById('holdingsList');
    if (!list) return;

    if (holdings.length === 0) {
        list.innerHTML = '<div class="empty-state">No positions yet</div>';
        return;
    }

    // Enrich with latest scan prices
    const candidateLookup = {};
    if (scanData?.candidates) {
        for (const c of scanData.candidates) candidateLookup[c.symbol] = c;
    }

    list.innerHTML = holdings.map(h => {
        const scan = candidateLookup[h.symbol];
        const scanPrice = scan?.data?.price;
        const currentPrice = scanPrice || h.currentPrice || h.avgPrice;
        const changePercent = scan?.data?.changePercent;
        const changeClass = changePercent > 0 ? 'positive' : changePercent < 0 ? 'negative' : '';

        return `<div class="sidebar-holding-compact">
            <div class="compact-left">
                <span class="compact-symbol">${h.symbol}</span>
                <span class="compact-shares">${h.shares} shares</span>
            </div>
            <div class="compact-right">
                <span class="compact-price">${formatCurrency(currentPrice)}</span>
                ${changePercent != null ? `<span class="compact-daily ${changeClass}">${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ── Rendering: Holdings Detail (main content grid) ──
function renderHoldingsDetail() {
    const grid = document.getElementById('holdingsDetailGrid');
    if (!grid || !portfolio) return;

    const holdings = portfolio.holdings || [];
    if (holdings.length === 0) {
        grid.innerHTML = '<div class="empty-state">No positions yet</div>';
        return;
    }

    // Enrich holdings with scan data
    const candidateLookup = {};
    if (scanData?.candidates) {
        for (const c of scanData.candidates) candidateLookup[c.symbol] = c;
    }

    grid.innerHTML = holdings.map(h => {
        const scan = candidateLookup[h.symbol];
        const scanD = scan?.data || {};
        const currentPrice = scanD.price || h.currentPrice || h.avgPrice;
        const pnl = (currentPrice - h.avgPrice) * h.shares;
        const pnlPercent = h.avgPrice ? ((currentPrice - h.avgPrice) / h.avgPrice * 100) : 0;
        const pnlClass = pnl >= 0 ? 'positive' : 'negative';
        const value = h.shares * currentPrice;
        const thesis = h.thesis || {};
        const sector = scan?.sector || thesis.sector || '';
        const dayChange = scanD.changePercent;
        const dayClass = dayChange > 0 ? 'positive' : dayChange < 0 ? 'negative' : '';

        return `<div class="holding-card">
            <div class="holding-card-header">
                <div>
                    <div class="holding-card-symbol">${h.symbol}</div>
                    ${sector ? `<div class="holding-card-sector">${sector}</div>` : ''}
                    <div class="holding-card-shares">${h.shares} shares @ ${formatCurrency(h.avgPrice)}</div>
                </div>
                <div>
                    <div class="holding-card-value">${formatCurrency(value)}</div>
                    <div class="holding-card-gainloss ${pnlClass}">${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)} (${pnlPercent.toFixed(1)}%)</div>
                    ${dayChange != null ? `<div class="holding-card-daily ${dayClass}">${dayChange >= 0 ? '+' : ''}${dayChange.toFixed(2)}% today</div>` : ''}
                </div>
            </div>
            ${thesis.targets ? `<div class="holding-card-timeframe">
                <span style="color:var(--red)">Stop Loss: ${formatCurrency(thesis.targets.stopLoss)}</span>
                &nbsp;\u2022&nbsp;
                <span style="color:var(--green)">Target 1: ${formatCurrency(thesis.targets.target1)}</span>
                ${thesis.targets.target2 ? `&nbsp;\u2022&nbsp;<span style="color:var(--green)">Target 2: ${formatCurrency(thesis.targets.target2)}</span>` : ''}
                ${thesis.targets.riskReward ? `<div class="holding-card-timeframe-warning">R:R ${thesis.targets.riskReward.toFixed(1)}</div>` : ''}
            </div>` : ''}
            <div class="holding-card-footer">
                <div>
                    <span class="holding-card-footer-label">Entry: </span>
                    <span class="holding-card-footer-value">${h.entryDate ? new Date(h.entryDate).toLocaleDateString() : '-'}</span>
                </div>
                <div>
                    <span class="holding-card-footer-label">Conv: </span>
                    <span class="holding-card-footer-value ${h.conviction >= 8 ? 'conviction-high' : h.conviction >= 5 ? 'conviction-mid' : 'conviction-low'}">${h.conviction || '-'}/10</span>
                </div>
                ${scanD.rsi != null ? `<div>
                    <span class="holding-card-footer-label">RSI: </span>
                    <span class="holding-card-footer-value ${scanD.rsi > 70 ? 'negative' : scanD.rsi < 30 ? 'positive' : ''}">${Math.round(scanD.rsi)}</span>
                </div>` : ''}
                ${scanD.structure ? `<div>
                    <span class="holding-card-footer-label">Structure: </span>
                    <span class="holding-card-footer-value">${scanD.structure.structure || '-'}</span>
                </div>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ── Rendering: Scorecard ──
function renderScorecard() {
    if (!scanData || !scanData.candidates) return;

    let candidates = [...scanData.candidates];

    // Read filters from DOM
    const sortSelect = document.getElementById('scorecardSort');
    const sectorSelect = document.getElementById('scorecardSectorFilter');
    const convictionSelect = document.getElementById('scorecardConvictionMin');
    const watchlistCheckbox = document.getElementById('scorecardWatchlistOnly');

    if (sortSelect) sortBy = sortSelect.value;
    if (sectorSelect) filterSector = sectorSelect.value === 'all' ? '' : sectorSelect.value;
    if (convictionSelect) filterConvictionMin = parseInt(convictionSelect.value) || 0;
    if (watchlistCheckbox) filterWatchlistOnly = watchlistCheckbox.checked;

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

    // Render
    const container = document.getElementById('candidateScorecardContent');
    if (!container) return;

    const watchSymbols = new Set(watchlist.map(w => w.symbol));

    // Check which symbols are held
    const heldSymbols = new Set((portfolio?.holdings || []).map(h => h.symbol));

    if (pageItems.length === 0) {
        container.innerHTML = '<div class="empty-state">No candidates match your filters</div>';
    } else {
        container.innerHTML = `<div class="scorecard-table-wrap"><table class="scorecard-table">
            <thead><tr>
                <th></th>
                <th>#</th>
                <th>Symbol</th>
                <th>Score</th>
                <th>Conv</th>
                <th>Day</th>
                <th>Mom</th>
                <th>RS</th>
                <th>RSI</th>
                <th>MACD</th>
                <th>Sector</th>
                <th>Structure</th>
                <th>Vol</th>
            </tr></thead>
            <tbody>${pageItems.map((c, idx) => {
                const d = c.data || {};
                const rank = start + idx + 1;
                const convClass = c.conviction >= 8 ? 'conviction-high' : c.conviction >= 5 ? 'conviction-mid' : 'conviction-low';
                const isWatched = watchSymbols.has(c.symbol);
                const isHeld = heldSymbols.has(c.symbol);

                // Score bar
                const scoreMax = 20;
                const scorePct = Math.min((c.compositeScore / scoreMax) * 100, 100);
                const scoreClass = c.compositeScore >= 12 ? 'score-high' : c.compositeScore >= 8 ? 'score-mid' : c.compositeScore >= 4 ? 'score-low' : 'score-poor';

                // Day change
                const dayChange = d.changePercent;
                const dayClass = dayChange > 0 ? 'positive' : dayChange < 0 ? 'negative' : '';

                // Momentum
                const momScore = d.momentum?.score ?? '--';

                // RS
                const rsScore = d.rs?.rsScore ?? '--';

                // RSI
                const rsi = d.rsi != null ? Math.round(d.rsi) : '--';
                const rsiClass = d.rsi > 70 ? 'negative' : d.rsi < 30 ? 'positive' : '';

                // MACD
                let macdLabel = '--';
                let macdClass = '';
                if (d.macd) {
                    if (d.macd.crossover === 'bullish') { macdLabel = '\u25b2 Cross'; macdClass = 'positive'; }
                    else if (d.macd.crossover === 'bearish') { macdLabel = '\u25bc Cross'; macdClass = 'negative'; }
                    else if (d.macd.histogram > 0) { macdLabel = '\u25b2'; macdClass = 'positive'; }
                    else if (d.macd.histogram < 0) { macdLabel = '\u25bc'; macdClass = 'negative'; }
                    else { macdLabel = '--'; }
                }

                // Structure
                const structure = d.structure?.structure || '--';

                // Volume
                const volRatio = d.volume?.ratio;
                const volClass = volRatio >= 1.5 ? 'positive' : volRatio <= 0.7 ? 'negative' : '';

                return `<tr class="scorecard-row" onclick="toggleRowExpand(this, '${c.symbol}')">
                    <td><span class="watchlist-star ${isWatched ? 'active' : ''}" onclick="event.stopPropagation(); toggleWatchlist('${c.symbol}')">${isWatched ? '\u2605' : '\u2606'}</span></td>
                    <td class="scorecard-rank">${rank}</td>
                    <td><span class="scorecard-symbol">${c.symbol}</span>${isHeld ? '<span class="scorecard-held-badge">HELD</span>' : ''}${stockNames[c.symbol] ? `<div style="font-size:10px;color:var(--text-muted);margin-top:1px">${stockNames[c.symbol]}</div>` : ''}</td>
                    <td><div class="scorecard-score-cell"><div class="scorecard-bar"><div class="scorecard-bar-fill ${scoreClass}" style="width:${scorePct}%"></div></div><span class="scorecard-score-num ${scoreClass}">${c.compositeScore.toFixed(1)}</span></div></td>
                    <td class="${convClass}">${c.conviction}</td>
                    <td class="${dayClass}">${dayChange != null ? (dayChange >= 0 ? '+' : '') + dayChange.toFixed(2) + '%' : '--'}</td>
                    <td>${momScore}</td>
                    <td>${rsScore}</td>
                    <td class="${rsiClass}">${rsi}</td>
                    <td class="${macdClass}">${macdLabel}</td>
                    <td>${c.sector || '-'}</td>
                    <td>${structure}</td>
                    <td class="${volClass}">${volRatio != null ? volRatio.toFixed(1) + 'x' : '--'}</td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>`;
    }

    // Pagination controls
    const pageIndicator = document.getElementById('scorecardPageIndicator');
    if (pageIndicator) pageIndicator.textContent = `Page ${currentPage} of ${totalPages} (${candidates.length} stocks)`;
    const prevBtn = document.getElementById('scorecardPrevBtn');
    const nextBtn = document.getElementById('scorecardNextBtn');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function populateSectorFilter() {
    const select = document.getElementById('scorecardSectorFilter');
    if (!select || !scanData || !scanData.candidates) return;

    // Collect unique sectors from actual data
    const sectors = [...new Set(scanData.candidates.map(c => c.sector).filter(Boolean))].sort();
    const current = select.value;

    // Rebuild options
    select.innerHTML = '<option value="all">All Sectors</option>';
    for (const s of sectors) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        select.appendChild(opt);
    }

    // Restore previous selection if still valid
    if (current && sectors.includes(current)) {
        select.value = current;
    }
}

function applyScorecardFilters() {
    currentPage = 1;
    renderScorecard();
}

function scorecardPrevPage() {
    if (currentPage > 1) { currentPage--; renderScorecard(); }
}

function scorecardNextPage() {
    if (currentPage < totalPages) { currentPage++; renderScorecard(); }
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

    const d = candidate.data || {};
    const bd = d.breakdown || {};
    const expandedRow = document.createElement('tr');
    expandedRow.className = 'expanded-row';

    // Format breakdown entries with coloring
    const breakdownEntries = Object.entries(bd).map(([k, v]) => {
        const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        const val = typeof v === 'number' ? v.toFixed(2) : v;
        const cls = v > 0 ? 'positive' : v < 0 ? 'negative' : '';
        return `<div class="breakdown-item"><span class="breakdown-label">${label}</span><span class="breakdown-value ${cls}">${v > 0 ? '+' : ''}${val}</span></div>`;
    });

    // Quick stats row
    const stats = [];
    if (d.price) stats.push(`Price: ${formatCurrency(d.price)}`);
    if (d.momentum?.totalReturn5d != null) stats.push(`5d Return: ${d.momentum.totalReturn5d >= 0 ? '+' : ''}${d.momentum.totalReturn5d.toFixed(2)}%`);
    if (d.rs?.strength) stats.push(`RS: ${d.rs.strength}`);
    if (d.structure?.structureSignal) stats.push(`Signal: ${d.structure.structureSignal.replace(/-/g, ' ')}`);
    if (d.structure?.fvg && d.structure.fvg !== 'none') stats.push(`FVG: ${d.structure.fvg}`);
    if (d.smaCrossover?.sma50) stats.push(`SMA50: ${formatCurrency(d.smaCrossover.sma50)}`);
    if (d.sectorFlow && d.sectorFlow !== 'neutral') stats.push(`Sector Flow: ${d.sectorFlow}`);

    expandedRow.innerHTML = `<td colspan="13">
        <div class="expanded-content" style="padding:12px 16px">
            <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--text-secondary);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)">
                ${stats.map(s => `<span>${s}</span>`).join('<span style="color:var(--border-medium)">\u2022</span>')}
            </div>
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Score Breakdown</div>
            <div class="score-breakdown" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));gap:4px 16px">
                ${breakdownEntries.length > 0 ? breakdownEntries.join('') : '<span style="color:var(--text-faint)">No breakdown available</span>'}
            </div>
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
    const countEl = document.getElementById('alertBadgeCount');
    const sidebarBadge = document.getElementById('sidebarAlertBadge');
    const titleBadge = document.getElementById('alertsTitleBadge');
    const alertsSection = document.getElementById('alertsSection');

    if (countEl) countEl.textContent = alerts.length;
    if (titleBadge) titleBadge.textContent = alerts.length;

    if (alerts.length > 0) {
        if (sidebarBadge) sidebarBadge.style.display = '';
        if (alertsSection) alertsSection.style.display = '';
    } else {
        if (sidebarBadge) sidebarBadge.style.display = 'none';
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

// ── Rendering: Performance Analytics ──
function renderPerformanceAnalytics() {
    if (!closedTrades || closedTrades.length === 0) return;

    const wins = closedTrades.filter(t => t.profitLoss > 0);
    const losses = closedTrades.filter(t => t.profitLoss < 0);
    const winRate = closedTrades.length > 0 ? ((wins.length / closedTrades.length) * 100).toFixed(0) : 0;

    setText('winRate', `${winRate}%`);
    setText('winLossRatio', `${wins.length}W / ${losses.length}L`);
    setText('totalTrades', closedTrades.length);

    // Best/worst trade
    const sorted = [...closedTrades].sort((a, b) => b.returnPercent - a.returnPercent);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    if (best) {
        setText('bestTrade', best.symbol);
        const el = document.getElementById('bestTradeGain');
        if (el) {
            el.textContent = `+${best.returnPercent.toFixed(1)}%`;
            el.className = 'index-change positive';
        }
    }
    if (worst) {
        setText('worstTrade', worst.symbol);
        const el = document.getElementById('worstTradeLoss');
        if (el) {
            el.textContent = `${worst.returnPercent.toFixed(1)}%`;
            el.className = 'index-change negative';
        }
    }

    // Average hold time
    const withHoldTime = closedTrades.filter(t => t.holdTime);
    if (withHoldTime.length > 0) {
        const avgMs = withHoldTime.reduce((s, t) => s + t.holdTime, 0) / withHoldTime.length;
        const days = Math.round(avgMs / 86400000);
        setText('avgHoldTime', days > 0 ? `${days}d` : '<1d');
    }

    // Total P&L from closed trades
    const totalPnL = closedTrades.reduce((s, t) => s + (t.profitLoss || 0), 0);
    const startingCash = 100000;
    setText('totalReturn', `${((totalPnL / startingCash) * 100).toFixed(1)}%`);
    const returnDollarEl = document.getElementById('totalReturnDollar');
    if (returnDollarEl) {
        returnDollarEl.textContent = `${totalPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL)}`;
        returnDollarEl.className = `index-change ${totalPnL >= 0 ? 'positive' : 'negative'}`;
    }

    // Drawdown (sequential from trade history)
    let peak = 0, maxDD = 0, running = 0;
    for (const t of closedTrades) {
        running += (t.profitLoss || 0);
        if (running > peak) peak = running;
        const dd = peak > 0 ? ((peak - running) / peak) * 100 : 0;
        if (dd > maxDD) maxDD = dd;
    }
    setText('drawdownValue', maxDD > 0 ? `-${maxDD.toFixed(1)}%` : '--');
}

// ── Rendering: Regime Banner ──
function renderRegimeBanner() {
    const banner = document.getElementById('regimeBanner');
    if (!banner || !scanData) return;

    // Get VIX from scan metadata
    const vixData = scanData.vix;
    const vixLevel = vixData ? vixData.level : null;

    if (vixLevel != null) {
        banner.style.display = '';

        // Determine regime from VIX
        const regime = vixLevel >= 30 ? 'bear' : vixLevel >= 25 ? 'choppy' : 'bull';
        banner.className = `regime-banner ${regime}`;

        const labelEl = document.getElementById('regimeLabel');
        if (labelEl) labelEl.textContent = regime === 'bull' ? 'BULL MARKET' : regime === 'choppy' ? 'CHOPPY / MIXED' : 'BEAR MARKET';

        // Tactical description
        let desc = regime === 'bull'
            ? 'Aggressive deployment \u2014 favor momentum, full sizing'
            : regime === 'choppy'
            ? 'Selective entries only \u2014 smaller positions'
            : 'Defensive posture \u2014 preserve cash, tight stops';
        setText('regimeDescription', desc);
        setText('regimeTimestamp', `Last scan: ${new Date(scanData.createdAt).toLocaleString()}`);

        // VIX badge with change
        const vixEl = document.getElementById('regimeVIX');
        if (vixEl) {
            const change = vixData.change;
            const sign = change >= 0 ? '+' : '';
            vixEl.textContent = `VIX ${vixLevel.toFixed(1)}${change != null ? ` (${sign}${change.toFixed(2)})` : ''}`;
            vixEl.className = 'regime-vix';
            const interp = vixData.interpretation;
            if (interp === 'complacent') vixEl.classList.add('vix-low');
            else if (interp === 'normal') vixEl.classList.add('vix-normal');
            else if (interp === 'elevated') vixEl.classList.add('vix-elevated');
            else if (interp === 'panic') vixEl.classList.add('vix-panic');
        }
    }
}

// ── Rendering: Sector Rotation ──
function renderSectorRotation() {
    const container = document.getElementById('sectorRotationContent');
    if (!container) return;

    const rotationData = scanData?.sectorRotation;
    if (!rotationData || typeof rotationData !== 'object') {
        // Fallback: aggregate from candidates
        if (!scanData?.candidates) return;
        const sectors = {};
        for (const c of scanData.candidates) {
            const sec = c.sector || 'Other';
            if (!sectors[sec]) sectors[sec] = { count: 0, totalConv: 0, high: 0 };
            sectors[sec].count++;
            sectors[sec].totalConv += c.conviction;
            if (c.conviction >= 7) sectors[sec].high++;
        }
        const sorted = Object.entries(sectors).sort((a, b) => (b[1].totalConv / b[1].count) - (a[1].totalConv / a[1].count));
        container.innerHTML = sorted.map(([name, data]) => {
            const avgConv = (data.totalConv / data.count).toFixed(1);
            return `<div class="rotation-card neutral">
                <div class="rotation-card-header">
                    <span class="rotation-card-name">${name}</span>
                    <span class="rotation-flow-badge neutral">--</span>
                </div>
                <div class="rotation-stats">Avg Conv: ${avgConv} \u2022 ${data.high}/${data.count} high</div>
            </div>`;
        }).join('');
        return;
    }

    // Sort: inflow first, then by 5d return
    const flowOrder = { 'inflow': 0, 'modest-inflow': 1, 'neutral': 2, 'modest-outflow': 3, 'outflow': 4 };
    const sectors = Object.entries(rotationData).sort((a, b) => {
        const fa = flowOrder[a[1].moneyFlow] ?? 2;
        const fb = flowOrder[b[1].moneyFlow] ?? 2;
        if (fa !== fb) return fa - fb;
        return (b[1].avgReturn5d || 0) - (a[1].avgReturn5d || 0);
    });

    if (sectors.length === 0) {
        container.innerHTML = '<div class="empty-state">No sector data</div>';
        return;
    }

    let html = '<div class="rotation-grid">';
    for (const [name, s] of sectors) {
        const flow = s.moneyFlow || 'neutral';
        const flowClass = flow.includes('inflow') ? 'inflow' : flow.includes('outflow') ? 'outflow' : 'neutral';
        const flowLabel = flow.replace(/-/g, ' ').toUpperCase();
        const avg5d = s.avgReturn5d != null ? parseFloat(s.avgReturn5d).toFixed(2) : '--';
        const avgToday = s.avgChange != null ? parseFloat(s.avgChange).toFixed(2) : '--';
        const signal = s.rotationSignal || '--';

        html += `<div class="rotation-card ${flowClass}">
            <div class="rotation-card-header">
                <span class="rotation-card-name">${name}</span>
                <span class="rotation-flow-badge ${flowClass}">${flowLabel}</span>
            </div>
            <div class="rotation-stats">
                5d Avg: <span class="rotation-stat-value" style="color:${parseFloat(avg5d) >= 0 ? 'var(--green)' : 'var(--red)'}">${avg5d}%</span><br>
                Today: <span class="rotation-stat-value" style="color:${parseFloat(avgToday) >= 0 ? 'var(--green)' : 'var(--red)'}">${avgToday}%</span><br>
                Stocks: <span class="rotation-stat-value">${s.total || 0}</span> (${s.leaders5d || 0} up / ${s.laggards5d || 0} dn)<br>
                Signal: <span class="rotation-stat-value">${signal}</span>
            </div>
        </div>`;
    }
    html += '</div>';
    html += `<div style="font-size:10px;color:var(--text-faint);margin-top:8px">Last updated: ${new Date(scanData.createdAt).toLocaleString()}</div>`;
    container.innerHTML = html;
}

// ── Rendering: Sector Chart ──
let sectorChartInstance = null;

function renderSectorChart(holdings) {
    const canvas = document.getElementById('sectorChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (!holdings || holdings.length === 0) {
        const legend = document.getElementById('sectorLegend');
        if (legend) legend.innerHTML = '<div class="empty-state">No positions</div>';
        return;
    }

    // Get sectors from scan data or thesis
    const sectorLookup = {};
    if (scanData?.candidates) {
        for (const c of scanData.candidates) sectorLookup[c.symbol] = c.sector;
    }

    const sectorValues = {};
    for (const h of holdings) {
        const sector = sectorLookup[h.symbol] || h.thesis?.sector || 'Unknown';
        const value = h.shares * (h.currentPrice || h.avgPrice);
        if (!sectorValues[sector]) sectorValues[sector] = 0;
        sectorValues[sector] += value;
    }

    const labels = Object.keys(sectorValues);
    const values = Object.values(sectorValues);
    const colors = ['#f59e0b', '#3b82f6', '#34d399', '#f87171', '#a78bfa', '#60a5fa', '#fbbf24', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316', '#06b6d4'];

    if (sectorChartInstance) sectorChartInstance.destroy();

    sectorChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}`
                    }
                }
            }
        }
    });

    const legend = document.getElementById('sectorLegend');
    if (legend) {
        legend.innerHTML = labels.map((l, i) =>
            `<div class="sector-legend-item"><span class="sector-dot" style="background:${colors[i]}"></span>${l}: ${formatCurrency(values[i])}</div>`
        ).join('');
    }
}

// ── Rendering: Trade Journal ──
function renderTradeJournal() {
    const container = document.getElementById('tradeJournal');
    if (!container) return;

    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<div class="empty-state">No trades yet. Add a trade to start building your journal.</div>';
        return;
    }

    container.innerHTML = transactions.slice(0, 20).map(t => {
        const isBuy = t.action === 'BUY';
        return `<div class="activity-item ${isBuy ? 'buy' : 'sell'}">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <span style="font-weight:700;font-size:11px;padding:2px 6px;border-radius:3px;background:${isBuy ? 'var(--green-dim)' : 'var(--red-dim)'};color:${isBuy ? 'var(--green)' : 'var(--red)'}">${t.action}</span>
                    <span style="font-weight:600;margin-left:6px">${t.symbol}</span>
                </div>
                <span class="activity-time">${t.date ? new Date(t.date).toLocaleDateString() : '-'}</span>
            </div>
            <div class="activity-description">
                ${t.shares} shares @ ${formatCurrency(t.price)} = ${formatCurrency(t.total)}
                ${t.conviction ? ` \u00b7 Conv: ${t.conviction}` : ''}
            </div>
            ${t.notes ? `<div style="font-size:11px;color:var(--text-faint);margin-top:4px;font-style:italic">${t.notes}</div>` : ''}
        </div>`;
    }).join('');
}

// ── Rendering: Activity Feed ──
function renderActivityFeed() {
    const container = document.getElementById('activityFeed');
    if (!container) return;

    const activities = [];

    for (const t of (transactions || []).slice(0, 5)) {
        activities.push({
            time: t.created_at || t.date,
            text: `${t.action} ${t.shares} ${t.symbol} @ ${formatCurrency(t.price)}`,
            type: t.action === 'BUY' ? 'buy' : 'sell'
        });
    }

    for (const a of (alerts || []).slice(0, 5)) {
        activities.push({
            time: a.createdAt,
            text: `[${a.severity.toUpperCase()}] ${a.symbol}: ${a.message}`,
            type: 'alert'
        });
    }

    activities.sort((a, b) => new Date(b.time) - new Date(a.time));

    if (activities.length === 0) {
        container.innerHTML = '<div class="empty-state">No activity yet</div>';
        return;
    }

    container.innerHTML = activities.slice(0, 10).map(a => {
        const time = a.time ? new Date(a.time).toLocaleString() : '';
        return `<div class="activity-item ${a.type}">
            <div class="activity-time">${time}</div>
            <div class="activity-description">${a.text}</div>
        </div>`;
    }).join('');
}

// ── Actions ──
async function triggerScan() {
    const btns = document.querySelectorAll('.sidebar-actions button');
    const btn = btns[0];
    if (btn) { btn.disabled = true; btn.textContent = 'Scanning...'; }
    try {
        await apiCall('/api/scans/trigger', { method: 'POST' });
        showToast('Scan started \u2014 results will appear shortly', 'info');
        let attempts = 0;
        const poll = setInterval(async () => {
            attempts++;
            try {
                const newScan = await apiCall('/api/scans/latest');
                if (newScan && (!scanData || newScan.id !== scanData.id)) {
                    clearInterval(poll);
                    scanData = newScan;
                    populateSectorFilter();
                    renderScorecard();
                    updateScanInfo();
                    renderRegimeBanner();
                    renderSectorRotation();
                    if (btn) { btn.disabled = false; btn.textContent = 'Scan Market'; }
                    showToast('Scan complete', 'success');
                }
            } catch { /* keep polling */ }
            if (attempts > 120) {
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
        renderActivityFeed();
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

async function refreshPrices() {
    showToast('Refreshing data...', 'info');
    try {
        await Promise.all([loadPortfolio(), loadLatestScan(), loadAlerts()]);
        showToast('Data refreshed', 'success');
    } catch {
        showToast('Refresh failed', 'error');
    }
}

function toggleAnalyticsExpansion(cardId, cardEl) {
    const popover = document.getElementById('analyticsPopover');
    const content = document.getElementById('analyticsPopoverContent');
    if (!popover || !content) return;

    if (popover.classList.contains('active') && popover.dataset.card === cardId) {
        popover.classList.remove('active');
        return;
    }

    popover.dataset.card = cardId;
    let html = '';

    if (cardId === 'bestTrade' && closedTrades.length > 0) {
        const top = [...closedTrades].sort((a, b) => b.returnPercent - a.returnPercent);
        html = '<div style="font-weight:600;margin-bottom:8px">Top 5 Trades</div>' +
            top.slice(0, 5).map(t =>
                `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px">
                    <span>${t.symbol}</span>
                    <span class="positive">+${t.returnPercent.toFixed(1)}% (${formatCurrency(t.profitLoss)})</span>
                </div>`
            ).join('');
    } else if (cardId === 'worstTrade' && closedTrades.length > 0) {
        const bottom = [...closedTrades].sort((a, b) => a.returnPercent - b.returnPercent);
        html = '<div style="font-weight:600;margin-bottom:8px">Bottom 5 Trades</div>' +
            bottom.slice(0, 5).map(t =>
                `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px">
                    <span>${t.symbol}</span>
                    <span class="negative">${t.returnPercent.toFixed(1)}% (${formatCurrency(t.profitLoss)})</span>
                </div>`
            ).join('');
    }

    if (html) {
        content.innerHTML = html;
        popover.classList.add('active');
    }
}

// ── Trade Modal ──
function openTradeModal() {
    const modal = document.getElementById('tradeModal');
    if (modal) modal.classList.add('active');
    const dateInput = document.getElementById('tradeDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
}

function closeTradeModal() {
    const modal = document.getElementById('tradeModal');
    if (modal) modal.classList.remove('active');
}

async function submitTrade(event) {
    if (event) event.preventDefault();

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
        document.getElementById('tradeForm')?.reset();
        await Promise.all([loadPortfolio(), loadTrades()]);
    } catch (e) {
        showToast(`Trade failed: ${e.message}`, 'error');
    }
}

// ── Chat ──
function activateChat() {
    const gate = document.getElementById('chatGate');
    const messages = document.getElementById('chatMessages');
    const inputContainer = document.getElementById('chatInputContainer');
    if (gate) gate.style.display = 'none';
    if (messages) messages.style.display = '';
    if (inputContainer) inputContainer.style.display = '';
    document.getElementById('chatInput')?.focus();
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

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
        addChatMessage(data.reply || data.error || 'No response', 'assistant');
    } catch (e) {
        addChatMessage(`Error: ${e.message}`, 'system');
    }
}

function addChatMessage(text, role) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const div = document.createElement('div');
    if (role === 'user') {
        div.className = 'user-message';
        div.innerHTML = `<div class="message-content"><div class="message-name">You</div><div class="message-text">${escapeHtml(text)}</div></div>`;
    } else {
        div.className = role === 'assistant' ? 'agent-message' : 'system-message';
        div.innerHTML = `<div class="message-avatar">${role === 'assistant' ? 'A' : '!'}</div><div class="message-content"><div class="message-name">${role === 'assistant' ? 'APEX' : 'System'}</div><div class="message-text">${escapeHtml(text)}</div></div>`;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ── Learning Insights ──
function renderLearningInsights(data) {
    const container = document.getElementById('learningInsights');
    if (!container) return;

    const { trades, rules } = data;
    if (!trades || trades.length < 3) {
        container.innerHTML = '<div class="empty-state">Need at least 3 closed trades for insights</div>';
        return;
    }

    const wins = trades.filter(t => t.profitLoss > 0);
    const losses = trades.filter(t => t.profitLoss < 0);
    const winRate = trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(0) : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.returnPercent, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.returnPercent, 0) / losses.length : 0;

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
        <div class="insights-grid">
            <div class="insight-panel">
                <div class="insight-panel-title">Performance Summary</div>
                <div class="rr-stats-row">
                    <div class="rr-stat"><div class="rr-stat-value ${winRate >= 50 ? 'positive' : 'negative'}">${winRate}%</div><div class="rr-stat-label">Win Rate</div></div>
                    <div class="rr-stat"><div class="rr-stat-value">${trades.length}</div><div class="rr-stat-label">Trades</div></div>
                    <div class="rr-stat"><div class="rr-stat-value positive">+${avgWin.toFixed(1)}%</div><div class="rr-stat-label">Avg Win</div></div>
                    <div class="rr-stat"><div class="rr-stat-value negative">${avgLoss.toFixed(1)}%</div><div class="rr-stat-label">Avg Loss</div></div>
                </div>
            </div>
            <div class="insight-panel">
                <div class="insight-panel-title">Win Rate by Conviction</div>
                <table class="signal-accuracy-table">
                    <thead><tr><th>Level</th><th>Win Rate</th><th>Trades</th><th>Avg Return</th></tr></thead>
                    <tbody>${Object.entries(byConviction).sort().map(([bucket, d]) => {
                        const wr = d.total > 0 ? ((d.wins / d.total) * 100).toFixed(0) : 0;
                        const avgRet = (d.totalReturn / d.total).toFixed(1);
                        return `<tr>
                            <td>${bucket}</td>
                            <td class="${wr >= 50 ? 'positive' : 'negative'}">${wr}%</td>
                            <td>${d.wins}/${d.total}</td>
                            <td class="${avgRet >= 0 ? 'positive' : 'negative'}">${avgRet}%</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
        </div>
        ${rules?.rules?.length > 0 ? `
        <div class="rules-section" style="margin-top:12px">
            <div class="rules-section-title">Derived Trading Rules</div>
            <div class="rules-grid">
                ${rules.rules.slice(0, 10).map(r => {
                    const ruleType = r.type || r.enforcement || 'observe';
                    return `<div class="rule-card rule-${ruleType}">
                        <div class="rule-card-header">
                            <span class="rule-card-label">${r.description || r.id}</span>
                            <span class="rule-enforcement-badge rule-badge-${ruleType}">${ruleType.toUpperCase()}</span>
                        </div>
                        ${r.stats ? `<div class="rule-card-stats">${Object.entries(r.stats).map(([k, v]) =>
                            `<span class="rule-stat">${k}: ${v}</span>`
                        ).join('')}</div>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>` : ''}
    `;
}

// ── Calibration ──
async function triggerCalibration() {
    const btn = document.getElementById('calibrateBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Calibrating...'; }
    try {
        await apiCall('/api/calibrate', { method: 'POST' });
        showToast('Calibration started \u2014 this may take a few minutes', 'info');
    } catch (e) {
        showToast(`Calibration failed: ${e.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Run Calibration'; }
    }
}

function renderCalibration(cal) {
    const container = document.getElementById('calibrationContent');
    if (!container) return;

    if (!cal || !cal.weights) {
        container.innerHTML = '<div class="empty-state">No calibration data yet. Run a calibration sweep to optimize scoring weights.</div>';
        return;
    }

    const calibratedAt = cal.calibratedAt ? new Date(cal.calibratedAt).toLocaleDateString() : 'Unknown';
    const weights = cal.weights || {};
    const topWeights = Object.entries(weights)
        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
        .slice(0, 8);

    container.innerHTML = `
        <div class="insights-grid">
            <div class="insight-panel">
                <div class="insight-panel-title">Calibration Info</div>
                <div class="insight-panel-body">
                    <div style="margin-bottom:6px"><span style="color:var(--text-faint)">Last Run:</span> ${calibratedAt}</div>
                    <div style="margin-bottom:6px"><span style="color:var(--text-faint)">Components:</span> ${Object.keys(weights).length}</div>
                    ${cal.sweepResults?.validation ? `<div><span style="color:var(--text-faint)">Improvement:</span> <span class="positive">${cal.sweepResults.validation.improvement?.toFixed(1)}%</span></div>` : ''}
                </div>
            </div>
            <div class="insight-panel">
                <div class="insight-panel-title">Top Scoring Weights</div>
                <table class="signal-accuracy-table">
                    <thead><tr><th>Component</th><th>Weight</th></tr></thead>
                    <tbody>${topWeights.map(([name, weight]) =>
                        `<tr><td>${name}</td><td class="${weight >= 0 ? 'positive' : 'negative'}">${weight.toFixed(3)}</td></tr>`
                    ).join('')}</tbody>
                </table>
            </div>
        </div>
    `;
}

// ── Conviction History (sparkline) ──
async function loadConvictionHistory(symbol) {
    try {
        return await apiCall(`/api/stock/${symbol}/history`);
    } catch {
        return [];
    }
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    if (!API_KEY) {
        if (!promptForApiKey()) {
            setText('serverStatusText', 'API key required');
            return;
        }
    }

    const health = await checkServerStatus();
    if (!health) {
        clearApiKey();
        if (promptForApiKey()) return init();
        return;
    }

    await Promise.all([
        loadPortfolio(),
        loadLatestScan(),
        loadAlerts(),
        loadWatchlist(),
        loadPerformance(),
        loadLearningInsights(),
        loadTrades(),
        loadCalibration(),
        loadStockNames()
    ]);

    setInterval(checkServerStatus, 30000);
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
