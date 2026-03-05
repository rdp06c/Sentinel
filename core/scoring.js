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
// params: { momentumScore, rsNormalized, sectorFlow, structureScore, isAccelerating,
//           upDays, totalDays, todayChange, totalReturn5d, rsi, macdCrossover,
//           daysToCover, volumeTrend, fvg, signalAdjustments, sma20, currentPrice,
//           smaCrossover, calFresh }
// weights: active weight object (from getActiveWeights)
function calculateCompositeScore(params, weights) {
    const w = weights || DEFAULT_WEIGHTS;
    const breakdown = {};
    let total = 0;

    // --- Momentum component ---
    const momentumScore = params.momentumScore || 0;
    const momentumComponent = (momentumScore - 5) * w.momentumMultiplier;
    breakdown.momentum = Math.round(momentumComponent * 100) / 100;
    total += momentumComponent;

    // --- Relative strength component ---
    const rsNormalized = params.rsNormalized || 50;
    const rsComponent = (rsNormalized - 50) / 10 * w.rsMultiplier;
    breakdown.relativeStrength = Math.round(rsComponent * 100) / 100;
    total += rsComponent;

    // --- Structure component ---
    const structureScore = params.structureScore || 0;
    const structureComponent = structureScore * w.structureMultiplier;
    breakdown.structure = Math.round(structureComponent * 100) / 100;
    total += structureComponent;

    // --- Acceleration bonus ---
    let accelComponent = 0;
    if (params.isAccelerating && momentumScore > 5) {
        accelComponent = w.accelBonus;
    }
    breakdown.acceleration = Math.round(accelComponent * 100) / 100;
    total += accelComponent;

    // --- Consistency bonus ---
    let consistencyComponent = 0;
    const upDays = params.upDays || 0;
    const totalDays = params.totalDays || 1;
    const upRatio = upDays / totalDays;
    if (upRatio >= 0.8) {
        consistencyComponent = w.consistencyBonus;
    } else if (upRatio <= 0.2) {
        consistencyComponent = -w.consistencyBonus;
    }
    breakdown.consistency = Math.round(consistencyComponent * 100) / 100;
    total += consistencyComponent;

    // --- Sector flow component ---
    let sectorComponent = 0;
    const sectorFlow = params.sectorFlow || 'neutral';
    if (sectorFlow === 'inflow') sectorComponent = w.sectorInflow;
    else if (sectorFlow === 'modest-inflow') sectorComponent = w.sectorModestInflow;
    else if (sectorFlow === 'outflow') sectorComponent = w.sectorOutflow;
    breakdown.sectorFlow = Math.round(sectorComponent * 100) / 100;
    total += sectorComponent;

    // --- RSI component ---
    let rsiComponent = 0;
    const rsi = params.rsi;
    if (rsi != null) {
        if (rsi < 30) rsiComponent = w.rsiOversold30;
        else if (rsi < 40) rsiComponent = w.rsiOversold40;
        else if (rsi < 50) rsiComponent = w.rsiOversold50;
        else if (rsi > 80) rsiComponent = w.rsiOverbought80;
        else if (rsi > 70) rsiComponent = w.rsiOverbought70;
    }
    breakdown.rsi = Math.round(rsiComponent * 100) / 100;
    total += rsiComponent;

    // --- MACD crossover component ---
    let macdComponent = 0;
    const macdCrossover = params.macdCrossover || 'none';
    if (macdCrossover === 'bullish') macdComponent = w.macdBullish;
    else if (macdCrossover === 'bearish') macdComponent = w.macdBearish;
    else macdComponent = w.macdNone;
    breakdown.macd = Math.round(macdComponent * 100) / 100;
    total += macdComponent;

    // --- RS mean reversion penalty ---
    let rsMeanRevComponent = 0;
    if (rsNormalized > 95) rsMeanRevComponent = w.rsMeanRev95;
    else if (rsNormalized > 90) rsMeanRevComponent = w.rsMeanRev90;
    else if (rsNormalized > 85) rsMeanRevComponent = w.rsMeanRev85;
    breakdown.rsMeanReversion = Math.round(rsMeanRevComponent * 100) / 100;
    total += rsMeanRevComponent;

    // --- Short squeeze bonus ---
    let squeezeComponent = 0;
    const daysToCover = params.daysToCover || 0;
    const volumeTrend = params.volumeTrend || 1;
    if (daysToCover > 5 && volumeTrend > 1.5) squeezeComponent = w.squeezeBonusHigh;
    else if (daysToCover > 3 && volumeTrend > 1.2) squeezeComponent = w.squeezeBonusMod;
    breakdown.shortSqueeze = Math.round(squeezeComponent * 100) / 100;
    total += squeezeComponent;

    // --- SMA proximity component ---
    let smaProxComponent = 0;
    const sma20 = params.sma20;
    const currentPrice = params.currentPrice;
    if (sma20 && currentPrice && sma20 > 0) {
        const smaDistance = ((currentPrice - sma20) / sma20) * 100;
        if (smaDistance >= 0 && smaDistance <= 3) smaProxComponent = w.smaProxNear;
        else if (smaDistance < 0 && smaDistance >= -3) smaProxComponent = w.smaProxBelow;
        else if (smaDistance > 15) smaProxComponent = w.smaProxFar15;
        else if (smaDistance > 10) smaProxComponent = w.smaProxFar10;
    }
    breakdown.smaProximity = Math.round(smaProxComponent * 100) / 100;
    total += smaProxComponent;

    // --- SMA crossover component ---
    let smaCrossComponent = 0;
    const smaCrossover = params.smaCrossover || 'none';
    if (smaCrossover === 'bullish') smaCrossComponent = w.smaCrossoverBullish;
    else if (smaCrossover === 'bearish') smaCrossComponent = w.smaCrossoverBearish;
    breakdown.smaCrossover = Math.round(smaCrossComponent * 100) / 100;
    total += smaCrossComponent;

    // --- FVG component ---
    let fvgComponent = 0;
    const fvg = params.fvg;
    if (fvg) {
        if (fvg === 'bullish') fvgComponent = w.fvgBullish;
        else if (fvg === 'bearish') fvgComponent = w.fvgBearish;
    }
    breakdown.fvg = Math.round(fvgComponent * 100) / 100;
    total += fvgComponent;

    // --- Entry timing multiplier (extension penalty / pullback bonus) ---
    let entryMultiplier = 1.0;
    const totalReturn5d = params.totalReturn5d || 0;
    if (totalReturn5d > 15) entryMultiplier = w.entryMultExtreme;
    else if (totalReturn5d > 8) entryMultiplier = w.entryMultExtended;
    else if (totalReturn5d < -3 && totalReturn5d > -10) entryMultiplier = w.entryMultPullback;
    breakdown.entryMultiplier = entryMultiplier;

    // Apply entry multiplier to total (only when not 1.0)
    if (entryMultiplier !== 1.0 && total > 0) {
        const preMult = total;
        total = total * entryMultiplier;
        breakdown.entryAdjustment = Math.round((total - preMult) * 100) / 100;
    } else {
        breakdown.entryAdjustment = 0;
    }

    // --- Signal adjustments from learning system ---
    let signalAdj = 0;
    if (params.signalAdjustments && params.calFresh) {
        signalAdj = params.signalAdjustments;
    }
    breakdown.signalAdjustment = Math.round(signalAdj * 100) / 100;
    total += signalAdj;

    total = Math.round(total * 100) / 100;

    return { total, breakdown };
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
        // Percentile: position from top. Index 0 = top = 100th percentile
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
        // Demote lowest-ranked stocks that have conviction > 3
        // Walk from bottom of sorted (lowest scores) upward
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
