'use strict';

// Helper: calculate stats for a group of trades
function calcStats(trades) {
    if (!trades || trades.length === 0) return null;
    const wins = trades.filter(t => t.profitLoss > 0).length;
    return {
        count: trades.length,
        winRate: (wins / trades.length) * 100,
        avgReturn: trades.reduce((sum, t) => sum + t.returnPercent, 0) / trades.length
    };
}

// Analyze exit timing patterns from closed trades
function analyzeExitTiming(closedTrades) {
    if (!closedTrades || closedTrades.length < 3) {
        return { hasData: false };
    }

    const byReason = {
        profit_target: closedTrades.filter(t => t.exitReason === 'profit_target'),
        stop_loss: closedTrades.filter(t => t.exitReason === 'stop_loss'),
        catalyst_failure: closedTrades.filter(t => t.exitReason === 'catalyst_failure'),
        opportunity_cost: closedTrades.filter(t => t.exitReason === 'opportunity_cost'),
        manual: closedTrades.filter(t => t.exitReason === 'manual')
    };

    const analysis = {};
    Object.keys(byReason).forEach(reason => {
        const trades = byReason[reason];
        if (trades.length > 0) {
            const avgReturn = trades.reduce((sum, t) => sum + t.returnPercent, 0) / trades.length;
            const wins = trades.filter(t => t.profitLoss > 0).length;
            analysis[reason] = {
                count: trades.length,
                avgReturn,
                winRate: (wins / trades.length) * 100
            };
        }
    });

    const winners = closedTrades.filter(t => t.profitLoss > 0);
    const avgWinnerReturn = winners.length > 0
        ? winners.reduce((sum, t) => sum + t.returnPercent, 0) / winners.length
        : 0;

    const holdBuckets = {};
    closedTrades.forEach(t => {
        if (!t.holdTime) return;
        const days = Math.floor(t.holdTime / 86400000);
        const bucket = days <= 1 ? '0-1d' : days <= 3 ? '2-3d' : days <= 7 ? '4-7d' : days <= 14 ? '1-2w' : '2w+';
        if (!holdBuckets[bucket]) holdBuckets[bucket] = { wins: 0, losses: 0, totalReturn: 0, count: 0 };
        const b = holdBuckets[bucket];
        b.count++;
        b.totalReturn += t.returnPercent;
        if (t.profitLoss > 0) b.wins++; else b.losses++;
    });
    Object.values(holdBuckets).forEach(b => {
        b.winRate = b.count > 0 ? (b.wins / b.count) * 100 : 0;
        b.avgReturn = b.count > 0 ? b.totalReturn / b.count : 0;
    });

    return {
        hasData: true,
        byReason: analysis,
        avgWinnerReturn,
        profitTargetCount: byReason.profit_target.length,
        holdBuckets,
        insight: avgWinnerReturn < 15 && byReason.profit_target.length > 2
            ? "Consider holding winners longer - average win is only " + avgWinnerReturn.toFixed(1) + "%"
            : null
    };
}

// Analyze conviction accuracy from closed trades
function analyzeConvictionAccuracy(closedTrades) {
    if (!closedTrades) closedTrades = [];
    const tradesWithConviction = closedTrades.filter(t => t.entryConviction);

    if (tradesWithConviction.length < 5) {
        return { hasData: false, message: "Need 5+ trades to analyze conviction accuracy" };
    }

    const convictionGroups = {
        '9-10': tradesWithConviction.filter(t => t.entryConviction >= 9),
        '7-8': tradesWithConviction.filter(t => t.entryConviction >= 7 && t.entryConviction < 9),
        '5-6': tradesWithConviction.filter(t => t.entryConviction >= 5 && t.entryConviction < 7)
    };

    const analysis = {};
    Object.keys(convictionGroups).forEach(level => {
        const trades = convictionGroups[level];
        if (trades.length > 0) {
            const wins = trades.filter(t => t.profitLoss > 0).length;
            const winRate = (wins / trades.length) * 100;
            const avgReturn = trades.reduce((sum, t) => sum + t.returnPercent, 0) / trades.length;
            analysis[level] = {
                count: trades.length,
                winRate,
                avgReturn,
                calibration: winRate >= 70 ? 'well-calibrated' : winRate >= 50 ? 'slightly-overconfident' : 'overconfident'
            };
        }
    });

    return { hasData: true, analysis };
}

// Analyze technical indicator accuracy from closed trades
function analyzeTechnicalAccuracy(closedTrades) {
    if (!closedTrades) closedTrades = [];
    const tradesWithTechnicals = closedTrades.filter(t => t.entryTechnicals && Object.keys(t.entryTechnicals).length > 0);

    if (tradesWithTechnicals.length < 5) {
        return { hasData: false };
    }

    const momentumHigh = tradesWithTechnicals.filter(t => t.entryTechnicals.momentumScore != null && t.entryTechnicals.momentumScore >= 7);
    const momentumLow = tradesWithTechnicals.filter(t => t.entryTechnicals.momentumScore != null && t.entryTechnicals.momentumScore < 7);
    const rsHigh = tradesWithTechnicals.filter(t => t.entryTechnicals.rsScore != null && t.entryTechnicals.rsScore >= 70);
    const rsLow = tradesWithTechnicals.filter(t => t.entryTechnicals.rsScore != null && t.entryTechnicals.rsScore < 70);
    const sectorInflow = tradesWithTechnicals.filter(t => t.entryTechnicals.sectorRotation === 'accumulate' || t.entryTechnicals.sectorRotation === 'favorable');
    const sectorOutflow = tradesWithTechnicals.filter(t => t.entryTechnicals.sectorRotation === 'avoid' || t.entryTechnicals.sectorRotation === 'caution');

    const withTodayChg = tradesWithTechnicals.filter(t => t.entryTechnicals.todayChange != null);
    const runners = withTodayChg.filter(t => t.entryTechnicals.todayChange >= 5);
    const bigRunners = withTodayChg.filter(t => t.entryTechnicals.todayChange >= 10);
    const nonRunners = withTodayChg.filter(t => t.entryTechnicals.todayChange < 5);

    const withStructure = tradesWithTechnicals.filter(t => t.entryTechnicals.structure != null);
    const bullishStructure = withStructure.filter(t => t.entryTechnicals.structure === 'bullish');
    const bearishStructure = withStructure.filter(t => t.entryTechnicals.structure === 'bearish');
    const otherStructure = withStructure.filter(t => t.entryTechnicals.structure !== 'bullish' && t.entryTechnicals.structure !== 'bearish');
    const withChoch = withStructure.filter(t => t.entryTechnicals.choch);
    const withBos = withStructure.filter(t => t.entryTechnicals.bos);

    const withAccel = tradesWithTechnicals.filter(t => t.entryTechnicals.isAccelerating != null);
    const accelerating = withAccel.filter(t => t.entryTechnicals.isAccelerating);
    const decelerating = withAccel.filter(t => !t.entryTechnicals.isAccelerating);

    const withRegime = closedTrades.filter(t => t.entryMarketRegime);
    const bullRegime = withRegime.filter(t => t.entryMarketRegime === 'bull');
    const bearRegime = withRegime.filter(t => t.entryMarketRegime === 'bear');
    const choppyRegime = withRegime.filter(t => t.entryMarketRegime === 'choppy');

    const withHoldings = closedTrades.filter(t => t.entryHoldingsCount != null);
    const concentrated = withHoldings.filter(t => t.entryHoldingsCount <= 3);
    const diversified = withHoldings.filter(t => t.entryHoldingsCount > 3);

    const withSizing = closedTrades.filter(t => t.positionSizePercent != null && t.positionSizePercent > 0);
    const bigPositions = withSizing.filter(t => t.positionSizePercent >= 15);
    const smallPositions = withSizing.filter(t => t.positionSizePercent < 15);

    const withRSI = tradesWithTechnicals.filter(t => t.entryTechnicals.rsi != null);
    const rsiOversold = withRSI.filter(t => t.entryTechnicals.rsi < 30);
    const rsiNeutral = withRSI.filter(t => t.entryTechnicals.rsi >= 30 && t.entryTechnicals.rsi <= 70);
    const rsiOverbought = withRSI.filter(t => t.entryTechnicals.rsi > 70);

    const withMACD = tradesWithTechnicals.filter(t => t.entryTechnicals.macdCrossover != null);
    const macdBullish = withMACD.filter(t => t.entryTechnicals.macdCrossover === 'bullish');
    const macdBearish = withMACD.filter(t => t.entryTechnicals.macdCrossover === 'bearish');
    const macdNone = withMACD.filter(t => t.entryTechnicals.macdCrossover === 'none');

    const withDTC = tradesWithTechnicals.filter(t => t.entryTechnicals.daysToCover != null);
    const highSqueeze = withDTC.filter(t => t.entryTechnicals.daysToCover > 5);
    const moderateSqueeze = withDTC.filter(t => t.entryTechnicals.daysToCover >= 3 && t.entryTechnicals.daysToCover <= 5);
    const lowSqueeze = withDTC.filter(t => t.entryTechnicals.daysToCover < 3);

    const withScore = tradesWithTechnicals.filter(t => t.entryTechnicals.compositeScore != null);
    const scoreHigh = withScore.filter(t => t.entryTechnicals.compositeScore >= 12);
    const scoreMedium = withScore.filter(t => t.entryTechnicals.compositeScore >= 7 && t.entryTechnicals.compositeScore < 12);
    const scoreLow = withScore.filter(t => t.entryTechnicals.compositeScore < 7);

    const withVIX = tradesWithTechnicals.filter(t => t.entryTechnicals.vixLevel != null);
    const vixComplacent = withVIX.filter(t => t.entryTechnicals.vixLevel < 15);
    const vixNormal = withVIX.filter(t => t.entryTechnicals.vixLevel >= 15 && t.entryTechnicals.vixLevel <= 20);
    const vixElevated = withVIX.filter(t => t.entryTechnicals.vixLevel > 20 && t.entryTechnicals.vixLevel <= 30);
    const vixPanic = withVIX.filter(t => t.entryTechnicals.vixLevel > 30);

    return {
        hasData: true,
        momentum: { high: calcStats(momentumHigh), low: calcStats(momentumLow) },
        relativeStrength: { high: calcStats(rsHigh), low: calcStats(rsLow) },
        sectorRotation: { inflow: calcStats(sectorInflow), outflow: calcStats(sectorOutflow) },
        runners: { hasData: withTodayChg.length >= 3, runners: calcStats(runners), bigRunners: calcStats(bigRunners), nonRunners: calcStats(nonRunners) },
        structure: { hasData: withStructure.length >= 3, bullish: calcStats(bullishStructure), bearish: calcStats(bearishStructure), other: calcStats(otherStructure), choch: calcStats(withChoch), bos: calcStats(withBos) },
        acceleration: { hasData: withAccel.length >= 3, accelerating: calcStats(accelerating), decelerating: calcStats(decelerating) },
        regime: { hasData: withRegime.length >= 3, bull: calcStats(bullRegime), bear: calcStats(bearRegime), choppy: calcStats(choppyRegime) },
        concentration: { hasData: withHoldings.length >= 3, concentrated: calcStats(concentrated), diversified: calcStats(diversified) },
        sizing: { hasData: withSizing.length >= 3, big: calcStats(bigPositions), small: calcStats(smallPositions) },
        rsi: { hasData: withRSI.length >= 3, oversold: calcStats(rsiOversold), neutral: calcStats(rsiNeutral), overbought: calcStats(rsiOverbought) },
        macd: { hasData: withMACD.length >= 3, bullish: calcStats(macdBullish), bearish: calcStats(macdBearish), none: calcStats(macdNone) },
        squeeze: { hasData: withDTC.length >= 3, high: calcStats(highSqueeze), moderate: calcStats(moderateSqueeze), low: calcStats(lowSqueeze) },
        compositeScore: { hasData: withScore.length >= 3, high: calcStats(scoreHigh), medium: calcStats(scoreMedium), low: calcStats(scoreLow) },
        vix: { hasData: withVIX.length >= 3, complacent: calcStats(vixComplacent), normal: calcStats(vixNormal), elevated: calcStats(vixElevated), panic: calcStats(vixPanic) }
    };
}

// Derive actionable trading rules from closed trade history
function deriveTradingRules(closedTrades) {
    if (!closedTrades) closedTrades = [];

    if (closedTrades.length < 3) {
        return { rules: [], summary: { totalTrades: closedTrades.length, insufficientData: true } };
    }

    const totalWins = closedTrades.filter(t => t.profitLoss > 0).length;
    const totalLosses = closedTrades.length - totalWins;
    const overallWinRate = (totalWins / closedTrades.length) * 100;
    const winners = closedTrades.filter(t => t.profitLoss > 0);
    const losers = closedTrades.filter(t => t.profitLoss <= 0);
    const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.returnPercent, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((s, t) => s + t.returnPercent, 0) / losers.length : 0;
    const avgWinDays = winners.length > 0 ? winners.reduce((s, t) => s + (t.holdTime || 0), 0) / winners.length / 86400000 : 0;
    const avgLossDays = losers.length > 0 ? losers.reduce((s, t) => s + (t.holdTime || 0), 0) / losers.length / 86400000 : 0;

    const recentN = Math.min(10, closedTrades.length);
    const recentTrades = closedTrades.slice(-recentN);
    const recentWins = recentTrades.filter(t => t.profitLoss > 0).length;
    const recentLosses = recentN - recentWins;

    const patternDefs = [
        { id: 'runner_entry', label: 'Runner Entries (up 5%+ today)', losingFilter: t => t.entryTechnicals && t.entryTechnicals.todayChange != null && t.entryTechnicals.todayChange >= 5, winningFilter: t => t.entryTechnicals && t.entryTechnicals.todayChange != null && t.entryTechnicals.todayChange < 5, descTemplate: (ls, ws) => `Stocks up 5%+ on the day of purchase: ${ls.winRate.toFixed(0)}% win rate vs ${ws.winRate.toFixed(0)}% for non-runners` },
        { id: 'overbought_rsi', label: 'Overbought RSI (>70)', losingFilter: t => t.entryTechnicals && t.entryTechnicals.rsi != null && t.entryTechnicals.rsi > 70, winningFilter: t => t.entryTechnicals && t.entryTechnicals.rsi != null && t.entryTechnicals.rsi <= 70, descTemplate: (ls, ws) => `RSI > 70 at entry: ${ls.winRate.toFixed(0)}% win rate vs ${ws.winRate.toFixed(0)}% for non-overbought` },
        { id: 'bearish_structure', label: 'Bearish Structure Entries', losingFilter: t => t.entryTechnicals && t.entryTechnicals.structure === 'bearish', winningFilter: t => t.entryTechnicals && t.entryTechnicals.structure === 'bullish', descTemplate: (ls, ws) => `Bearish structure at entry: ${ls.winRate.toFixed(0)}% win rate vs ${ws.winRate.toFixed(0)}% for bullish` },
        { id: 'bearish_macd', label: 'Bearish MACD Crossover', losingFilter: t => t.entryTechnicals && t.entryTechnicals.macdCrossover === 'bearish', winningFilter: t => t.entryTechnicals && t.entryTechnicals.macdCrossover === 'bullish', descTemplate: (ls, ws) => `Bearish MACD at entry: ${ls.winRate.toFixed(0)}% win rate vs ${ws.winRate.toFixed(0)}% for bullish crossover` },
        { id: 'outflow_sector', label: 'Outflow Sector Entries', losingFilter: t => t.entryTechnicals && (t.entryTechnicals.sectorRotation === 'avoid' || t.entryTechnicals.sectorRotation === 'caution'), winningFilter: t => t.entryTechnicals && (t.entryTechnicals.sectorRotation === 'accumulate' || t.entryTechnicals.sectorRotation === 'favorable'), descTemplate: (ls, ws) => `Outflow sector entries: ${ls.winRate.toFixed(0)}% win rate vs ${ws.winRate.toFixed(0)}% for inflow sectors` },
        { id: 'high_momentum', label: 'Extended Momentum (9+)', losingFilter: t => t.entryTechnicals && t.entryTechnicals.momentumScore != null && t.entryTechnicals.momentumScore >= 9, winningFilter: t => t.entryTechnicals && t.entryTechnicals.momentumScore != null && t.entryTechnicals.momentumScore < 7, descTemplate: (ls, ws) => `Momentum 9+ at entry: ${ls.winRate.toFixed(0)}% win rate vs ${ws.winRate.toFixed(0)}% for momentum <7` },
        { id: 'large_position', label: 'Large Positions (15%+)', losingFilter: t => t.positionSizePercent != null && t.positionSizePercent >= 15, winningFilter: t => t.positionSizePercent != null && t.positionSizePercent > 0 && t.positionSizePercent < 15, descTemplate: (ls, ws) => `Large positions (15%+): ${ls.winRate.toFixed(0)}% win rate vs ${ws.winRate.toFixed(0)}% for smaller positions` },
        { id: 'low_composite', label: 'Low Composite Score (<7)', losingFilter: t => t.entryTechnicals && t.entryTechnicals.compositeScore != null && t.entryTechnicals.compositeScore < 7, winningFilter: t => t.entryTechnicals && t.entryTechnicals.compositeScore != null && t.entryTechnicals.compositeScore >= 12, descTemplate: (ls, ws) => `Low composite score (<7): ${ls.winRate.toFixed(0)}% win rate vs ${ws.winRate.toFixed(0)}% for high scores (12+)` },
        { id: 'overconfident_conviction', label: 'Max Conviction (9-10)', losingFilter: t => t.entryConviction != null && t.entryConviction >= 9, winningFilter: t => t.entryConviction != null && t.entryConviction >= 5 && t.entryConviction <= 6, descTemplate: (ls, ws) => `9-10 conviction trades: ${ls.winRate.toFixed(0)}% win rate vs ${ws.winRate.toFixed(0)}% for moderate (5-6) conviction` }
    ];

    const rules = [];
    for (const pdef of patternDefs) {
        const losingTrades = closedTrades.filter(pdef.losingFilter);
        const winningTrades = closedTrades.filter(pdef.winningFilter);
        const losingStats = calcStats(losingTrades);
        const winningStats = calcStats(winningTrades);

        if (!losingStats && !winningStats) {
            rules.push({ id: pdef.id, label: pdef.label, type: 'neutral', enforcement: 'observe', winRate: 0, avgReturn: 0, trades: 0, compareWinRate: 0, compareTrades: 0, compareAvgReturn: 0, needsData: true, description: `No data yet — need trades with ${pdef.label.toLowerCase()} conditions` });
            continue;
        }

        if (!losingStats || !winningStats) {
            const hasStats = losingStats || winningStats;
            rules.push({ id: pdef.id, label: pdef.label, type: 'neutral', enforcement: 'observe', winRate: hasStats.winRate, avgReturn: hasStats.avgReturn, trades: hasStats.count, compareWinRate: 0, compareTrades: 0, compareAvgReturn: 0, needsData: true, description: `Only ${hasStats.count} trades on one side — need both sides to compare` });
            continue;
        }

        const winRateDiff = winningStats.winRate - losingStats.winRate;
        const losingCount = losingStats.count;

        let enforcement = 'observe';
        let type = 'neutral';
        if (pdef.id === 'overbought_rsi' && losingCount >= 4 && losingStats.winRate < 30) {
            enforcement = 'block'; type = 'avoid';
        } else if (losingCount >= 5 && losingStats.winRate < 40 && winRateDiff > 12) {
            enforcement = 'block'; type = 'avoid';
        } else if (losingCount >= 4 && winRateDiff > 12) {
            enforcement = 'warn'; type = 'avoid';
        } else if (losingCount >= 3 && winRateDiff > 8) {
            enforcement = 'warn'; type = 'avoid';
        }

        rules.push({ id: pdef.id, label: pdef.label, type, enforcement, winRate: losingStats.winRate, avgReturn: losingStats.avgReturn, trades: losingStats.count, compareWinRate: winningStats.winRate, compareTrades: winningStats.count, compareAvgReturn: winningStats.avgReturn, description: pdef.descTemplate(losingStats, winningStats) });
    }

    // Prefer rules
    const preferDefs = [
        { id: 'pullback_entry', label: 'Pullback Entries (-2% to -8% 5d)', filter: t => t.entryTechnicals && t.entryTechnicals.totalReturn5d != null && t.entryTechnicals.totalReturn5d >= -8 && t.entryTechnicals.totalReturn5d <= -2 },
        { id: 'bullish_structure_entry', label: 'Bullish Structure Entries', filter: t => t.entryTechnicals && t.entryTechnicals.structure === 'bullish' },
        { id: 'oversold_rsi', label: 'Oversold RSI (<30)', filter: t => t.entryTechnicals && t.entryTechnicals.rsi != null && t.entryTechnicals.rsi < 30 },
        { id: 'bullish_macd_entry', label: 'Bullish MACD Crossover', filter: t => t.entryTechnicals && t.entryTechnicals.macdCrossover === 'bullish' },
        { id: 'inflow_sector_entry', label: 'Inflow Sector Entries', filter: t => t.entryTechnicals && (t.entryTechnicals.sectorRotation === 'accumulate' || t.entryTechnicals.sectorRotation === 'favorable') }
    ];

    for (const pdef of preferDefs) {
        if (rules.find(r => r.id === pdef.id)) continue;
        const matchingTrades = closedTrades.filter(pdef.filter || (() => false));
        const stats = calcStats(matchingTrades);
        if (!stats || stats.count < 5) continue;
        if (stats.winRate > overallWinRate + 5) {
            rules.push({ id: pdef.id, label: pdef.label, type: 'prefer', enforcement: 'observe', winRate: stats.winRate, avgReturn: stats.avgReturn, trades: stats.count, compareWinRate: overallWinRate, compareTrades: closedTrades.length, compareAvgReturn: closedTrades.reduce((s, t) => s + t.returnPercent, 0) / closedTrades.length, description: `${pdef.label}: ${stats.winRate.toFixed(0)}% win rate (${stats.count} trades) vs ${overallWinRate.toFixed(0)}% overall` });
        }
    }

    // Sector-specific rules
    const sectorTrades = {};
    for (const t of closedTrades) {
        const sector = t.sector || 'Unknown';
        if (!sectorTrades[sector]) sectorTrades[sector] = [];
        sectorTrades[sector].push(t);
    }
    for (const [sector, trades] of Object.entries(sectorTrades)) {
        if (trades.length < 5) continue;
        const wins = trades.filter(t => t.returnPercent > 0).length;
        const sectorWinRate = (wins / trades.length) * 100;
        const avgReturn = trades.reduce((s, t) => s + t.returnPercent, 0) / trades.length;
        if (sectorWinRate < 30 && avgReturn < -2) {
            rules.push({ id: `sector_${sector.toLowerCase().replace(/\s+/g, '_')}`, label: `${sector} Sector (${sectorWinRate.toFixed(0)}% WR)`, type: 'avoid', enforcement: trades.length >= 8 ? 'block' : 'warn', winRate: sectorWinRate, avgReturn, trades: trades.length, compareWinRate: overallWinRate, compareTrades: closedTrades.length, compareAvgReturn: closedTrades.reduce((s, t) => s + t.returnPercent, 0) / closedTrades.length, description: `${sector}: ${sectorWinRate.toFixed(0)}% win rate across ${trades.length} trades (avg ${avgReturn.toFixed(1)}%)` });
        }
    }

    // Sort
    const enfOrder = { block: 0, warn: 1, observe: 2 };
    const typeOrder = { avoid: 0, prefer: 1, neutral: 2 };
    rules.sort((a, b) => {
        const eDiff = (enfOrder[a.enforcement] ?? 3) - (enfOrder[b.enforcement] ?? 3);
        if (eDiff !== 0) return eDiff;
        return (typeOrder[a.type] ?? 3) - (typeOrder[b.type] ?? 3);
    });

    const recentWR = recentWins + recentLosses > 0 ? (recentWins / (recentWins + recentLosses)) * 100 : overallWinRate;

    return {
        rules,
        summary: {
            totalTrades: closedTrades.length,
            wins: totalWins, losses: totalLosses, winRate: overallWinRate,
            avgWin, avgLoss, avgWinDays, avgLossDays,
            recentWins, recentLosses,
            recentTrend: recentWR > overallWinRate + 10 ? 'improving' : recentWR < overallWinRate - 10 ? 'declining' : 'steady'
        }
    };
}

// Check if trade data matches a specific rule pattern
function matchesPattern(ruleId, data, stockSectors) {
    if (!data) return false;
    switch (ruleId) {
        case 'runner_entry': return data.momentum?.todayChange >= 5 || data.todayChange >= 5;
        case 'overbought_rsi': return data.rsi > 70;
        case 'bearish_structure': return data.marketStructure?.structure === 'bearish';
        case 'bearish_macd': return data.macdCrossover === 'bearish' || data.macd?.crossover === 'bearish';
        case 'outflow_sector': return data.sectorRotation?.moneyFlow === 'outflow' || data.sectorFlow === 'avoid' || data.sectorFlow === 'caution';
        case 'high_momentum': return data.momentum?.score >= 9;
        case 'low_composite': return data.compositeScore != null && data.compositeScore < 7;
        case 'overconfident_conviction': return false;
        case 'large_position': return false;
        default:
            if (ruleId.startsWith('sector_') && stockSectors) {
                const sector = stockSectors[data.symbol] || stockSectors[data.ticker] || '';
                const ruleSector = ruleId.replace('sector_', '').replace(/_/g, ' ');
                return sector.toLowerCase() === ruleSector;
            }
            return false;
    }
}

// Summarize post-exit tracking data
function summarizePostExitQuality(closedTrades) {
    if (!closedTrades) closedTrades = [];
    const tracked = closedTrades.filter(t => t.tracking?.priceAfter1Week != null);
    if (tracked.length < 3) return null;

    let weekHigher = 0, weekTotalMove = 0;
    let monthHigher = 0, monthTotalMove = 0, monthCount = 0;

    for (const t of tracked) {
        const sellPrice = t.tracking.sellPrice || t.sellPrice;
        if (!sellPrice || sellPrice <= 0) continue;
        const weekMove = ((t.tracking.priceAfter1Week - sellPrice) / sellPrice) * 100;
        weekTotalMove += weekMove;
        if (weekMove > 0) weekHigher++;
        if (t.tracking.priceAfter1Month != null) {
            const monthMove = ((t.tracking.priceAfter1Month - sellPrice) / sellPrice) * 100;
            monthTotalMove += monthMove;
            if (monthMove > 0) monthHigher++;
            monthCount++;
        }
    }

    const weekAvg = weekTotalMove / tracked.length;
    return {
        weekTracked: tracked.length,
        weekWentHigher: weekHigher,
        weekAvgMove: weekAvg,
        monthTracked: monthCount,
        monthWentHigher: monthHigher,
        monthAvgMove: monthCount > 0 ? monthTotalMove / monthCount : null,
        sellingTooEarly: (weekHigher / tracked.length) > 0.6 && weekAvg > 3
    };
}

// Format performance insights as text (for dashboard display)
function formatPerformanceInsights(closedTrades) {
    const rulesData = deriveTradingRules(closedTrades);

    const p2Wins = closedTrades.filter(t => (t.returnPercent || 0) > 0).length;
    const p2WinRate = closedTrades.length > 0 ? (p2Wins / closedTrades.length * 100) : 50;
    const killerPrefix = (closedTrades.length >= 3 && p2WinRate < 40)
        ? `\nPORTFOLIO WIN RATE: ${p2WinRate.toFixed(0)}% — BELOW 40%. STOP chasing extended stocks. ONLY buy pullbacks with bullish structure, confirmed catalysts, and RSI <60.\n`
        : '';

    if (rulesData.rules.length === 0) {
        if (rulesData.summary.insufficientData) {
            return killerPrefix + `\nTRADING RULES: Need more trade history (${rulesData.summary.totalTrades} trades so far, need 3+).\n`;
        }
        return killerPrefix + `\nTRADING RULES: No clear patterns yet from ${rulesData.summary.totalTrades} trades.\n`;
    }

    const s = rulesData.summary;
    const blockRules = rulesData.rules.filter(r => r.enforcement === 'block');
    const warnRules = rulesData.rules.filter(r => r.enforcement === 'warn' && r.type === 'avoid');
    const preferRules = rulesData.rules.filter(r => r.type === 'prefer');

    let insights = killerPrefix + `\nTRADING RULES (derived from your ${s.totalTrades}-trade history):\n\n`;

    if (blockRules.length > 0) {
        insights += `ENFORCED (blocked):\n`;
        for (const r of blockRules) {
            insights += `- ${r.label}: ${r.winRate.toFixed(0)}% win rate, ${r.avgReturn >= 0 ? '+' : ''}${r.avgReturn.toFixed(1)}% avg over ${r.trades} trades [BLOCKED]\n`;
        }
        insights += '\n';
    }

    if (warnRules.length > 0) {
        insights += `STRONG GUIDANCE (data says avoid):\n`;
        for (const r of warnRules) {
            insights += `- ${r.label}: ${r.winRate.toFixed(0)}% win rate over ${r.trades} trades vs ${r.compareWinRate.toFixed(0)}% baseline\n`;
        }
        insights += '\n';
    }

    if (preferRules.length > 0) {
        insights += `WHAT'S WORKING:\n`;
        for (const r of preferRules) {
            insights += `- ${r.label}: ${r.winRate.toFixed(0)}% win rate, ${r.avgReturn >= 0 ? '+' : ''}${r.avgReturn.toFixed(1)}% avg over ${r.trades} trades\n`;
        }
        insights += '\n';
    }

    insights += `PERFORMANCE: ${s.wins}W-${s.losses}L (${s.winRate.toFixed(0)}%), Avg winner: +${s.avgWin.toFixed(1)}% (${s.avgWinDays.toFixed(1)}d), Avg loser: ${s.avgLoss.toFixed(1)}% (${s.avgLossDays.toFixed(1)}d)\n`;
    insights += `RECENT: ${s.recentWins}W-${s.recentLosses}L — ${s.recentTrend}\n`;

    const exitData = analyzeExitTiming(closedTrades);
    if (exitData.hasData) {
        let exitLine = 'EXIT TIMING: ';
        const bestBucket = Object.entries(exitData.holdBuckets)
            .filter(([, b]) => b.count >= 3)
            .sort((a, b) => b[1].winRate - a[1].winRate)[0];
        if (bestBucket) exitLine += `Best hold period: ${bestBucket[0]} (${bestBucket[1].winRate.toFixed(0)}% WR, ${bestBucket[1].count} trades). `;
        exitLine += `Avg winner: +${exitData.avgWinnerReturn.toFixed(1)}%`;
        if (exitData.avgWinnerReturn < 15) exitLine += ' (selling too early?)';
        exitLine += '. ';
        const topReason = Object.entries(exitData.byReason).sort((a, b) => b[1].count - a[1].count)[0];
        if (topReason) exitLine += `Most common exit: ${topReason[0].replace('_', ' ')} (${topReason[1].count}).`;
        insights += exitLine + '\n';
    }

    const postExit = summarizePostExitQuality(closedTrades);
    if (postExit) {
        let exitQLine = `EXIT QUALITY: ${postExit.weekWentHigher}/${postExit.weekTracked} exits went higher 1wk later (avg ${postExit.weekAvgMove >= 0 ? '+' : ''}${postExit.weekAvgMove.toFixed(1)}%)`;
        if (postExit.sellingTooEarly) exitQLine += ` — HOLDING WINNERS LONGER would improve returns`;
        insights += exitQLine + '\n';
    }
    insights += '\n';

    return insights;
}

module.exports = {
    deriveTradingRules,
    formatPerformanceInsights,
    analyzeExitTiming,
    analyzeConvictionAccuracy,
    analyzeTechnicalAccuracy,
    matchesPattern,
    summarizePostExitQuality
};
