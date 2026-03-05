'use strict';

const DEFAULT_WEIGHTS = {
    momentumMultiplier: 0.6, rsMultiplier: 0.6, structureMultiplier: 1.25,
    accelBonus: 1.5, consistencyBonus: 1.0,
    sectorInflow: 2.0, sectorModestInflow: 1.0, sectorOutflow: -1.0,
    rsiOversold30: 2.5, rsiOversold40: 1.5, rsiOversold50: 0.5,
    rsiOverbought70: -3.0, rsiOverbought80: -5.0,
    macdBullish: 2.5, macdBearish: -2.0, macdNone: -0.5,
    rsMeanRev95: -6.0, rsMeanRev90: -4.0, rsMeanRev85: -2.0,
    squeezeBonusHigh: 1.5, squeezeBonusMod: 0.75,
    smaProxNear: 2.0, smaProxBelow: 1.0, smaProxFar15: -1.5, smaProxFar10: -0.5,
    smaCrossoverBullish: 2.0, smaCrossoverBearish: -2.0,
    fvgBullish: 0.5, fvgBearish: -0.5,
    entryMultExtreme: 0.3, entryMultExtended: 0.6, entryMultPullback: 1.3
};

// Returns active weights based on calibration data and current VIX level.
// calibratedWeights: object from calibration engine (or null for defaults)
// vixLevel: current VIX value (or null if unavailable)
function getActiveWeights(calibratedWeights, vixLevel) {
    if (!calibratedWeights) return DEFAULT_WEIGHTS;
    if (vixLevel != null && calibratedWeights.regimeWeights) {
        return vixLevel < 20
            ? calibratedWeights.regimeWeights.lowVix || calibratedWeights.weights || DEFAULT_WEIGHTS
            : calibratedWeights.regimeWeights.highVix || calibratedWeights.weights || DEFAULT_WEIGHTS;
    }
    return calibratedWeights.weights || DEFAULT_WEIGHTS;
}

// Composite scoring: ~20 weighted components producing a total score + breakdown.
// rsNormalized: 0-10 scale (RS percentile / 10). Multiplied by 0.6 internally for 0-6 contribution.
// params: { momentumScore, rsNormalized, sectorFlow, structureScore, isAccelerating,
//           upDays, totalDays, todayChange, totalReturn5d, rsi, macdCrossover,
//           daysToCover, volumeTrend, fvg, signalAdjustments, sma20, currentPrice,
//           smaCrossover, calFresh }
// weights: active weight object (from getActiveWeights)
function calculateCompositeScore(params, weights) {
    const w = weights || DEFAULT_WEIGHTS;

    const momentumScore = params.momentumScore || 0;
    const rsNormalized = params.rsNormalized || 5;
    const structureScore = params.structureScore || 0;
    const sectorFlow = params.sectorFlow || 'neutral';
    const todayChange = params.todayChange || 0;
    const ret5d = params.totalReturn5d ?? 0;
    const rsi = params.rsi;
    const macdCrossover = params.macdCrossover || 'none';
    const vt = params.volumeTrend ?? 1;

    // --- Core components (no centering — raw multiplication) ---
    const momentumContrib = momentumScore * w.momentumMultiplier;
    const rsContrib = rsNormalized * w.rsMultiplier;
    const structureBonus = (structureScore || 0) * w.structureMultiplier;

    // --- Sector flow ---
    let sectorBonus = 0;
    if (sectorFlow === 'inflow') sectorBonus = w.sectorInflow;
    else if (sectorFlow === 'modest-inflow') sectorBonus = w.sectorModestInflow;
    else if (sectorFlow === 'outflow') sectorBonus = w.sectorOutflow;

    // --- Acceleration bonus (requires momentum >= 6) ---
    const accelBonus = (params.isAccelerating && momentumScore >= 6) ? w.accelBonus : 0;

    // --- Consistency bonus (positive only — upDays >= 3 out of >= 4 total) ---
    const upDays = params.upDays || 0;
    const totalDays = params.totalDays || 1;
    const consistencyBonus = (upDays >= 3 && totalDays >= 4) ? w.consistencyBonus : 0;

    // --- Runner penalty (today's intraday move too extended) ---
    const runnerPenalty = todayChange >= 15 ? -3
        : todayChange >= 10 ? -2
        : todayChange >= 7 ? -1
        : todayChange >= 5 ? -0.5
        : 0;

    // Decline penalty removed: calibration data showed it was anti-predictive
    const declinePenalty = 0;

    // --- Extension penalty (momentum + RS both too high = mean reversion risk) ---
    const extensionPenalty = (momentumScore >= 9 && rsNormalized >= 8.5) ? -5
        : (momentumScore >= 9 || rsNormalized >= 8.5) ? -3.5
        : (momentumScore >= 8 || rsNormalized >= 8) ? -2
        : (momentumScore >= 7.5 || rsNormalized >= 7.5) ? -1
        : 0;

    // --- Pullback bonus (5-tier: dip in strong structure = buying opportunity) ---
    const pullbackBonus =
        (ret5d >= -8 && ret5d <= -2 && (structureScore ?? 0) >= 2 && sectorFlow !== 'outflow') ? 5
        : (ret5d >= -8 && ret5d <= -2 && (structureScore ?? 0) >= 1 && sectorFlow !== 'outflow' && sectorFlow !== 'modest-outflow') ? 4
        : (ret5d >= -5 && ret5d < 0 && (structureScore ?? 0) >= 1 && sectorFlow !== 'outflow') ? 3
        : (ret5d >= -8 && ret5d <= -2 && (structureScore ?? 0) >= 0) ? 2
        : (ret5d >= -5 && ret5d < 0 && (structureScore ?? 0) >= 0 && sectorFlow !== 'outflow') ? 1
        : 0;

    // --- RSI component ---
    const rsiBonusPenalty = rsi != null
        ? (rsi < 30 ? w.rsiOversold30 : rsi < 40 ? w.rsiOversold40 : rsi < 50 ? w.rsiOversold50
            : rsi > 80 ? w.rsiOverbought80 : rsi > 70 ? w.rsiOverbought70 : 0)
        : 0;

    // --- MACD crossover ---
    const macdBonus = macdCrossover === 'bullish' ? w.macdBullish
        : macdCrossover === 'bearish' ? w.macdBearish
        : w.macdNone;

    // --- RS mean reversion penalty (0-10 scale thresholds) ---
    const rsMeanRevPenalty = rsNormalized >= 9.5 ? w.rsMeanRev95
        : rsNormalized >= 9 ? w.rsMeanRev90
        : rsNormalized >= 8.5 ? w.rsMeanRev85
        : 0;

    // --- Short squeeze bonus (requires structure support) ---
    const dtc = params.daysToCover || 0;
    const squeezeBonus = (dtc > 5 && (structureScore ?? 0) >= 1 && sectorFlow !== 'outflow') ? w.squeezeBonusHigh
        : (dtc > 3 && (structureScore ?? 0) >= 1) ? w.squeezeBonusMod
        : 0;

    // --- Volume bonus (momentum + volume confirmation) ---
    const volumeBonus = (momentumScore >= 7 && vt < 0.7) ? -2.0
        : (momentumScore >= 7 && vt > 1.3) ? 1.0
        : (momentumScore < 5 && vt > 1.5 && (structureScore ?? 0) >= 0) ? 1.5
        : (vt > 1.2 ? 0.5 : vt < 0.8 ? -0.5 : 0);

    // --- FVG bonus (conditional on pullback for bullish, weak structure for bearish) ---
    const fvg = params.fvg;
    const fvgBonus = (fvg === 'bullish' && ret5d < 0 && (structureScore ?? 0) >= 0) ? w.fvgBullish
        : (fvg === 'bearish' && (structureScore ?? 0) < 0) ? w.fvgBearish
        : 0;

    // --- SMA proximity (requires structure support for positive bonuses) ---
    let smaProximityBonus = 0;
    const sma20 = params.sma20;
    const currentPrice = params.currentPrice;
    if (sma20 != null && currentPrice != null && sma20 > 0) {
        const pctFromSMA20 = ((currentPrice - sma20) / sma20) * 100;
        if (pctFromSMA20 >= 0 && pctFromSMA20 <= 3 && (structureScore ?? 0) >= 1) smaProximityBonus = w.smaProxNear;
        else if (pctFromSMA20 < 0 && pctFromSMA20 >= -3 && (structureScore ?? 0) >= 1) smaProximityBonus = w.smaProxBelow;
        else if (pctFromSMA20 > 15) smaProximityBonus = w.smaProxFar15;
        else if (pctFromSMA20 > 10) smaProximityBonus = w.smaProxFar10;
    }

    // --- SMA crossover ---
    const smaCrossover = params.smaCrossover || 'none';
    const smaCrossoverBonus = smaCrossover === 'bullish' ? w.smaCrossoverBullish
        : smaCrossover === 'bearish' ? w.smaCrossoverBearish
        : 0;

    // --- Learning-based signal adjustments (suppressed when fresh calibration exists) ---
    let learnedAdj = 0;
    const signalAdjustments = params.signalAdjustments;
    if (signalAdjustments && typeof signalAdjustments === 'object' && !params.calFresh) {
        if (rsi > 70 && signalAdjustments.overboughtRsiExtraPenalty) learnedAdj += signalAdjustments.overboughtRsiExtraPenalty;
        if (macdCrossover === 'bullish' && signalAdjustments.bullishMacdExtraBonus) learnedAdj += signalAdjustments.bullishMacdExtraBonus;
        if ((structureScore ?? 0) < 0 && signalAdjustments.bearishStructureExtraPenalty) learnedAdj += signalAdjustments.bearishStructureExtraPenalty;
        if (todayChange >= 5 && signalAdjustments.runnerExtraPenalty) learnedAdj += signalAdjustments.runnerExtraPenalty;
    }

    // --- Sum all additive components ---
    const additiveScore = momentumContrib + rsContrib + sectorBonus + accelBonus + consistencyBonus
        + structureBonus + extensionPenalty + pullbackBonus + runnerPenalty + declinePenalty
        + rsiBonusPenalty + macdBonus + rsMeanRevPenalty + squeezeBonus + volumeBonus + fvgBonus
        + smaProximityBonus + smaCrossoverBonus + learnedAdj;

    // --- Entry timing multiplier (applied to positive scores only) ---
    let entryMultiplier = 1.0;
    if (additiveScore > 0) {
        if (rsi != null && rsi > 80 && momentumScore >= 9) entryMultiplier = w.entryMultExtreme;
        else if ((rsi != null && rsi > 70) || momentumScore >= 9 || rsNormalized >= 9) entryMultiplier = w.entryMultExtended;
        else if (ret5d >= -8 && ret5d <= -1 && (structureScore ?? 0) >= 1) entryMultiplier = w.entryMultPullback;
    }

    const compositeScore = Math.round(additiveScore * entryMultiplier * 100) / 100;

    return {
        total: compositeScore,
        breakdown: {
            momentumContrib, rsContrib, sectorBonus, accelBonus, consistencyBonus,
            structureBonus, extensionPenalty, pullbackBonus, runnerPenalty, declinePenalty,
            rsiBonusPenalty, macdBonus, rsMeanRevPenalty, squeezeBonus, volumeBonus, fvgBonus,
            smaProximityBonus, smaCrossoverBonus, learnedAdj, entryMultiplier
        }
    };
}

// Percentile ranking + absolute floor -> conviction 1-10.
// scores: array of { symbol, compositeScore } for the full universe
// Returns: array of { symbol, compositeScore, conviction } where conviction is 1-10
function deriveConvictionRating(scores) {
    if (!scores || scores.length === 0) return [];

    // Sort by compositeScore descending
    const sorted = scores
        .map(s => ({ symbol: s.symbol, compositeScore: s.compositeScore }))
        .sort((a, b) => b.compositeScore - a.compositeScore);

    const n = sorted.length;

    // Assign percentile rank (0-100) — rank 0 = lowest, 100 = highest
    for (let i = 0; i < n; i++) {
        sorted[i].percentile = ((n - 1 - i) / (n - 1 || 1)) * 100;
    }

    // Map to 1-10 scale
    for (let i = 0; i < n; i++) {
        let conviction = Math.round(sorted[i].percentile / 10);
        // Clamp to 1-10
        conviction = Math.max(1, Math.min(10, conviction));

        // Absolute floor: prevent inflated ratings for negative-score stocks
        if (sorted[i].compositeScore < -10) conviction = Math.min(conviction, 1);
        else if (sorted[i].compositeScore < -5) conviction = Math.min(conviction, 2);
        else if (sorted[i].compositeScore < 0) conviction = Math.min(conviction, 3);

        sorted[i].conviction = conviction;
    }

    // Enforce no-inflation rule: at least 20% of stocks must be conviction <= 3
    const threshold = Math.ceil(n * 0.2);
    const lowCount = sorted.filter(s => s.conviction <= 3).length;
    if (lowCount < threshold) {
        let demoted = lowCount;
        for (let i = n - 1; i >= 0 && demoted < threshold; i--) {
            if (sorted[i].conviction > 3) {
                sorted[i].conviction = 3;
                demoted++;
            }
        }
    }

    return sorted;
}

module.exports = {
    DEFAULT_WEIGHTS,
    getActiveWeights,
    calculateCompositeScore,
    deriveConvictionRating
};
