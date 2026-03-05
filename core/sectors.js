'use strict';

// Detect sector rotation using multi-day bar data
// Extracted from legacy trader.js (lines 1967-2001)
//
// marketData:    { [symbol]: { changePercent, ... } }
// barsMap:       { [symbol]: bars[] } where bars have { o, h, l, c, v, t }
// stockSectors:  { [symbol]: sectorName } sector mapping
function detectSectorRotation(marketData, barsMap, stockSectors) {
    const sectors = {};
    Object.entries(marketData).forEach(([symbol, data]) => {
        const sector = stockSectors[symbol] || 'Unknown';
        if (!sectors[sector]) sectors[sector] = { stocks: [], totalReturn5d: 0, totalChangeToday: 0, leaders5d: 0, laggards5d: 0, leadersToday: 0, laggardsToday: 0 };
        const bars = barsMap[symbol];
        let return5d = data.changePercent || 0;
        if (bars && bars.length >= 2) {
            const recent5 = bars.slice(-5);
            return5d = ((recent5[recent5.length - 1].c - recent5[0].c) / recent5[0].c) * 100;
        }
        sectors[sector].stocks.push({ symbol, ...data, return5d });
        sectors[sector].totalReturn5d += return5d;
        sectors[sector].totalChangeToday += (data.changePercent || 0);
        if (return5d > 2) sectors[sector].leaders5d++;
        if (return5d < -2) sectors[sector].laggards5d++;
        if ((data.changePercent || 0) > 1) sectors[sector].leadersToday++;
        if ((data.changePercent || 0) < -1) sectors[sector].laggardsToday++;
    });
    const sectorAnalysis = {};
    Object.entries(sectors).forEach(([sector, data]) => {
        const count = data.stocks.length;
        const avgReturn5d = data.totalReturn5d / count;
        const avgChange = data.totalChangeToday / count;
        const leaderRatio5d = data.leaders5d / count;
        const laggardRatio5d = data.laggards5d / count;
        let flow = 'neutral', rotationSignal = 'hold';
        if (avgReturn5d > 2 && leaderRatio5d > 0.5) { flow = 'inflow'; rotationSignal = 'accumulate'; }
        else if (avgReturn5d > 1 && leaderRatio5d > 0.35) { flow = 'modest-inflow'; rotationSignal = 'favorable'; }
        else if (avgReturn5d < -2 && laggardRatio5d > 0.5) { flow = 'outflow'; rotationSignal = 'avoid'; }
        else if (avgReturn5d < -1 && laggardRatio5d > 0.35) { flow = 'modest-outflow'; rotationSignal = 'caution'; }
        sectorAnalysis[sector] = { avgChange: avgChange.toFixed(2), avgReturn5d: avgReturn5d.toFixed(2), leaders5d: data.leaders5d, laggards5d: data.laggards5d, leadersToday: data.leadersToday, laggardsToday: data.laggardsToday, total: count, leaderRatio5d: (leaderRatio5d * 100).toFixed(0) + '%', moneyFlow: flow, rotationSignal };
    });
    return sectorAnalysis;
}

module.exports = { detectSectorRotation };
