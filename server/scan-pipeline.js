'use strict';

const { screenStocks } = require('../core/screener');
const { stockSectors } = require('../core/data');
const { calculateRSI, calculateSMA, calculateMACD, calculateSMACrossover, calculate5DayMomentum, calculateVolumeRatio, calculateRelativeStrength } = require('../core/indicators');
const { detectSectorRotation } = require('../core/sectors');
const { calculateCompositeScore, deriveConvictionRating, getActiveWeights } = require('../core/scoring');
const { detectStructure, checkStructureBreakdowns } = require('../core/structure');
const { sendScanSummary, sendAlertNotification, sendErrorNotification } = require('./notify');
const db = require('./db');

// Build the scan function objects that scheduler.js expects.
// Returns { fetchData, scoreAll, checkBreakdowns, notify }
function buildScanFunctions(database, config) {
    const apiKey = config.MASSIVE_API_KEY;
    const ntfyTopic = config.NTFY_TOPIC;

    // ── fetchData: fetch market data from Polygon + VIX ──
    // symbols: optional array — if provided, fetches only those symbols
    // if omitted, fetches the full ~490-stock universe
    async function fetchData(symbols) {
        const data = require('../core/data');

        const universe = symbols || screenStocks();
        const symbolSet = new Set(universe);

        // Fetch in parallel: snapshot, daily bars, VIX
        const [marketData, barsMap, vix] = await Promise.all([
            data.fetchBulkSnapshot(universe, apiKey),
            data.fetchGroupedDailyBars(symbolSet, apiKey),
            data.fetchVIX(apiKey)
        ]);

        return { marketData, barsMap, vix };
    }

    // ── scoreAll: compute composite scores + conviction for all stocks ──
    // marketData: { [symbol]: { price, changePercent, ... } }
    // barsMap: { [symbol]: bars[] }
    // vix: { level, trend, ... }
    function scoreAll(marketData, barsMap, vix) {
        const vixLevel = vix ? vix.level : null;

        // Load calibrated weights from DB (if available)
        const calData = db.getCalibration(database);
        const weights = getActiveWeights(calData, vixLevel);

        // Detect sector rotation for flow signals
        const sectorAnalysis = detectSectorRotation(marketData, barsMap, stockSectors);

        // Build sector peer groups for relative strength
        const sectorPeers = {};
        for (const [symbol, sectorName] of Object.entries(stockSectors)) {
            if (!sectorPeers[sectorName]) sectorPeers[sectorName] = [];
            if (marketData[symbol]) {
                sectorPeers[sectorName].push({ symbol, changePercent: marketData[symbol].changePercent || 0 });
            }
        }

        // Score each stock
        const scores = [];
        for (const [symbol, mktData] of Object.entries(marketData)) {
            const bars = barsMap[symbol];
            const sector = stockSectors[symbol] || 'Unknown';

            // Compute indicators
            const momentum = calculate5DayMomentum(mktData, bars);
            const rsi = calculateRSI(bars);
            const sma20 = calculateSMA(bars, 20);
            const macdResult = calculateMACD(bars);
            const smaCrossResult = calculateSMACrossover(bars);
            const volumeResult = calculateVolumeRatio(bars);
            const peers = sectorPeers[sector] || [];
            const rs = calculateRelativeStrength(mktData, peers, symbol, barsMap);

            // Structure analysis
            const structureResult = bars && bars.length >= 7 ? detectStructure(bars) : null;

            // Sector flow for this stock
            const sectorFlow = sectorAnalysis[sector] ? sectorAnalysis[sector].moneyFlow : 'neutral';

            // Build scoring params
            const params = {
                momentumScore: momentum.score,
                rsNormalized: ((rs.rsScore || 50) / 100) * 10,
                sectorFlow,
                structureScore: structureResult ? structureResult.structureScore : 0,
                isAccelerating: momentum.isAccelerating,
                upDays: momentum.upDays,
                totalDays: momentum.totalDays,
                todayChange: mktData.changePercent || 0,
                totalReturn5d: momentum.totalReturn5d || 0,
                rsi,
                macdCrossover: macdResult ? macdResult.crossover : 'none',
                daysToCover: 0, // Would need short interest data
                volumeTrend: volumeResult ? volumeResult.ratio : 1,
                fvg: structureResult ? structureResult.fvg : 'none',
                signalAdjustments: 0,
                sma20,
                currentPrice: mktData.price,
                smaCrossover: smaCrossResult ? smaCrossResult.crossover : 'none',
                calFresh: !!calData
            };

            const scoreResult = calculateCompositeScore(params, weights);

            scores.push({
                symbol,
                compositeScore: scoreResult.total,
                sector,
                data: {
                    price: mktData.price,
                    changePercent: mktData.changePercent,
                    momentum,
                    rsi,
                    macd: macdResult,
                    smaCrossover: smaCrossResult,
                    volume: volumeResult,
                    rs,
                    structure: structureResult,
                    sectorFlow,
                    breakdown: scoreResult.breakdown
                }
            });
        }

        // Derive conviction ratings (percentile + absolute floor)
        const rated = deriveConvictionRating(scores);

        // Merge conviction back into full score objects and sort by compositeScore desc
        const ratedMap = {};
        for (const r of rated) {
            ratedMap[r.symbol] = r.conviction;
        }

        for (const s of scores) {
            s.conviction = ratedMap[s.symbol] || 1;
        }

        scores.sort((a, b) => b.compositeScore - a.compositeScore);
        return scores;
    }

    // ── checkBreakdowns: check structure breakdowns for holdings + watchlist ──
    // holdings: array of { symbol, entryStructure }
    // watchlist: array of { symbol }
    // scanData: { [symbol]: { bars, marketData } }
    function checkBreakdownsFn(holdings, watchlist, scanData) {
        // Build structureResult for each symbol in scanData
        const enrichedScanData = {};
        for (const [symbol, data] of Object.entries(scanData)) {
            const structureResult = data.bars && data.bars.length >= 7
                ? detectStructure(data.bars)
                : null;
            enrichedScanData[symbol] = {
                ...data,
                structureResult
            };
        }

        return checkStructureBreakdowns(holdings, watchlist, enrichedScanData);
    }

    // ── notify: send notifications via ntfy.sh ──
    async function notifyFn(type, data) {
        if (type === 'scan') {
            await sendScanSummary(ntfyTopic, data);
        } else if (type === 'alert') {
            await sendAlertNotification(ntfyTopic, data);
        } else if (type === 'error') {
            await sendErrorNotification(ntfyTopic, data.message || data);
        }
    }

    return {
        fetchData,
        scoreAll,
        checkBreakdowns: checkBreakdownsFn,
        notify: notifyFn
    };
}

module.exports = { buildScanFunctions };
