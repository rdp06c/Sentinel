'use strict';

const { DEFAULT_WEIGHTS } = require('./scoring');

// ── Helper: Pearson correlation coefficient ──
function pearsonCorrelation(xs, ys) {
    const n = xs.length;
    if (n < 3) return 0;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sumX2 = xs.reduce((a, x) => a + x * x, 0);
    const sumY2 = ys.reduce((a, y) => a + y * y, 0);
    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

// ── Helper: generate weekday date strings between two dates ──
function generateWeekdays(startDate, endDate) {
    const dates = [];
    const d = new Date(startDate);
    d.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    while (d <= end) {
        if (d.getDay() !== 0 && d.getDay() !== 6) {
            dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        }
        d.setDate(d.getDate() + 1);
    }
    return dates;
}

// ── Helper: parse date string as local time ──
function parseLocalDate(dateStr) {
    if (dateStr instanceof Date) return new Date(dateStr);
    // 'YYYY-MM-DD' → local midnight (avoid UTC interpretation)
    return new Date(dateStr + 'T00:00:00');
}

// ── Helper: N weekdays before a date (ascending order) ──
function getWeekdaysBefore(date, count) {
    const dates = [];
    const d = parseLocalDate(date);
    d.setHours(0, 0, 0, 0);
    while (dates.length < count) {
        d.setDate(d.getDate() - 1);
        if (d.getDay() !== 0 && d.getDay() !== 6) {
            dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        }
    }
    return dates.reverse();
}

// ── Helper: N weekdays after a date (ascending order) ──
function getWeekdaysAfter(date, count) {
    const dates = [];
    const d = parseLocalDate(date);
    d.setHours(0, 0, 0, 0);
    while (dates.length < count) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0 && d.getDay() !== 6) {
            dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        }
    }
    return dates;
}

// ── Map scoring breakdown keys to weight keys ──
const COMPONENT_TO_WEIGHT = {
    momentumContrib: 'momentumMultiplier',
    rsContrib: 'rsMultiplier',
    structureBonus: 'structureMultiplier',
    accelBonus: 'accelBonus',
    consistencyBonus: 'consistencyBonus',
    smaProximityBonus: 'smaProxNear',
    smaCrossoverBonus: 'smaCrossoverBullish',
    rsiBonusPenalty: 'rsiOversold30',
    macdBonus: 'macdBullish',
    rsMeanRevPenalty: 'rsMeanRev95',
    squeezeBonus: 'squeezeBonusHigh',
    fvgBonus: 'fvgBullish'
};

// ── Proportional ratio maps for related weights ──
const RELATED_RATIOS = {
    smaProxBelow: { base: 'smaProxNear', ref: 'smaProxBelow' },
    smaProxFar15: { base: 'smaProxNear', ref: 'smaProxFar15' },
    smaProxFar10: { base: 'smaProxNear', ref: 'smaProxFar10' },
    smaCrossoverBearish: { base: 'smaCrossoverBullish', ref: 'smaCrossoverBearish' },
    rsiOversold40: { base: 'rsiOversold30', ref: 'rsiOversold40' },
    rsiOversold50: { base: 'rsiOversold30', ref: 'rsiOversold50' },
    rsiOverbought70: { base: 'rsiOversold30', ref: 'rsiOverbought70' },
    rsiOverbought80: { base: 'rsiOversold30', ref: 'rsiOverbought80' },
    macdBearish: { base: 'macdBullish', ref: 'macdBearish' },
    macdNone: { base: 'macdBullish', ref: 'macdNone' },
    rsMeanRev90: { base: 'rsMeanRev95', ref: 'rsMeanRev90' },
    rsMeanRev85: { base: 'rsMeanRev95', ref: 'rsMeanRev85' },
    squeezeBonusMod: { base: 'squeezeBonusHigh', ref: 'squeezeBonusMod' },
    fvgBearish: { base: 'fvgBullish', ref: 'fvgBearish' },
    sectorModestInflow: { base: 'sectorInflow', ref: 'sectorModestInflow' },
    sectorOutflow: { base: 'sectorInflow', ref: 'sectorOutflow' }
};

// ── Calibrate a weight set from observations ──
// observations: array of { breakdown: {...}, return10d }
// baseWeights: DEFAULT_WEIGHTS or similar
// componentCorrelations: optional pre-computed correlations (for entry multiplier calibration)
function calibrateWeightSet(observations, baseWeights, componentCorrelations) {
    const SCALE_FACTOR = 2.0;
    const MAX_CHANGE = 0.5; // ±50% from default
    const shrinkage = Math.min(0.8, observations.length / 10000);

    const weights = { ...baseWeights };
    const ret10dArr = observations.map(o => o.return10d);

    for (const [compKey, weightKey] of Object.entries(COMPONENT_TO_WEIGHT)) {
        const vals = observations.map(o => o.breakdown[compKey] || 0);
        const corr = pearsonCorrelation(vals, ret10dArr);
        const adjustment = Math.max(-MAX_CHANGE, Math.min(MAX_CHANGE, corr * SCALE_FACTOR));
        const calibrated = baseWeights[weightKey] * (1 + adjustment);
        weights[weightKey] = parseFloat((shrinkage * calibrated + (1 - shrinkage) * baseWeights[weightKey]).toFixed(4));
    }

    // Propagate related weights proportionally
    const ratioGroups = {};
    for (const [derivedKey, { base, ref }] of Object.entries(RELATED_RATIOS)) {
        if (!ratioGroups[base]) ratioGroups[base] = [];
        ratioGroups[base].push({ derivedKey, ratio: baseWeights[ref] / baseWeights[base] });
    }
    for (const [baseKey, derived] of Object.entries(ratioGroups)) {
        if (weights[baseKey] !== baseWeights[baseKey]) {
            for (const { derivedKey, ratio } of derived) {
                weights[derivedKey] = parseFloat((weights[baseKey] * ratio).toFixed(4));
            }
        }
    }

    // Entry multiplier calibration from component correlations
    if (componentCorrelations) {
        const pullbackCorr = componentCorrelations.pullbackBonus?.corr10d || 0;
        if (pullbackCorr > 0.05) {
            weights.entryMultPullback = parseFloat(Math.min(1.5, baseWeights.entryMultPullback * (1 + pullbackCorr)).toFixed(4));
        }
        const extensionCorr = componentCorrelations.extensionPenalty?.corr10d || 0;
        if (extensionCorr < -0.05) {
            weights.entryMultExtreme = parseFloat(Math.max(0.15, baseWeights.entryMultExtreme * (1 + extensionCorr)).toFixed(4));
            weights.entryMultExtended = parseFloat(Math.max(0.3, baseWeights.entryMultExtended * (1 + extensionCorr)).toFixed(4));
        }
    }

    return weights;
}

// ── Component correlation analysis ──
const COMPONENT_KEYS = [
    'momentumContrib', 'rsContrib', 'structureBonus', 'accelBonus', 'consistencyBonus',
    'rsiBonusPenalty', 'macdBonus', 'rsMeanRevPenalty', 'squeezeBonus', 'volumeBonus',
    'fvgBonus', 'smaProximityBonus', 'smaCrossoverBonus', 'extensionPenalty',
    'pullbackBonus', 'runnerPenalty', 'declinePenalty'
];

function computeComponentCorrelations(observations) {
    const returns10d = observations.map(o => o.return10d);
    const correlations = {};

    for (const key of COMPONENT_KEYS) {
        const values = observations.map(o => o.breakdown[key] || 0);
        const corr = pearsonCorrelation(values, returns10d);

        // Quintile analysis
        const sorted = observations.map((o, i) => ({ val: values[i], ret: o.return10d }))
            .sort((a, b) => a.val - b.val);
        const qSize = Math.floor(sorted.length / 5);
        const quintiles = [];
        for (let q = 0; q < 5; q++) {
            const start = q * qSize;
            const end = q === 4 ? sorted.length : (q + 1) * qSize;
            const slice = sorted.slice(start, end);
            quintiles.push(slice.length > 0 ? slice.reduce((s, x) => s + x.ret, 0) / slice.length : 0);
        }

        correlations[key] = {
            corr10d: parseFloat(corr.toFixed(4)),
            topQuintileAvg: parseFloat(quintiles[4].toFixed(2)),
            bottomQuintileAvg: parseFloat(quintiles[0].toFixed(2)),
            spread: parseFloat((quintiles[4] - quintiles[0]).toFixed(2))
        };
    }

    return correlations;
}

// ══════════════════════════════════════════════════════════════
// MAIN: runCalibrationSweep
// ══════════════════════════════════════════════════════════════
//
// opts: {
//   startDate: 'YYYY-MM-DD' (optional — defaults to 12 months ago),
//   endDate: 'YYYY-MM-DD' (optional — defaults to 12 trading days ago),
//   fetchGroupedDaily: async (dateStr) => { [symbol]: { o, h, l, c, v, t } },
//   universe: string[] of symbols,
//   scoreFn: (scoreInputs) => { total, breakdown },
//   stockSectors: { [symbol]: sectorName },
//   vixByDate: { [dateStr]: vixLevel } (optional),
//   progressCallback: (msg) => void (optional)
// }
//
// Returns: { sampledDates, dataPoints, dateRange, sortedCorr, weightChanges,
//            validation, regimeSplit, calibratedWeights, regimeWeights }
async function runCalibrationSweep(opts) {
    const {
        fetchGroupedDaily,
        universe,
        scoreFn,
        stockSectors: sectorMap,
        vixByDate = {},
        progressCallback
    } = opts;

    const report = (msg) => { if (progressCallback) progressCallback(msg); };

    // Validate dates
    const startDate = opts.startDate ? new Date(opts.startDate) : null;
    const endDate = opts.endDate ? new Date(opts.endDate) : null;

    if (!startDate && !endDate) {
        // Default: 12 months ago → 12 trading days ago
        const today = new Date();
        const endDefault = new Date(today);
        let forwardBuffer = 0;
        while (forwardBuffer < 12) {
            endDefault.setDate(endDefault.getDate() - 1);
            if (endDefault.getDay() !== 0 && endDefault.getDay() !== 6) forwardBuffer++;
        }
        const startDefault = new Date(endDefault);
        startDefault.setMonth(startDefault.getMonth() - 12);
        opts.startDate = `${startDefault.getFullYear()}-${String(startDefault.getMonth() + 1).padStart(2, '0')}-${String(startDefault.getDate()).padStart(2, '0')}`;
        opts.endDate = `${endDefault.getFullYear()}-${String(endDefault.getMonth() + 1).padStart(2, '0')}-${String(endDefault.getDate()).padStart(2, '0')}`;
    }

    const rangeStart = new Date(opts.startDate);
    const rangeEnd = new Date(opts.endDate);
    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
        throw new Error('Invalid date format. Use YYYY-MM-DD.');
    }

    // Select up to 40 evenly-spaced calibration dates
    const allWeekdays = generateWeekdays(rangeStart, rangeEnd);
    const NUM_DATES = Math.min(40, allWeekdays.length);
    if (NUM_DATES < 5) throw new Error(`Only ${allWeekdays.length} trading days in range. Need at least 5.`);

    const calibrationDates = [];
    for (let i = 0; i < NUM_DATES; i++) {
        const idx = Math.round(i * (allWeekdays.length - 1) / (NUM_DATES - 1));
        calibrationDates.push(allWeekdays[idx]);
    }

    report(`Calibration: ${calibrationDates.length} dates from ${calibrationDates[0]} to ${calibrationDates[calibrationDates.length - 1]}`);

    // Compute full fetch window: earliest - 80 lookback to latest + 10 forward
    const lookbackDates = getWeekdaysBefore(calibrationDates[0], 80);
    const forwardDates = getWeekdaysAfter(calibrationDates[calibrationDates.length - 1], 10);
    const allFetchDates = [...new Set([...lookbackDates, ...calibrationDates, ...forwardDates])].sort();

    report(`Calibration: Fetching ${allFetchDates.length} dates of historical data...`);

    // Fetch ALL dates — build masterBars[symbol] = bars[]
    const masterBars = {};
    const universeSet = new Set(universe);
    const BATCH = 10;
    let fetchedCount = 0;

    for (let i = 0; i < allFetchDates.length; i += BATCH) {
        const batch = allFetchDates.slice(i, i + BATCH);
        await Promise.all(batch.map(async (date) => {
            try {
                const dayBars = await fetchGroupedDaily(date);
                if (dayBars) {
                    for (const [sym, bar] of Object.entries(dayBars)) {
                        if (!universeSet.has(sym)) continue;
                        if (!masterBars[sym]) masterBars[sym] = [];
                        masterBars[sym].push(bar);
                    }
                    fetchedCount++;
                }
            } catch (e) { /* skip failed dates */ }
        }));
    }

    // Sort all bars by timestamp
    for (const bars of Object.values(masterBars)) {
        bars.sort((a, b) => a.t - b.t);
    }
    report(`Fetched ${fetchedCount}/${allFetchDates.length} dates, ${Object.keys(masterBars).length} symbols`);

    // Split dates: 70% training, 30% validation
    const shuffled = [...calibrationDates];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const splitIdx = Math.floor(shuffled.length * 0.7);
    const trainingDates = shuffled.slice(0, splitIdx).sort();
    const validationDates = shuffled.slice(splitIdx).sort();

    // Run full pipeline for each calibration date, collect observations
    const allObservations = [];

    for (let di = 0; di < calibrationDates.length; di++) {
        const calDate = calibrationDates[di];
        const calTimestamp = new Date(calDate + 'T23:59:59').getTime();
        const isTraining = trainingDates.includes(calDate);

        if (di % 5 === 0) report(`Calibration: Analyzing date ${di + 1}/${calibrationDates.length} (${calDate})...`);

        // Slice lookback window: only bars <= calibration date, last 80
        const calMarketData = {};
        const calBarsMap = {};
        for (const sym of universe) {
            const allBars = masterBars[sym];
            if (!allBars) continue;
            const windowBars = allBars.filter(b => b.t <= calTimestamp);
            if (windowBars.length < 10) continue;
            const sliced = windowBars.slice(-80);
            calBarsMap[sym] = sliced;
            const last = sliced[sliced.length - 1];
            const prev = sliced.length >= 2 ? sliced[sliced.length - 2] : last;
            calMarketData[sym] = {
                price: last.c,
                change: last.c - prev.c,
                changePercent: prev.c !== 0 ? ((last.c - prev.c) / prev.c) * 100 : 0
            };
        }

        // Score every stock with the scoring function
        for (const [sym, data] of Object.entries(calMarketData)) {
            const bars = calBarsMap[sym];
            if (!bars || bars.length < 10) continue;

            const scoreInputs = {
                symbol: sym,
                price: data.price,
                changePercent: data.changePercent,
                bars,
                sector: sectorMap[sym] || 'Unknown'
            };

            const scoreResult = scoreFn(scoreInputs);

            // Look up forward returns from masterBars
            const futureBars = (masterBars[sym] || []).filter(b => b.t > calTimestamp);
            futureBars.sort((a, b) => a.t - b.t);
            const price5d = futureBars.length >= 5 ? futureBars[4].c : null;
            const price10d = futureBars.length >= 10 ? futureBars[9].c : null;
            const return5d = price5d ? ((price5d - data.price) / data.price) * 100 : null;
            const return10d = price10d ? ((price10d - data.price) / data.price) * 100 : null;

            if (return10d != null) {
                allObservations.push({
                    symbol: sym,
                    date: calDate,
                    isTraining,
                    scoreInputs,
                    score: scoreResult.total,
                    breakdown: scoreResult.breakdown,
                    return5d,
                    return10d,
                    vix: vixByDate[calDate] || null
                });
            }
        }
    }

    report(`Calibration: Computing correlations from ${allObservations.length} observations...`);

    if (allObservations.length < 20) {
        throw new Error(`Only ${allObservations.length} valid observations. Need at least 20.`);
    }

    const trainingObs = allObservations.filter(o => o.isTraining);
    const validationObs = allObservations.filter(o => !o.isTraining);

    // Compute component correlations from training data
    const componentCorrelations = computeComponentCorrelations(
        trainingObs.length >= 20 ? trainingObs : allObservations
    );

    // Calibrate blended weights
    const calibratedWeights = calibrateWeightSet(
        trainingObs.length >= 20 ? trainingObs : allObservations,
        DEFAULT_WEIGHTS,
        componentCorrelations
    );

    // Regime-segmented weights
    const lowVixObs = trainingObs.filter(o => o.vix != null && o.vix < 20);
    const highVixObs = trainingObs.filter(o => o.vix != null && o.vix >= 20);
    const regimeWeights = {};
    if (lowVixObs.length >= 50) regimeWeights.lowVix = calibrateWeightSet(lowVixObs, DEFAULT_WEIGHTS, componentCorrelations);
    if (highVixObs.length >= 50) regimeWeights.highVix = calibrateWeightSet(highVixObs, DEFAULT_WEIGHTS, componentCorrelations);

    // Out-of-sample validation: re-score validation obs with different weights
    function evaluateWithWeights(observations) {
        if (observations.length === 0) return 0;
        const dateGroups = {};
        observations.forEach(o => {
            if (!dateGroups[o.date]) dateGroups[o.date] = [];
            dateGroups[o.date].push(o);
        });
        let totalReturn = 0, count = 0;
        for (const obs of Object.values(dateGroups)) {
            const sorted = [...obs].sort((a, b) => b.score - a.score);
            sorted.slice(0, 25).forEach(o => { totalReturn += o.return10d; count++; });
        }
        return count > 0 ? totalReturn / count : 0;
    }

    const defaultAvg10d = evaluateWithWeights(validationObs.length >= 10 ? validationObs : allObservations);

    // Re-score with calibrated weights for comparison
    const calibratedScores = (validationObs.length >= 10 ? validationObs : allObservations).map(o => {
        const rescored = scoreFn(o.scoreInputs);
        return { ...o, score: rescored.total };
    });
    const calibratedDateGroups = {};
    calibratedScores.forEach(o => {
        if (!calibratedDateGroups[o.date]) calibratedDateGroups[o.date] = [];
        calibratedDateGroups[o.date].push(o);
    });
    let calibratedTotal = 0, calibratedCount = 0;
    for (const obs of Object.values(calibratedDateGroups)) {
        const sorted = [...obs].sort((a, b) => b.score - a.score);
        sorted.slice(0, 25).forEach(o => { calibratedTotal += o.return10d; calibratedCount++; });
    }
    const calibratedAvg10d = calibratedCount > 0 ? calibratedTotal / calibratedCount : 0;

    const improvement = calibratedAvg10d - defaultAvg10d;
    const overfitWarning = improvement < -0.5;

    // If overfitting detected, apply extra shrinkage (50/50 blend with defaults)
    let finalWeights = calibratedWeights;
    let finalRegimeWeights = regimeWeights;
    if (overfitWarning) {
        report('Overfitting detected — applying extra shrinkage (50/50 blend with defaults)');
        finalWeights = {};
        for (const key of Object.keys(DEFAULT_WEIGHTS)) {
            finalWeights[key] = parseFloat((0.5 * calibratedWeights[key] + 0.5 * DEFAULT_WEIGHTS[key]).toFixed(4));
        }
        if (regimeWeights.lowVix) {
            finalRegimeWeights.lowVix = {};
            for (const key of Object.keys(DEFAULT_WEIGHTS)) {
                finalRegimeWeights.lowVix[key] = parseFloat((0.5 * regimeWeights.lowVix[key] + 0.5 * DEFAULT_WEIGHTS[key]).toFixed(4));
            }
        }
        if (regimeWeights.highVix) {
            finalRegimeWeights.highVix = {};
            for (const key of Object.keys(DEFAULT_WEIGHTS)) {
                finalRegimeWeights.highVix[key] = parseFloat((0.5 * regimeWeights.highVix[key] + 0.5 * DEFAULT_WEIGHTS[key]).toFixed(4));
            }
        }
    }

    // Sort correlations by absolute value for reporting
    const sortedCorr = Object.entries(componentCorrelations)
        .sort((a, b) => Math.abs(b[1].corr10d) - Math.abs(a[1].corr10d));

    // Build key weight changes for reporting
    const weightChanges = {};
    for (const key of Object.keys(DEFAULT_WEIGHTS)) {
        const def = DEFAULT_WEIGHTS[key];
        const cal = finalWeights[key];
        const pctChange = def !== 0 ? ((cal - def) / Math.abs(def)) * 100 : 0;
        if (Math.abs(pctChange) > 3) {
            weightChanges[key] = { from: def, to: cal, pct: parseFloat(pctChange.toFixed(1)) };
        }
    }

    report('Calibration complete!');

    return {
        sampledDates: calibrationDates.length,
        dataPoints: allObservations.length,
        dateRange: { start: calibrationDates[0], end: calibrationDates[calibrationDates.length - 1] },
        sortedCorr,
        weightChanges,
        validation: {
            calibratedAvg10d: parseFloat(calibratedAvg10d.toFixed(2)),
            defaultAvg10d: parseFloat(defaultAvg10d.toFixed(2)),
            improvement: parseFloat(improvement.toFixed(2)),
            overfitWarning,
            trainingObs: trainingObs.length,
            validationObs: validationObs.length
        },
        calibratedWeights: finalWeights,
        regimeWeights: Object.keys(finalRegimeWeights).length > 0 ? finalRegimeWeights : null,
        componentCorrelations,
        regimeSplit: {
            lowVix: lowVixObs.length,
            highVix: highVixObs.length,
            hasLowVix: !!finalRegimeWeights.lowVix,
            hasHighVix: !!finalRegimeWeights.highVix
        }
    };
}

module.exports = {
    pearsonCorrelation,
    generateWeekdays,
    getWeekdaysBefore,
    getWeekdaysAfter,
    calibrateWeightSet,
    computeComponentCorrelations,
    runCalibrationSweep
};
