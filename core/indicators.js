'use strict';

// RSI (Relative Strength Index) using Wilder's smoothing
function calculateRSI(bars, period = 14) {
    if (!bars || bars.length < period + 1) return null;
    let gainSum = 0, lossSum = 0;
    for (let i = 1; i <= period; i++) {
        const change = bars[i].c - bars[i - 1].c;
        if (change > 0) gainSum += change;
        else lossSum += Math.abs(change);
    }
    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;
    for (let i = period + 1; i < bars.length; i++) {
        const change = bars[i].c - bars[i - 1].c;
        avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

// Simple Moving Average
function calculateSMA(bars, period = 20) {
    if (!bars || bars.length < period) return null;
    const slice = bars.slice(-period);
    return Math.round(slice.reduce((sum, b) => sum + b.c, 0) / period * 100) / 100;
}

// Exponential Moving Average (returns array of EMA values for signal line calculation)
function calculateEMAArray(closes, period) {
    if (closes.length < period) return [];
    const multiplier = 2 / (period + 1);
    const emaValues = [];
    // SMA seed
    let ema = closes.slice(0, period).reduce((s, c) => s + c, 0) / period;
    emaValues.push(ema);
    for (let i = period; i < closes.length; i++) {
        ema = (closes[i] - ema) * multiplier + ema;
        emaValues.push(ema);
    }
    return emaValues;
}

// MACD (12, 26, 9) — returns current values + crossover signal
function calculateMACD(bars) {
    if (!bars || bars.length < 35) return null;
    const closes = bars.map(b => b.c);
    const ema12 = calculateEMAArray(closes, 12);
    const ema26 = calculateEMAArray(closes, 26);
    const offset = 26 - 12;
    const macdLine = [];
    for (let i = 0; i < ema26.length; i++) {
        macdLine.push(ema12[i + offset] - ema26[i]);
    }
    const signalLine = calculateEMAArray(macdLine, 9);
    if (signalLine.length < 2) return null;
    const currentMACD = macdLine[macdLine.length - 1];
    const currentSignal = signalLine[signalLine.length - 1];
    const prevMACD = macdLine[macdLine.length - 2];
    const prevSignal = signalLine.length >= 2 ? signalLine[signalLine.length - 2] : currentSignal;
    const histogram = currentMACD - currentSignal;
    let crossover = 'none';
    if (prevMACD <= prevSignal && currentMACD > currentSignal) crossover = 'bullish';
    else if (prevMACD >= prevSignal && currentMACD < currentSignal) crossover = 'bearish';
    return {
        macd: Math.round(currentMACD * 1000) / 1000,
        signal: Math.round(currentSignal * 1000) / 1000,
        histogram: Math.round(histogram * 1000) / 1000,
        crossover
    };
}

// SMA Crossover (20/50) — detects golden/death cross with spread
function calculateSMACrossover(bars) {
    if (!bars || bars.length < 52) return null;
    const sma20Now = calculateSMA(bars, 20);
    const sma50Now = calculateSMA(bars, 50);
    if (sma20Now == null || sma50Now == null) return null;
    const prevBars = bars.slice(0, -1);
    const sma20Prev = calculateSMA(prevBars, 20);
    const sma50Prev = calculateSMA(prevBars, 50);
    if (sma20Prev == null || sma50Prev == null) return null;
    let crossover = 'none';
    if (sma20Prev <= sma50Prev && sma20Now > sma50Now) crossover = 'bullish';
    else if (sma20Prev >= sma50Prev && sma20Now < sma50Now) crossover = 'bearish';
    const spread = sma50Now !== 0 ? ((sma20Now - sma50Now) / sma50Now * 100) : 0;
    return { sma50: sma50Now, crossover, spread: Math.round(spread * 100) / 100 };
}

// 5-day momentum score from bar data
// bars: array of OHLCV bars for this symbol
// priceData: { price, changePercent } snapshot data (fallback)
function calculate5DayMomentum(priceData, bars) {
    if (!bars || bars.length < 2) {
        if (!priceData || !priceData.price) return { score: 0, trend: 'unknown', basis: 'no-data' };
        const cp = priceData.changePercent || 0;
        let score = 5;
        if (cp > 5) score = 7; else if (cp > 2) score = 6.5; else if (cp > 0) score = 6;
        else if (cp > -2) score = 4; else if (cp > -5) score = 2; else score = 0;
        return { score, trend: score >= 6 ? 'building' : score <= 4 ? 'fading' : 'neutral', changePercent: cp, basis: '1-day-fallback' };
    }
    const allBars = bars;
    const recentBars = allBars.slice(-5);
    const latest = recentBars[recentBars.length - 1], oldest = recentBars[0], mid = recentBars[Math.floor(recentBars.length / 2)];
    const totalReturn = ((latest.c - oldest.c) / oldest.c) * 100;
    const firstHalfReturn = ((mid.c - oldest.c) / oldest.c) * 100;
    const secondHalfReturn = ((latest.c - mid.c) / mid.c) * 100;
    const isAccelerating = secondHalfReturn > firstHalfReturn;
    let upDays = 0;
    for (let i = 1; i < recentBars.length; i++) { if (recentBars[i].c > recentBars[i - 1].c) upDays++; }
    const upDayRatio = upDays / (recentBars.length - 1);
    const recentVol = recentBars.slice(-2).reduce((s, b) => s + b.v, 0) / 2;
    const earlyVol = recentBars.slice(0, 2).reduce((s, b) => s + b.v, 0) / 2;
    const volumeTrend = earlyVol > 0 ? recentVol / earlyVol : 1;
    let score = 5;
    if (totalReturn > 8) score += 3; else if (totalReturn > 4) score += 2; else if (totalReturn > 1) score += 1;
    else if (totalReturn < -8) score -= 3; else if (totalReturn < -4) score -= 2; else if (totalReturn < -1) score -= 1;
    if (upDayRatio >= 0.8) score += 1.5; else if (upDayRatio >= 0.6) score += 0.5;
    else if (upDayRatio <= 0.2) score -= 1.5; else if (upDayRatio <= 0.4) score -= 0.5;
    if (isAccelerating && totalReturn > 0) score += 0.5;
    else if (!isAccelerating && totalReturn < 0) score -= 0.5;
    score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));
    let trend = 'neutral';
    if (score >= 7 && isAccelerating) trend = 'building';
    else if (score >= 6) trend = 'steady-up';
    else if (score <= 3 && !isAccelerating) trend = 'fading';
    else if (score <= 4) trend = 'steady-down';
    return {
        score: Math.round(score * 10) / 10, trend,
        totalReturn5d: Math.round(totalReturn * 100) / 100,
        todayChange: priceData?.changePercent || 0,
        upDays, totalDays: recentBars.length - 1, isAccelerating,
        volumeTrend: Math.round(volumeTrend * 100) / 100,
        basis: '5-day-real'
    };
}

// Volume ratio: today's volume vs 20-day average
// bars: array of OHLCV bars for this symbol
function calculateVolumeRatio(bars) {
    if (!bars || bars.length < 6) return null;
    const todayBar = bars[bars.length - 1];
    const todayVol = todayBar.v;
    if (!todayVol || todayVol <= 0) return null;
    const histBars = bars.slice(-21, -1);
    if (histBars.length < 5) return null;
    const validBars = histBars.filter(b => b.v > 0);
    if (validBars.length < 5) return null;
    const avgVol = validBars.reduce((s, b) => s + b.v, 0) / validBars.length;
    return {
        ratio: Math.round((todayVol / avgVol) * 100) / 100,
        todayVolume: todayVol,
        avgVolume: Math.round(avgVol)
    };
}

// Relative strength vs sector using multi-day bar data
// stockData: { changePercent } for the stock
// sectorData: array of { symbol, changePercent } for sector peers
// symbol: the stock's ticker
// barsMap: { [symbol]: bars[] } map of all bar data
function calculateRelativeStrength(stockData, sectorData, symbol, barsMap) {
    if (!stockData || !sectorData || sectorData.length === 0) return { rsScore: 50, strength: 'neutral' };
    const stockBars = barsMap[symbol];
    let stockReturn = stockData.changePercent || 0, usedMultiDay = false;
    if (stockBars && stockBars.length >= 2) {
        const recent5 = stockBars.slice(-5);
        stockReturn = ((recent5[recent5.length - 1].c - recent5[0].c) / recent5[0].c) * 100;
        usedMultiDay = true;
    }
    let sectorTotal = 0, sectorCount = 0;
    sectorData.forEach(stock => {
        const sBars = barsMap[stock.symbol];
        if (sBars && sBars.length >= 2) {
            const sRecent5 = sBars.slice(-5);
            sectorTotal += ((sRecent5[sRecent5.length - 1].c - sRecent5[0].c) / sRecent5[0].c) * 100;
        }
        else sectorTotal += (stock.changePercent || 0);
        sectorCount++;
    });
    const sectorAvg = sectorCount > 0 ? sectorTotal / sectorCount : 0;
    const relativePerformance = stockReturn - sectorAvg;
    const multiplier = usedMultiDay ? 5 : 10;
    let rsScore = 50 + (relativePerformance * multiplier);
    rsScore = Math.max(0, Math.min(100, rsScore));
    const strength = rsScore >= 70 ? 'outperforming' : rsScore >= 55 ? 'above-average' : rsScore >= 45 ? 'neutral' : rsScore >= 30 ? 'below-average' : 'underperforming';
    return {
        rsScore: Math.round(rsScore), strength,
        stockReturn5d: Math.round(stockReturn * 100) / 100,
        sectorAvg5d: Math.round(sectorAvg * 100) / 100,
        relativePerformance: Math.round(relativePerformance * 100) / 100,
        basis: usedMultiDay ? '5-day' : '1-day-fallback'
    };
}

module.exports = {
    calculateRSI,
    calculateSMA,
    calculateEMAArray,
    calculateMACD,
    calculateSMACrossover,
    calculate5DayMomentum,
    calculateVolumeRatio,
    calculateRelativeStrength
};
