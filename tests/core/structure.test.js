'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    detectStructure,
    checkStructureBreakdowns,
    deriveSellTargets
} = require('../../core/structure');

// Helper: generate bars with explicit OHLC control
function makeBars(configs) {
    // configs: array of { o, h, l, c } or shorthand { c } (o=c, h=c+1, l=c-1)
    return configs.map((cfg, i) => ({
        o: cfg.o ?? cfg.c,
        h: cfg.h ?? cfg.c + 1,
        l: cfg.l ?? cfg.c - 1,
        c: cfg.c,
        v: cfg.v ?? 1000000,
        t: Date.now() - (configs.length - i) * 86400000
    }));
}

// Helper: create a simple uptrend with HH+HL pattern
// Swing detection requires: SH at i means bars[i].h > bars[i-1].h AND bars[i].h > bars[i+1].h
//                           SL at i means bars[i].l < bars[i-1].l AND bars[i].l < bars[i+1].l
// So we need bars where peak bars have highs above BOTH neighbors' highs,
// and trough bars have lows below BOTH neighbors' lows.
function makeUptrendBars() {
    // Explicit uptrend: alternating peaks and troughs, each pair higher than the last
    //   bar0: neutral start (h=102, l=98)
    //   bar1: PEAK (h=108, l=101) — SH: 108 > 102 and 108 > 104 ✓
    //   bar2: TROUGH (h=104, l=96) — SL: 96 < 101 and 96 < 103 ✓
    //   bar3: PEAK (h=112, l=103) — SH: 112 > 104 and 112 > 106 ✓
    //   bar4: TROUGH (h=106, l=98) — SL: 98 < 103 and 98 < 105 ✓  (HL: 98 > 96)
    //   bar5: PEAK (h=116, l=105) — SH: 116 > 106 and 116 > 108 ✓  (HH: 116 > 112)
    //   bar6: TROUGH (h=108, l=100) — SL: 100 < 105 and 100 < 107 ✓  (HL: 100 > 98)
    //   bar7: PEAK (h=120, l=107) — SH: 120 > 108 and 120 > 110 ✓  (HH: 120 > 116)
    //   bar8: TROUGH (h=110, l=102) — SL: 102 < 107 and 102 < 109 ✓  (HL: 102 > 100)
    //   bar9: current bar (h=124, l=109) — no swing check on last bar
    return makeBars([
        { o: 100, h: 102, l: 98,  c: 100 },  // 0
        { o: 103, h: 108, l: 101, c: 106 },  // 1: SH=108
        { o: 100, h: 104, l: 96,  c: 101 },  // 2: SL=96
        { o: 105, h: 112, l: 103, c: 110 },  // 3: SH=112
        { o: 103, h: 106, l: 98,  c: 104 },  // 4: SL=98 (HL vs 96)
        { o: 108, h: 116, l: 105, c: 114 },  // 5: SH=116 (HH vs 112)
        { o: 106, h: 108, l: 100, c: 106 },  // 6: SL=100 (HL vs 98)
        { o: 112, h: 120, l: 107, c: 118 },  // 7: SH=120 (HH vs 116)
        { o: 108, h: 110, l: 102, c: 108 },  // 8: SL=102 (HL vs 100)
        { o: 115, h: 124, l: 109, c: 122 },  // 9: current
    ]);
}

// Helper: create a downtrend with LH+LL pattern
// Same principle: peaks have highs above both neighbors, troughs have lows below both neighbors
// But each successive peak is lower (LH) and each successive trough is lower (LL)
function makeDowntrendBars() {
    return makeBars([
        { o: 120, h: 122, l: 118, c: 120 },  // 0
        { o: 118, h: 126, l: 117, c: 124 },  // 1: SH=126
        { o: 120, h: 121, l: 112, c: 114 },  // 2: SL=112
        { o: 117, h: 122, l: 115, c: 120 },  // 3: SH=122 (LH vs 126)
        { o: 116, h: 118, l: 108, c: 112 },  // 4: SL=108 (LL vs 112)
        { o: 113, h: 118, l: 111, c: 116 },  // 5: SH=118 (LH vs 122)
        { o: 112, h: 114, l: 104, c: 108 },  // 6: SL=104 (LL vs 108)
        { o: 109, h: 114, l: 107, c: 112 },  // 7: SH=114 (LH vs 118)
        { o: 108, h: 110, l: 100, c: 104 },  // 8: SL=100 (LL vs 104)
        { o: 103, h: 106, l: 101, c: 102 },  // 9: current
    ]);
}

// Helper: create bars that go bullish then reverse (for CHoCH detection)
// Needs 3+ swing highs and 3+ swing lows
function makeChochBearishBars() {
    // Phase 1: Uptrend with HH+HL (need at least 2 pairs of swings going up)
    // Phase 2: Then a lower low (CHoCH)
    //
    // Pattern: trough, peak, trough, peak, trough, peak, trough, peak, trough(LL)
    // Swings:  SL1    SH1   SL2    SH2   SL3    SH3   SL4(HL) SH4(HH) ...then LL
    //
    // For wasBullish: prevSH > prevPrevSH AND prevSL > prevPrevSL
    // For lowerLow:   lastSL < prevSL
    const bars = makeBars([
        // Bars 0-6: First uptrend phase (creates initial bullish swings)
        { o: 100, h: 101, l: 98,  c: 100 },  // 0: trough area
        { o: 102, h: 106, l: 101, c: 104 },  // 1: swing high (SH ~106)
        { o: 103, h: 104, l: 100, c: 101 },  // 2: swing low (SL ~100)
        { o: 103, h: 108, l: 102, c: 107 },  // 3: higher swing high (SH ~108)
        { o: 105, h: 106, l: 102, c: 103 },  // 4: higher swing low (SL ~102)
        { o: 106, h: 112, l: 105, c: 110 },  // 5: even higher high (SH ~112)
        { o: 108, h: 109, l: 104, c: 105 },  // 6: higher low (SL ~104)
        // Bars 7-9: Reversal — makes a lower low
        { o: 107, h: 111, l: 106, c: 109 },  // 7: lower high (SH ~111 < 112)
        { o: 104, h: 105, l: 99,  c: 100 },  // 8: lower low (SL ~99 < 104) → CHoCH!
        { o: 101, h: 103, l: 100, c: 102 },  // 9: current bar
    ]);
    return bars;
}

// Helper: create bars that go bearish then break higher (for bullish CHoCH)
// Need 3+ swing highs and 3+ swing lows
// wasBearish: prevSH < prevPrevSH AND prevSL < prevPrevSL
// Then higherHigh: lastSH > prevSH → bullish CHoCH
function makeChochBullishBars() {
    // Trace swing detection:
    //   bar0: h=122, l=118  (no check — first bar)
    //   bar1: h=126, l=117  — SH? 126>122 && 126>121=yes SH=126. SL? 117<118 && 117<115=no
    //   bar2: h=121, l=112  — SH? 121<126=no. SL? 112<117 && 112<115=yes SL=112
    //   bar3: h=122, l=115  — SH? 122>121 && 122>118=yes SH=122(LH). SL? 115>112=no
    //   bar4: h=118, l=108  — SH? 118<122=no. SL? 108<115 && 108<111=yes SL=108(LL)
    //   bar5: h=118, l=111  — SH? 118>118=no(equal,not greater). SL? 111>108=no
    //   Hmm, need to be more careful. Let me redo this.
    //
    // Revised plan: 12 bars, clear downtrend then reversal
    //   bar0:  h=130, l=126  neutral start
    //   bar1:  h=134, l=127  SH=134 (134>130, 134>128?)
    //   bar2:  h=128, l=122  SL=122 (122<127, 122<125?)
    //   bar3:  h=132, l=125  SH=132 LH (132<134). SL? 125>122=no
    //   bar4:  h=126, l=118  SL=118 LL (118<122). SH? 126<132=no
    //   bar5:  h=128, l=121  SH=128 LH (128<132). SL? 121>118=no
    //   bar6:  h=122, l=114  SL=114 LL (114<118). SH? 122<128=no
    //   bar7:  h=124, l=119  SH=124 LH (124<128). SL? 119>114=no
    //   bar8:  h=120, l=110  SL=110 LL (110<114). SH? 120<124=no
    //   bar9:  h=132, l=115  SH=132 HH! (132>124) → bullish CHoCH!
    //   bar10: h=130, l=118  — (last bar: no swing check needed for bar10, but bar9 needs bar10)
    //   bar11: h=131, l=120  — current
    //
    // Let me verify the full swing detection trace:
    //   i=1: h=134>130(i-1) && 134>128(i+1)? yes → SH=134. l=127: 127<126? no
    //   i=2: h=128: 128<134? no SH. l=122: 122<127(i-1) && 122<125(i+1)? yes → SL=122
    //   i=3: h=132: 132>128(i-1) && 132>126(i+1)? yes → SH=132. l=125: 125>122? no
    //   i=4: h=126: 126<132? no. l=118: 118<125(i-1) && 118<121(i+1)? yes → SL=118
    //   i=5: h=128: 128>126(i-1) && 128>122(i+1)? yes → SH=128. l=121: 121>118? no
    //   i=6: h=122: 122<128? no. l=114: 114<121(i-1) && 114<119(i+1)? yes → SL=114
    //   i=7: h=124: 124>122(i-1) && 124>120(i+1)? yes → SH=124. l=119: 119>114? no
    //   i=8: h=120: 120<124? no. l=110: 110<119(i-1) && 110<115(i+1)? yes → SL=110
    //   i=9: h=132: 132>120(i-1) && 132>130(i+1)? yes → SH=132. l=115: 115>110? no
    //   i=10: (last-1, i < bars.length-1=11) h=130: 130<132? no. l=118: 118>115? no
    //
    // SHs: [134, 132, 128, 124, 132]  → last=132, prev=124, prevPrev=128
    // SLs: [122, 118, 114, 110]        → last=110, prev=114, prevPrev=118
    //
    // wasBearish: prevSH(124) < prevPrevSH(128)=yes AND prevSL(114) < prevPrevSL(118)=yes → wasBearish!
    // higherHigh: lastSH(132) > prevSH(124) = yes → bullish CHoCH!
    return makeBars([
        { o: 128, h: 130, l: 126, c: 128 },  // 0
        { o: 130, h: 134, l: 127, c: 132 },  // 1: SH=134
        { o: 126, h: 128, l: 122, c: 125 },  // 2: SL=122
        { o: 128, h: 132, l: 125, c: 130 },  // 3: SH=132 (LH)
        { o: 124, h: 126, l: 118, c: 122 },  // 4: SL=118 (LL)
        { o: 124, h: 128, l: 121, c: 126 },  // 5: SH=128 (LH)
        { o: 120, h: 122, l: 114, c: 118 },  // 6: SL=114 (LL)
        { o: 120, h: 124, l: 119, c: 122 },  // 7: SH=124 (LH)
        { o: 116, h: 120, l: 110, c: 114 },  // 8: SL=110 (LL)
        { o: 120, h: 132, l: 115, c: 130 },  // 9: SH=132 (HH!) → CHoCH
        { o: 126, h: 130, l: 118, c: 128 },  // 10
        { o: 126, h: 131, l: 120, c: 128 },  // 11: current
    ]);
}

// Helper: create bars for bullish BOS detection
// Bullish BOS: structure is bullish AND currentPrice > prevSH.price
function makeBullishBosBars() {
    const bars = makeBars([
        { o: 100, h: 101, l: 98,  c: 100 },  // 0
        { o: 102, h: 106, l: 101, c: 104 },  // 1: SH ~106
        { o: 103, h: 104, l: 99,  c: 100 },  // 2: SL ~99
        { o: 103, h: 108, l: 102, c: 107 },  // 3: SH ~108 (HH)
        { o: 105, h: 106, l: 101, c: 103 },  // 4: SL ~101 (HL)
        { o: 106, h: 112, l: 105, c: 110 },  // 5: SH ~112 (HH) — prevSH
        { o: 108, h: 109, l: 103, c: 105 },  // 6: SL ~103 (HL) — lastSL
        { o: 107, h: 114, l: 106, c: 113 },  // 7: SH ~114 (HH) — lastSH
        { o: 110, h: 111, l: 105, c: 106 },  // 8: SL ~105 (HL)
        // Current bar closes ABOVE prevSH (112) → BOS
        { o: 112, h: 115, l: 111, c: 114 },  // 9: close 114 > prevSH 112
    ]);
    return bars;
}

// Helper: create bars with a Fair Value Gap
function makeFvgBars() {
    // Bullish FVG at i=8: bars[7].h < bars[9].l
    // FVG scan window: Math.max(1, 10-4)=6 to 9 (exclusive) → i=6,7,8
    // At i=8: bars[7].h=108 < bars[9].l=112 → bullish FVG!
    // Also need 2+ swing highs and 2+ swing lows for non-unknown result
    return makeBars([
        { o: 100, h: 102, l: 98,  c: 100 },  // 0
        { o: 103, h: 108, l: 101, c: 106 },  // 1: SH=108 (108>102,108>104)
        { o: 100, h: 104, l: 96,  c: 101 },  // 2: SL=96 (96<101,96<103)
        { o: 105, h: 112, l: 103, c: 110 },  // 3: SH=112 (HH)
        { o: 103, h: 106, l: 98,  c: 104 },  // 4: SL=98 (HL)
        { o: 108, h: 116, l: 105, c: 114 },  // 5: SH=116 (HH)
        { o: 106, h: 108, l: 100, c: 106 },  // 6: SL=100 (HL)
        // Gap-up sequence: bar 7 high = 108, bar 9 low = 112 → FVG
        { o: 107, h: 108, l: 104, c: 107 },  // 7: pre-gap bar (high=108)
        { o: 110, h: 118, l: 109, c: 116 },  // 8: gap candle
        { o: 114, h: 120, l: 112, c: 118 },  // 9: post-gap bar (low=112 > 108) → FVG!
    ]);
}

// Helper: create bars with a liquidity sweep
function makeSweepBars() {
    const bars = makeBars([
        { o: 100, h: 102, l: 98,  c: 101 },  // 0
        { o: 102, h: 106, l: 101, c: 104 },  // 1: SH ~106
        { o: 103, h: 104, l: 99,  c: 100 },  // 2: SL
        { o: 103, h: 109, l: 102, c: 108 },  // 3: SH ~109 (HH)
        { o: 106, h: 107, l: 101, c: 103 },  // 4: SL (HL)
        { o: 105, h: 112, l: 104, c: 111 },  // 5: SH ~112
        { o: 109, h: 110, l: 104, c: 106 },  // 6: SL ~104
        { o: 108, h: 114, l: 107, c: 113 },  // 7: SH ~114 — this is lastSH
        { o: 111, h: 112, l: 106, c: 108 },  // 8: SL ~106
        // Last bar: wick above lastSH (114) but closes below → high-swept
        { o: 110, h: 115, l: 109, c: 112 },  // 9: h=115 > 114, c=112 < 114 → sweep!
    ]);
    return bars;
}


// ═══════════════════════════════════════════════════════
// detectStructure tests
// ═══════════════════════════════════════════════════════

describe('detectStructure', () => {
    it('returns unknown with insufficient bars (< 7)', () => {
        const result = detectStructure(makeBars([
            { c: 100 }, { c: 101 }, { c: 102 }, { c: 103 }, { c: 104 }, { c: 105 }
        ]));
        assert.equal(result.structure, 'unknown');
        assert.equal(result.structureSignal, 'neutral');
        assert.equal(result.structureScore, 0);
        assert.equal(result.basis, 'insufficient-data');
    });

    it('returns unknown with null input', () => {
        const result = detectStructure(null);
        assert.equal(result.structure, 'unknown');
        assert.equal(result.basis, 'insufficient-data');
    });

    it('returns unknown with empty array', () => {
        const result = detectStructure([]);
        assert.equal(result.structure, 'unknown');
        assert.equal(result.basis, 'insufficient-data');
    });

    it('identifies bullish structure (HH+HL pattern)', () => {
        const bars = makeUptrendBars();
        const result = detectStructure(bars);
        assert.equal(result.structure, 'bullish', `Expected bullish, got ${result.structure}`);
        assert.ok(result.structureScore > 0, `Expected positive score, got ${result.structureScore}`);
        assert.ok(result.lastSwingHigh !== null);
        assert.ok(result.lastSwingLow !== null);
    });

    it('identifies bearish structure (LH+LL pattern)', () => {
        const bars = makeDowntrendBars();
        const result = detectStructure(bars);
        assert.equal(result.structure, 'bearish', `Expected bearish, got ${result.structure}`);
        assert.ok(result.structureScore < 0, `Expected negative score, got ${result.structureScore}`);
    });

    it('detects bearish CHoCH (reversal from bullish)', () => {
        const bars = makeChochBearishBars();
        const result = detectStructure(bars);
        assert.equal(result.choch, true, 'Expected CHoCH to be detected');
        assert.equal(result.chochType, 'bearish', `Expected bearish CHoCH, got ${result.chochType}`);
    });

    it('detects bullish CHoCH (reversal from bearish)', () => {
        const bars = makeChochBullishBars();
        const result = detectStructure(bars);
        assert.equal(result.choch, true, 'Expected CHoCH to be detected');
        assert.equal(result.chochType, 'bullish', `Expected bullish CHoCH, got ${result.chochType}`);
    });

    it('detects bullish BOS (break of structure)', () => {
        const bars = makeBullishBosBars();
        const result = detectStructure(bars);
        assert.equal(result.bos, true, 'Expected BOS to be detected');
        assert.equal(result.bosType, 'bullish', `Expected bullish BOS, got ${result.bosType}`);
        assert.equal(result.structureSignal, 'strong-bullish');
        assert.equal(result.structureScore, 3);
    });

    it('detects FVG (fair value gap)', () => {
        const bars = makeFvgBars();
        const result = detectStructure(bars);
        assert.notEqual(result.fvg, 'none', `Expected FVG detection, got ${result.fvg}`);
        assert.ok(result.fvgs.length > 0, 'Expected fvgs array to contain entries');
        assert.ok(result.fvgs.some(f => f.type === 'bullish'), 'Expected at least one bullish FVG');
    });

    it('detects liquidity sweep', () => {
        const bars = makeSweepBars();
        const result = detectStructure(bars);
        assert.equal(result.sweep, 'high-swept', `Expected high-swept, got ${result.sweep}`);
    });

    it('returns allSwingHighs and allSwingLows arrays', () => {
        const bars = makeUptrendBars();
        const result = detectStructure(bars);
        assert.ok(Array.isArray(result.allSwingHighs), 'Expected allSwingHighs array');
        assert.ok(Array.isArray(result.allSwingLows), 'Expected allSwingLows array');
        assert.ok(result.allSwingHighs.length >= 2, 'Expected at least 2 swing highs');
        assert.ok(result.allSwingLows.length >= 2, 'Expected at least 2 swing lows');
        // Each swing should have price and time
        assert.ok('price' in result.allSwingHighs[0]);
        assert.ok('time' in result.allSwingHighs[0]);
    });

    it('returns fvgs array even when empty', () => {
        const bars = makeUptrendBars();
        const result = detectStructure(bars);
        assert.ok(Array.isArray(result.fvgs), 'Expected fvgs array');
    });

    it('clamps structureScore to [-3, 3]', () => {
        // Even with sweep modifier, score should be clamped
        const bars = makeBullishBosBars();
        const result = detectStructure(bars);
        assert.ok(result.structureScore >= -3 && result.structureScore <= 3,
            `Score ${result.structureScore} out of [-3, 3] range`);
    });
});


// ═══════════════════════════════════════════════════════
// deriveSellTargets tests
// ═══════════════════════════════════════════════════════

describe('deriveSellTargets', () => {
    it('calculates stop loss from nearest swing low below entry', () => {
        const structureData = {
            allSwingHighs: [
                { price: 110, time: 1000 },
                { price: 115, time: 2000 },
                { price: 120, time: 3000 }
            ],
            allSwingLows: [
                { price: 95, time: 1000 },
                { price: 98, time: 2000 },
                { price: 102, time: 3000 }
            ],
            fvgs: [],
            currentPrice: 105
        };
        const indicatorData = { sma20: 103, sma50: 100 };
        const result = deriveSellTargets(105, structureData, indicatorData);
        // Nearest swing low below 105 is 102
        assert.equal(result.stopLoss, 102);
    });

    it('calculates T1 from nearest swing high above entry', () => {
        const structureData = {
            allSwingHighs: [
                { price: 100, time: 1000 },
                { price: 110, time: 2000 },
                { price: 120, time: 3000 }
            ],
            allSwingLows: [
                { price: 95, time: 1000 },
                { price: 98, time: 2000 }
            ],
            fvgs: [],
            currentPrice: 105
        };
        const indicatorData = { sma20: 103, sma50: 100 };
        const result = deriveSellTargets(105, structureData, indicatorData);
        // Nearest swing high above 105 is 110
        assert.equal(result.target1, 110);
    });

    it('calculates T2 from next swing high above T1', () => {
        const structureData = {
            allSwingHighs: [
                { price: 100, time: 1000 },
                { price: 110, time: 2000 },
                { price: 120, time: 3000 }
            ],
            allSwingLows: [
                { price: 95, time: 1000 },
                { price: 98, time: 2000 }
            ],
            fvgs: [],
            currentPrice: 105
        };
        const indicatorData = { sma20: 103, sma50: 100 };
        const result = deriveSellTargets(105, structureData, indicatorData);
        // T1 = 110, next swing high above 110 is 120
        assert.equal(result.target2, 120);
    });

    it('calculates risk/reward ratio correctly', () => {
        const structureData = {
            allSwingHighs: [{ price: 115, time: 1000 }],
            allSwingLows: [{ price: 95, time: 1000 }],
            fvgs: [],
            currentPrice: 105
        };
        const indicatorData = { sma20: 103, sma50: 100 };
        const result = deriveSellTargets(105, structureData, indicatorData);
        // R:R = (115 - 105) / (105 - 95) = 10/10 = 1.0
        assert.equal(result.riskReward, 1.0);
    });

    it('returns null values when no swing levels available', () => {
        const structureData = {
            allSwingHighs: [],
            allSwingLows: [],
            fvgs: [],
            currentPrice: 105
        };
        const indicatorData = { sma20: 103, sma50: 100 };
        const result = deriveSellTargets(105, structureData, indicatorData);
        assert.equal(result.stopLoss, null);
        assert.equal(result.target1, null);
        assert.equal(result.target2, null);
        assert.equal(result.riskReward, null);
    });

    it('returns null T2 when only one swing high above entry', () => {
        const structureData = {
            allSwingHighs: [{ price: 110, time: 1000 }],
            allSwingLows: [{ price: 95, time: 1000 }],
            fvgs: [],
            currentPrice: 105
        };
        const indicatorData = { sma20: 103, sma50: 100 };
        const result = deriveSellTargets(105, structureData, indicatorData);
        assert.equal(result.target1, 110);
        assert.equal(result.target2, null);
    });

    it('includes dynamic support levels', () => {
        const structureData = {
            allSwingHighs: [{ price: 110, time: 1000 }],
            allSwingLows: [{ price: 95, time: 1000 }],
            fvgs: [],
            currentPrice: 105
        };
        const indicatorData = { sma20: 103, sma50: 100 };
        const result = deriveSellTargets(105, structureData, indicatorData);
        assert.deepEqual(result.dynamicSupport, { sma20: 103, sma50: 100 });
    });

    it('returns FVG zones near current price', () => {
        const structureData = {
            allSwingHighs: [{ price: 110, time: 1000 }],
            allSwingLows: [{ price: 95, time: 1000 }],
            fvgs: [
                { type: 'bullish', gapTop: 104, gapBottom: 102 },
                { type: 'bearish', gapTop: 200, gapBottom: 195 }  // Far away — excluded
            ],
            currentPrice: 105
        };
        const indicatorData = { sma20: 103, sma50: 100 };
        const result = deriveSellTargets(105, structureData, indicatorData);
        assert.ok(Array.isArray(result.fvgZones));
        // Only the nearby FVG should be included
        assert.equal(result.fvgZones.length, 1);
        assert.equal(result.fvgZones[0].type, 'bullish');
    });

    it('returns null riskReward when stopLoss equals entryPrice', () => {
        const structureData = {
            allSwingHighs: [{ price: 110, time: 1000 }],
            allSwingLows: [{ price: 105, time: 1000 }], // Same as entry
            fvgs: [],
            currentPrice: 105
        };
        const indicatorData = { sma20: 103, sma50: 100 };
        const result = deriveSellTargets(105, structureData, indicatorData);
        // stopLoss must be BELOW entry, so 105 is not below 105
        assert.equal(result.stopLoss, null);
    });
});


// ═══════════════════════════════════════════════════════
// checkStructureBreakdowns tests
// ═══════════════════════════════════════════════════════

describe('checkStructureBreakdowns', () => {
    it('generates critical alert for bearish CHoCH', () => {
        const holdings = [{
            symbol: 'AAPL',
            entryPrice: 150,
            entryStructure: { structureScore: 2, structure: 'bullish' },
            shares: 10
        }];
        const scanData = {
            AAPL: {
                structureResult: {
                    choch: true,
                    chochType: 'bearish',
                    bos: false,
                    bosType: 'none',
                    sweep: 'none',
                    structureScore: -2,
                    structure: 'bearish'
                },
                conviction: 3,
                compositeScore: 20
            }
        };
        const alerts = checkStructureBreakdowns(holdings, [], scanData);
        const critical = alerts.filter(a => a.severity === 'critical');
        assert.ok(critical.length > 0, 'Expected at least one critical alert');
        assert.equal(critical[0].symbol, 'AAPL');
        assert.equal(critical[0].type, 'bearish-choch');
    });

    it('generates high alert for bearish BOS', () => {
        const holdings = [{
            symbol: 'MSFT',
            entryPrice: 400,
            entryStructure: { structureScore: -1, structure: 'bearish' },
            shares: 5
        }];
        const scanData = {
            MSFT: {
                structureResult: {
                    choch: false,
                    chochType: 'none',
                    bos: true,
                    bosType: 'bearish',
                    sweep: 'none',
                    structureScore: -3,
                    structure: 'bearish'
                },
                conviction: 2,
                compositeScore: 15
            }
        };
        const alerts = checkStructureBreakdowns(holdings, [], scanData);
        const high = alerts.filter(a => a.severity === 'high');
        assert.ok(high.length > 0, 'Expected at least one high-severity alert');
        assert.equal(high[0].symbol, 'MSFT');
        assert.equal(high[0].type, 'bearish-bos');
    });

    it('generates high alert for high-swept liquidity', () => {
        const holdings = [{
            symbol: 'TSLA',
            entryPrice: 250,
            entryStructure: { structureScore: 1, structure: 'bullish' },
            shares: 20
        }];
        const scanData = {
            TSLA: {
                structureResult: {
                    choch: false,
                    chochType: 'none',
                    bos: false,
                    bosType: 'none',
                    sweep: 'high-swept',
                    structureScore: 0,
                    structure: 'ranging'
                },
                conviction: 4,
                compositeScore: 30
            }
        };
        const alerts = checkStructureBreakdowns(holdings, [], scanData);
        const high = alerts.filter(a => a.severity === 'high' && a.type === 'high-swept');
        assert.ok(high.length > 0, 'Expected high-severity sweep alert');
    });

    it('generates medium alert for structure score degradation', () => {
        const holdings = [{
            symbol: 'NVDA',
            entryPrice: 800,
            entryStructure: { structureScore: 3, structure: 'bullish' },
            shares: 2
        }];
        const scanData = {
            NVDA: {
                structureResult: {
                    choch: false,
                    chochType: 'none',
                    bos: false,
                    bosType: 'none',
                    sweep: 'none',
                    structureScore: 0,
                    structure: 'ranging'
                },
                conviction: 5,
                compositeScore: 40
            }
        };
        const alerts = checkStructureBreakdowns(holdings, [], scanData);
        const medium = alerts.filter(a => a.severity === 'medium' && a.type === 'structure-degraded');
        assert.ok(medium.length > 0, 'Expected medium-severity structure degradation alert');
        assert.equal(medium[0].currentValue, 0);
        assert.equal(medium[0].entryValue, 3);
    });

    it('returns empty array when no breakdowns detected', () => {
        const holdings = [{
            symbol: 'AAPL',
            entryPrice: 150,
            entryStructure: { structureScore: 2, structure: 'bullish' },
            shares: 10
        }];
        const scanData = {
            AAPL: {
                structureResult: {
                    choch: false,
                    chochType: 'none',
                    bos: false,
                    bosType: 'none',
                    sweep: 'none',
                    structureScore: 2,
                    structure: 'bullish'
                },
                conviction: 7,
                compositeScore: 60
            }
        };
        const alerts = checkStructureBreakdowns(holdings, [], scanData);
        assert.equal(alerts.length, 0);
    });

    it('skips symbols not in scanData', () => {
        const holdings = [{
            symbol: 'AAPL',
            entryPrice: 150,
            entryStructure: { structureScore: 2, structure: 'bullish' },
            shares: 10
        }];
        const alerts = checkStructureBreakdowns(holdings, [], {});
        assert.equal(alerts.length, 0);
    });

    it('handles empty holdings and watchlist', () => {
        const alerts = checkStructureBreakdowns([], [], {});
        assert.equal(alerts.length, 0);
    });

    it('checks watchlist symbols for breakdowns too', () => {
        const watchlist = [{ symbol: 'GOOGL', thresholdConviction: 7 }];
        const scanData = {
            GOOGL: {
                structureResult: {
                    choch: true,
                    chochType: 'bearish',
                    bos: false,
                    bosType: 'none',
                    sweep: 'none',
                    structureScore: -2,
                    structure: 'bearish'
                },
                conviction: 3,
                compositeScore: 20
            }
        };
        const alerts = checkStructureBreakdowns([], watchlist, scanData);
        const critical = alerts.filter(a => a.severity === 'critical');
        assert.ok(critical.length > 0, 'Expected critical alert for watchlist symbol');
        assert.equal(critical[0].symbol, 'GOOGL');
    });
});
