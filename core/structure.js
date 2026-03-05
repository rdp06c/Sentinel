'use strict';

// ══════════════════════════════════════════════════════════════
// MARKET STRUCTURE DETECTION: CHoCH (Change of Character) & BOS (Break of Structure)
// Uses daily bars to identify swing highs/lows and structural shifts (ICT/SMC)
// ══════════════════════════════════════════════════════════════

function detectStructure(bars) {
    if (!bars || bars.length < 7) {
        return { structure: 'unknown', structureSignal: 'neutral', structureScore: 0, choch: false, chochType: 'none', bos: false, bosType: 'none', sweep: 'none', fvg: 'none', swingHighs: 0, swingLows: 0, lastSwingHigh: null, lastSwingLow: null, currentPrice: null, allSwingHighs: [], allSwingLows: [], fvgs: [], basis: 'insufficient-data' };
    }

    // Step 1: Identify swing highs and swing lows
    // A swing high = bar whose high is higher than the bar before AND after it
    // A swing low = bar whose low is lower than the bar before AND after it
    const swingHighs = []; // { index, price, time }
    const swingLows = [];

    for (let i = 1; i < bars.length - 1; i++) {
        if (bars[i].h > bars[i - 1].h && bars[i].h > bars[i + 1].h) {
            swingHighs.push({ index: i, price: bars[i].h, time: bars[i].t });
        }
        if (bars[i].l < bars[i - 1].l && bars[i].l < bars[i + 1].l) {
            swingLows.push({ index: i, price: bars[i].l, time: bars[i].t });
        }
    }

    if (swingHighs.length < 2 || swingLows.length < 2) {
        return { structure: 'unknown', structureSignal: 'neutral', structureScore: 0, choch: false, chochType: 'none', bos: false, bosType: 'none', sweep: 'none', fvg: 'none', swingHighs: swingHighs.length, swingLows: swingLows.length, lastSwingHigh: null, lastSwingLow: null, currentPrice: null, allSwingHighs: swingHighs, allSwingLows: swingLows, fvgs: [], basis: 'insufficient-swings' };
    }

    // Step 2: Determine prevailing structure from the swing sequence
    // Bullish structure: Higher Highs (HH) + Higher Lows (HL)
    // Bearish structure: Lower Highs (LH) + Lower Lows (LL)
    const lastSH = swingHighs[swingHighs.length - 1];
    const prevSH = swingHighs[swingHighs.length - 2];
    const lastSL = swingLows[swingLows.length - 1];
    const prevSL = swingLows[swingLows.length - 2];

    const higherHigh = lastSH.price > prevSH.price;
    const higherLow = lastSL.price > prevSL.price;
    const lowerHigh = lastSH.price < prevSH.price;
    const lowerLow = lastSL.price < prevSL.price;

    let structure = 'ranging';
    if (higherHigh && higherLow) structure = 'bullish';
    else if (lowerHigh && lowerLow) structure = 'bearish';
    else if (higherHigh && lowerLow) structure = 'ranging'; // Expanding
    else if (lowerHigh && higherLow) structure = 'contracting'; // Compressing

    // Step 3: Detect CHoCH (Change of Character)
    // CHoCH = structure was bullish (HH+HL) but just made a LL, or was bearish (LH+LL) but just made a HH
    // We need at least 3 swing points to detect a change
    let choch = false;
    let chochType = null;

    if (swingHighs.length >= 3 && swingLows.length >= 3) {
        const prevPrevSH = swingHighs[swingHighs.length - 3];
        const prevPrevSL = swingLows[swingLows.length - 3];

        // Was previously bullish (earlier swings were HH+HL)?
        const wasBullish = prevSH.price > prevPrevSH.price && prevSL.price > prevPrevSL.price;
        // Was previously bearish (earlier swings were LH+LL)?
        const wasBearish = prevSH.price < prevPrevSH.price && prevSL.price < prevPrevSL.price;

        if (wasBullish && lowerLow) {
            // Was making HH+HL, now made a LL → bearish CHoCH
            choch = true;
            chochType = 'bearish';
        } else if (wasBearish && higherHigh) {
            // Was making LH+LL, now made a HH → bullish CHoCH
            choch = true;
            chochType = 'bullish';
        }
    }

    // Step 4: Detect BOS (Break of Structure)
    // BOS = current price confirms the prevailing trend
    // Bullish BOS: price breaks above the most recent swing high (trend continuation)
    // Bearish BOS: price breaks below the most recent swing low (trend continuation)
    let bos = false;
    let bosType = null;
    const currentPrice = bars[bars.length - 1].c;

    if (structure === 'bullish' && currentPrice > prevSH.price) {
        bos = true;
        bosType = 'bullish';
    } else if (structure === 'bearish' && currentPrice < prevSL.price) {
        bos = true;
        bosType = 'bearish';
    }

    // Step 5: Detect potential liquidity sweep patterns
    // A sweep = price briefly pierced a swing level then reversed
    // Check if the most recent bar's wick went past a swing level but closed back
    let sweepDetected = false;
    let sweepType = null;
    const latestBar = bars[bars.length - 1];

    // Check for sweep of recent swing high (wick above, close below)
    if (latestBar.h > lastSH.price && latestBar.c < lastSH.price) {
        sweepDetected = true;
        sweepType = 'high-swept'; // Bearish signal — swept buy-side liquidity
    }
    // Check for sweep of recent swing low (wick below, close above)
    if (latestBar.l < lastSL.price && latestBar.c > lastSL.price) {
        sweepDetected = true;
        sweepType = 'low-swept'; // Bullish signal — swept sell-side liquidity
    }

    // Step 6: Detect Fair Value Gaps (FVG) in the last 5 bars
    // FVG = gap between bar[i-1].high and bar[i+1].low (bullish) or bar[i-1].low and bar[i+1].high (bearish)
    // Collect all FVGs and return the most recent one
    let fvg = null;
    const fvgs = [];
    for (let i = Math.max(1, bars.length - 4); i < bars.length - 1; i++) {
        if (bars[i - 1].h < bars[i + 1].l) {
            fvgs.push({ type: 'bullish', gapTop: bars[i + 1].l, gapBottom: bars[i - 1].h, barIndex: i });
        }
        if (bars[i - 1].l > bars[i + 1].h) {
            fvgs.push({ type: 'bearish', gapTop: bars[i - 1].l, gapBottom: bars[i + 1].h, barIndex: i });
        }
    }
    if (fvgs.length > 0) fvg = fvgs[fvgs.length - 1]; // Most recent FVG

    // Build composite structure signal
    let structureSignal = 'neutral';
    let structureScore = 0; // -3 to +3 scale

    if (bos && bosType === 'bullish') { structureSignal = 'strong-bullish'; structureScore = 3; }
    else if (bos && bosType === 'bearish') { structureSignal = 'strong-bearish'; structureScore = -3; }
    else if (choch && chochType === 'bullish') { structureSignal = 'reversal-bullish'; structureScore = 2; }
    else if (choch && chochType === 'bearish') { structureSignal = 'reversal-bearish'; structureScore = -2; }
    else if (structure === 'bullish') { structureSignal = 'bullish'; structureScore = 1; }
    else if (structure === 'bearish') { structureSignal = 'bearish'; structureScore = -1; }

    // Sweep modifies the signal
    if (sweepDetected && sweepType === 'low-swept') structureScore += 1; // Bullish reversal signal
    if (sweepDetected && sweepType === 'high-swept') structureScore -= 1; // Bearish reversal signal

    return {
        structure,
        structureSignal,
        structureScore: Math.max(-3, Math.min(3, structureScore)),
        choch,
        chochType: chochType || 'none',
        bos,
        bosType: bosType || 'none',
        sweep: sweepDetected ? sweepType : 'none',
        fvg: fvg ? fvg.type : 'none',
        swingHighs: swingHighs.length,
        swingLows: swingLows.length,
        lastSwingHigh: lastSH.price,
        lastSwingLow: lastSL.price,
        currentPrice,
        allSwingHighs: swingHighs,
        allSwingLows: swingLows,
        fvgs,
        basis: '40-day-structure'
    };
}


// ══════════════════════════════════════════════════════════════
// STRUCTURE BREAKDOWN ALERTS
// Compares current structure to entry structure for holdings + watchlist
// ══════════════════════════════════════════════════════════════

function checkStructureBreakdowns(holdings, watchlist, scanData) {
    const alerts = [];

    // Build combined list of symbols to check
    const symbolsToCheck = [];

    for (const holding of holdings) {
        symbolsToCheck.push({
            symbol: holding.symbol,
            entryStructure: holding.entryStructure,
            source: 'holding'
        });
    }
    for (const item of watchlist) {
        symbolsToCheck.push({
            symbol: item.symbol,
            entryStructure: null, // Watchlist items don't have entry structure
            source: 'watchlist'
        });
    }

    for (const { symbol, entryStructure, source } of symbolsToCheck) {
        const data = scanData[symbol];
        if (!data || !data.structureResult) continue;

        const sr = data.structureResult;

        // Critical: Bearish CHoCH (structure reversal)
        if (sr.choch && sr.chochType === 'bearish') {
            alerts.push({
                symbol,
                type: 'bearish-choch',
                severity: 'critical',
                message: `${symbol}: Bearish CHoCH detected — structure reversal from bullish to bearish`,
                currentValue: sr.structureScore,
                entryValue: entryStructure ? entryStructure.structureScore : null
            });
        }

        // High: Bearish BOS (broke below swing low)
        if (sr.bos && sr.bosType === 'bearish') {
            alerts.push({
                symbol,
                type: 'bearish-bos',
                severity: 'high',
                message: `${symbol}: Bearish BOS — price broke below swing low, confirming bearish trend`,
                currentValue: sr.structureScore,
                entryValue: entryStructure ? entryStructure.structureScore : null
            });
        }

        // High: High-swept liquidity
        if (sr.sweep === 'high-swept') {
            alerts.push({
                symbol,
                type: 'high-swept',
                severity: 'high',
                message: `${symbol}: Buy-side liquidity swept — wick above swing high, close below. Bearish reversal signal`,
                currentValue: sr.structureScore,
                entryValue: entryStructure ? entryStructure.structureScore : null
            });
        }

        // Medium: Structure score degraded significantly from entry
        // Only applies to holdings (which have an entry structure)
        if (source === 'holding' && entryStructure) {
            const scoreDrop = entryStructure.structureScore - sr.structureScore;
            if (scoreDrop >= 2) {
                alerts.push({
                    symbol,
                    type: 'structure-degraded',
                    severity: 'medium',
                    message: `${symbol}: Structure score degraded from ${entryStructure.structureScore} to ${sr.structureScore} since entry`,
                    currentValue: sr.structureScore,
                    entryValue: entryStructure.structureScore
                });
            }
        }
    }

    return alerts;
}


// ══════════════════════════════════════════════════════════════
// SELL TARGET GENERATION
// Derives stop loss, T1, T2, R:R from structure and indicator data
// ══════════════════════════════════════════════════════════════

function deriveSellTargets(entryPrice, structureData, indicatorData) {
    const { allSwingHighs, allSwingLows, fvgs, currentPrice } = structureData;
    const { sma20, sma50 } = indicatorData;

    // Stop Loss: nearest swing low BELOW entry price (sorted descending, pick first)
    const lowsBelow = allSwingLows
        .filter(sl => sl.price < entryPrice)
        .sort((a, b) => b.price - a.price); // Nearest (highest) first
    const stopLoss = lowsBelow.length > 0 ? lowsBelow[0].price : null;

    // Target 1: nearest swing high ABOVE entry price (sorted ascending, pick first)
    const highsAbove = allSwingHighs
        .filter(sh => sh.price > entryPrice)
        .sort((a, b) => a.price - b.price); // Nearest (lowest) first
    const target1 = highsAbove.length > 0 ? highsAbove[0].price : null;

    // Target 2: next swing high above Target 1
    const target2 = (target1 !== null && highsAbove.length > 1) ? highsAbove[1].price : null;

    // Risk/Reward: (target1 - entryPrice) / (entryPrice - stopLoss)
    let riskReward = null;
    if (target1 !== null && stopLoss !== null) {
        const risk = entryPrice - stopLoss;
        const reward = target1 - entryPrice;
        if (risk > 0) {
            riskReward = Math.round((reward / risk) * 100) / 100;
        }
    }

    // FVG zones near current price (within 10% range)
    const priceRef = currentPrice || entryPrice;
    const fvgRange = priceRef * 0.10;
    const fvgZones = (fvgs || []).filter(fvg => {
        const midpoint = (fvg.gapTop + fvg.gapBottom) / 2;
        return Math.abs(midpoint - priceRef) <= fvgRange;
    });

    return {
        stopLoss,
        target1,
        target2,
        riskReward,
        dynamicSupport: { sma20, sma50 },
        fvgZones
    };
}


module.exports = {
    detectStructure,
    checkStructureBreakdowns,
    deriveSellTargets
};
