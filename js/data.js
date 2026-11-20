// ============================================================================
// OP 籌碼贏家 Pro (參照 www.op-win.com) — 台指選擇權籌碼量化資料與模擬引擎
// ============================================================================

const MARKET_SESSIONS = [
  {
    id: "2026-11-20-day",
    label: "2026-11-20 (五) 日盤即時 — 高檔震盪換手盤",
    contract: "202611 W4 (週選)",
    spotClose: 22845,
    txfOpen: 22780,
    txfClose: 22832,
    bias: "bull_consolidate",
    pcRatio: 114.8,
    vix: 16.42,
    summaryTag: "高檔震盪・支撐紮實",
    analysisReport: {
      headline: "台指與加權指數高檔衝高至 22,900 關卡後，呈現「劇烈震盪、高檔換手」走勢",
      volumeNote: "高檔維持溫和攻擊量，量能未見異常退潮，屬於良性換手。",
      spreadNote: "期現貨呈現 -13 點小幅逆價差，避險需求微幅上升但未見恐慌。",
      weightsNote: "台積電、廣達、鴻海穩盤，AI 伺服器供應鏈仍為多頭核心支柱。",
      techView: "均線維持多頭排列架構，短線因正乖離修正進行洗盤；回測下檔 Put 最大未平倉支撐區不破皆視為良性換手。",
      chipView: "主力於 23,000~23,100 佈局 SC 賣出買權形成短壓天花板；下檔 22,500~22,600 大量 SP 賣出賣權築起鐵板支撐。"
    }
  },
  {
    id: "2026-11-20-night",
    label: "2026-11-20 (五) 夜盤即時 — 美股連動偏多攻擊",
    contract: "202611 W4 (夜盤)",
    spotClose: 22845,
    txfOpen: 22835,
    txfClose: 22915,
    bias: "strong_bull",
    pcRatio: 122.5,
    vix: 15.68,
    summaryTag: "夜盤突破・主力買Call",
    analysisReport: {
      headline: "夜盤受美股科技股走強帶動，主力 BC (買進買權) 與 SP (賣出賣權) 同步放大",
      volumeNote: "夜盤突破 22,880 時伴隨主力紅線急拉，多方攻擊量能充沛。",
      spreadNote: "期貨轉為正價差 +70 點，外資夜盤空單持續回補。",
      weightsNote: "台積電 ADR 盤前上揚，帶動台指期夜盤站穩短多成本紅線之上。",
      techView: "突破日盤高點壓力，短多成本線（紅線）持續墊高，沿紅線偏多操作。",
      chipView: "CP 差額綠線自零軸翻正並一路走高，紅線 Call 位於零軸上方 (BC 買進買權)，藍線 Put 位於零軸下方 (SP 賣出賣權看不跌)。"
    }
  },
  {
    id: "2026-11-19-wed",
    label: "2026-11-19 (四) 歷史回顧 — 區間雙巴莊家收租盤",
    contract: "202611 W3",
    spotClose: 22710,
    txfOpen: 22730,
    txfClose: 22715,
    bias: "range_pin",
    pcRatio: 103.2,
    vix: 15.10,
    summaryTag: "區間收斂・賣方雙收",
    analysisReport: {
      headline: "莊家精準控盤於最大痛點 (Max Pain) 22,700 附近，上下賣方雙邊收乾時間價值",
      volumeNote: "早盤衝高遇壓、午盤急跌見撐，成交量集中於價平上下 200 點。",
      spreadNote: "期現貨價差收斂至 +5 點，市場等待新方向。",
      weightsNote: "電子權值股熄火整理，金融與高股息族群撐盤。",
      techView: "指數夾在短多成本（紅線）與短空成本（藍線）之間狹幅震盪，適合低吸高抛或賣方收租。",
      chipView: "紅線 Call 與藍線 Put 雙雙位於零軸之下（SC 賣出買權 + SP 賣出賣權），典型莊家看不漲也看不跌的雙賣收租結構。"
    }
  },
  {
    id: "2026-11-18-bull",
    label: "2026-11-18 (三) 歷史回顧 — 多頭強軋空突破盤",
    contract: "202611 W3",
    spotClose: 22980,
    txfOpen: 22750,
    txfClose: 23005,
    bias: "strong_bull",
    pcRatio: 131.4,
    vix: 17.05,
    summaryTag: "主力軋空・紅線噴出",
    analysisReport: {
      headline: "開盤即站上多方成本紅線，主力大舉 BC (買進買權) 觸發賣方倒莊停損軋空",
      volumeNote: "早盤 09:15 爆出突破大量，空方 SC 被迫停損回補推升指數。",
      spreadNote: "正價差擴大至 +25 點，期貨領先現貨強勢攻高。",
      weightsNote: "半導體與 AI 權值股全面噴出，外資期現貨同步大買。",
      techView: "一開盤即突破短多成本（紅線）且一路未曾跌破綠線（多空成本），標準單邊多頭趨勢盤。",
      chipView: "CP 差額綠線呈 45 度角仰攻，主散圖中主力紅線大幅正值、散戶藍線一路逆勢放空被軋。"
    }
  },
  {
    id: "2026-11-17-bear",
    label: "2026-11-17 (二) 歷史回顧 — 外資避險BP急殺盤",
    contract: "202611 W3",
    spotClose: 22420,
    txfOpen: 22690,
    txfClose: 22385,
    bias: "strong_bear",
    pcRatio: 84.6,
    vix: 19.85,
    summaryTag: "主力買Put・跌破藍線",
    analysisReport: {
      headline: "早盤跌破短空成本藍線，主力大買 BP (買進賣權) 並大賣 SC (賣出買權) 壓低結算",
      volumeNote: "下殺過程出量、反彈無量，空方掌握全場節奏。",
      spreadNote: "逆價差擴大至 -35 點，外資與自營商避險空單傾巢而出。",
      weightsNote: "權值股遭到外資提款調節，防守型族群亦難獨善其身。",
      techView: "指數全程壓在短空成本（藍線）與多空分界（綠線）之下，反彈觸及藍線皆為空點。",
      chipView: "CP 差額圖中藍線 (Put) 強勢站上零軸上方 (BP 買進賣權看大跌)，紅線 (Call) 深陷零軸下方 (SC 賣出買權看不漲)。"
    }
  }
];

// Deterministic pseudo-random helper so charts are realistic and consistent
function seededNoise(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Generates intraday 1m / 5m / 15m K-lines and the 3 op-win.com real-time chip line modes:
 * Mode 1: CP 差額圖 (Green = CP差額值, Red = Call買賣超 [>0 BC, <0 SC], Blue = Put買賣超 [>0 BP, <0 SP])
 * Mode 2: 台指期多空圖 (Red = 多方成本, Blue = 短空成本, Green = 多空分界成本, plus TXF price)
 * Mode 3: 主散圖 (Red = 主力籌碼, Blue = 散戶籌碼, Green = 市場趨勢合力)
 */
function generateIntradaySeries(sessionCfg, timeframeMin = 5) {
  const totalMinutes = 300; // 08:45 ~ 13:45 (300 mins)
  const step = timeframeMin;
  const count = Math.floor(totalMinutes / step);
  const startMin = 8 * 60 + 45;

  const baseOpen = sessionCfg.txfOpen;
  const targetClose = sessionCfg.txfClose;
  const totalDrift = targetClose - baseOpen;
  const bias = sessionCfg.bias;

  const bars = [];
  let prevClose = baseOpen;
  let cumCall = 0;
  let cumPut = 0;
  let cumMajor = 0;
  let cumRetail = 0;

  for (let i = 0; i <= count; i++) {
    const curMin = startMin + i * step;
    const hh = String(Math.floor(curMin / 60)).padStart(2, "0");
    const mm = String(curMin % 60).padStart(2, "0");
    const timeLabel = `${hh}:${mm}`;
    const progress = i / Math.max(1, count);

    const n1 = seededNoise(i * 3.1 + baseOpen) - 0.5;
    const n2 = seededNoise(i * 7.3 + targetClose) - 0.5;
    const wave = Math.sin(progress * Math.PI * (bias === "range_pin" ? 3.5 : 2.0)) * (bias === "range_pin" ? 55 : 42);

    const expectedPrice = baseOpen + totalDrift * progress + wave + n1 * 28;
    const open = i === 0 ? baseOpen : prevClose;
    const close = i === count ? targetClose : Math.round(expectedPrice);
    const spread = Math.round(12 + Math.abs(n2) * 26 * Math.sqrt(step / 5));
    const high = Math.max(open, close) + Math.round(spread * (0.4 + seededNoise(i + 11) * 0.6));
    const low = Math.min(open, close) - Math.round(spread * (0.4 + seededNoise(i + 23) * 0.6));
    const vol = Math.round((850 + Math.abs(close - open) * 25 + seededNoise(i + 37) * 600) * (step / 5));
    prevClose = close;

    // 1. CP 差額圖數據 (Red = Call [>0 BC, <0 SC], Blue = Put [>0 BP, <0 SP], Green = CP差額值)
    if (bias === "strong_bull") {
      cumCall += (180 + n1 * 140) * (step / 5);   // 主力買進買權 BC (> 0)
      cumPut += (-150 + n2 * 110) * (step / 5);   // 主力賣出賣權 SP (< 0)
      cumMajor += (210 + n1 * 120) * (step / 5);
      cumRetail += (-185 - n1 * 100) * (step / 5);
    } else if (bias === "strong_bear") {
      cumCall += (-195 + n1 * 130) * (step / 5);  // 主力賣出買權 SC (< 0)
      cumPut += (220 + n2 * 140) * (step / 5);    // 主力買進賣權 BP (> 0)
      cumMajor += (-230 + n1 * 120) * (step / 5);
      cumRetail += (190 - n1 * 110) * (step / 5);
    } else if (bias === "range_pin") {
      cumCall += (-95 + Math.sin(progress * 6) * 45) * (step / 5); // SC (< 0)
      cumPut += (-105 + Math.cos(progress * 6) * 45) * (step / 5); // SP (< 0)
      cumMajor += (Math.sin(progress * Math.PI * 2) * 60) * (step / 5);
      cumRetail += (-Math.sin(progress * Math.PI * 2) * 55) * (step / 5);
    } else {
      // bull_consolidate
      cumCall += (65 + Math.sin(progress * Math.PI * 2.5) * 90 + n1 * 70) * (step / 5);
      cumPut += (-125 + n2 * 80) * (step / 5); // SP 支撐強 (< 0)
      cumMajor += (95 + Math.sin(progress * Math.PI * 2) * 70) * (step / 5);
      cumRetail += (-80 - Math.sin(progress * Math.PI * 2) * 60) * (step / 5);
    }

    const callVal = Math.round(cumCall);
    const putVal = Math.round(cumPut);
    // CP 差額值 (綠線): 多方淨力道 = Call買超 - Put買超 (例如 BC(+2000) - SP(-1800) = +3800 強多)
    const cpDiffVal = Math.round(callVal - putVal);

    // 2. 台指期多空成本圖 (紅線 = 短多成本, 藍線 = 短空成本, 綠線 = 多空分界成本)
    const greenMidCost = Math.round(baseOpen + (totalDrift * progress * 0.65));
    const redBullCost = Math.round(greenMidCost + (bias === "strong_bull" ? -18 : 22) + Math.sin(progress * 4) * 12);
    const blueBearCost = Math.round(greenMidCost - (bias === "strong_bear" ? -18 : 24) + Math.cos(progress * 4) * 12);

    // 3. 主散圖 (紅線 = 主力, 藍線 = 散戶, 綠線 = 市場趨勢)
    const majorVal = Math.round(cumMajor);
    const retailVal = Math.round(cumRetail);
    const trendVal = Math.round(majorVal - retailVal * 0.6);

    bars.push({
      idx: i,
      time: timeLabel,
      open,
      high,
      low,
      close,
      vol,
      // Mode 1: CP 差額圖
      callVal,
      putVal,
      cpDiffVal,
      callAction: callVal >= 0 ? "BC (買進買權)" : "SC (賣出買權)",
      putAction: putVal >= 0 ? "BP (買進賣權)" : "SP (賣出賣權)",
      // Mode 2: 台指期多空成本圖
      redBullCost,
      blueBearCost,
      greenMidCost,
      // Mode 3: 主散圖
      majorVal,
      retailVal,
      trendVal
    });
  }

  return bars;
}

/**
 * Generates T-Quote Options Strike Chain (22,000 ~ 23,600) with Call/Put OI, OI Delta,
 * Dominant Action (BC/SC/BP/SP), Max Pain, Call Wall (壓力天花板), Put Wall (支撐地板),
 * and per-strike intraday + 7-day curves for the modal drill-down.
 */
function generateStrikeChain(sessionCfg, cumDays = 1) {
  const spot = sessionCfg.txfClose;
  const atmStrike = Math.round(spot / 100) * 100;
  const minStrike = atmStrike - 800;
  const maxStrike = atmStrike + 800;
  const mult = cumDays === 1 ? 1.0 : (cumDays === 3 ? 1.85 : (cumDays === 5 ? 2.6 : 4.2));

  const strikes = [];
  for (let k = minStrike; k <= maxStrike; k += 100) {
    const dist = k - spot; // >0 Call OTM, <0 Put OTM
    const absDist = Math.abs(dist);
    const seed = k + sessionCfg.spotClose;

    // Theoretical premium
    const timeVal = Math.max(6, Math.round(145 * Math.exp(-absDist / 260)));
    const callIntrinsic = Math.max(0, spot - k);
    const putIntrinsic = Math.max(0, k - spot);
    const callPrice = Math.max(1.5, Math.round((callIntrinsic + timeVal) * 10) / 10);
    const putPrice = Math.max(1.5, Math.round((putIntrinsic + timeVal) * 10) / 10);

    const callChg = Math.round(((sessionCfg.txfClose - sessionCfg.txfOpen) * (dist < 200 ? 0.55 : 0.25)) * 10) / 10;
    const putChg = Math.round((-(sessionCfg.txfClose - sessionCfg.txfOpen) * (dist > -200 ? 0.55 : 0.25)) * 10) / 10;

    // Open Interest distribution: Call peaks at ATM+200 ~ ATM+400; Put peaks at ATM-200 ~ ATM-400
    const callPeakDist = Math.abs(k - (atmStrike + 300));
    const putPeakDist = Math.abs(k - (atmStrike - 300));

    const baseCallOi = Math.round((3200 + 9500 * Math.exp(-(callPeakDist * callPeakDist) / (2 * 220 * 220)) + seededNoise(seed) * 1400) * mult);
    const basePutOi = Math.round((3400 + 10200 * Math.exp(-(putPeakDist * putPeakDist) / (2 * 220 * 220)) + seededNoise(seed + 9) * 1500) * mult);

    const callOiDelta = Math.round(((dist >= 200 ? 1150 : 380) + (seededNoise(seed + 3) - 0.32) * 950) * Math.sqrt(mult));
    const putOiDelta = Math.round(((dist <= -200 ? 1280 : 410) + (seededNoise(seed + 7) - 0.30) * 980) * Math.sqrt(mult));

    const callVol = Math.round(baseCallOi * (0.45 + seededNoise(seed + 15) * 0.5));
    const putVol = Math.round(basePutOi * (0.42 + seededNoise(seed + 19) * 0.5));

    // Determine dominant major force action (BC / SC / BP / SP)
    let callAction = "SC";
    if (k <= atmStrike + 100 && sessionCfg.bias !== "strong_bear") {
      callAction = "BC"; // 價平附近買進買權攻擊
    }
    let putAction = "SP";
    if (k >= atmStrike - 100 && sessionCfg.bias === "strong_bear") {
      putAction = "BP"; // 空方買進賣權下殺
    } else if (k === atmStrike && sessionCfg.bias === "range_pin") {
      putAction = "SP";
    }

    // Per-strike intraday curve (12 points from 08:45 to 13:45) & 7-day OI curve
    const intradayCurve = [];
    const weeklyCurve = [];
    for (let t = 0; t < 12; t++) {
      const pRatio = t / 11;
      const cP = Math.max(1, Math.round((callPrice - callChg * (1 - pRatio) + (seededNoise(seed + t) - 0.5) * 8) * 10) / 10);
      const pP = Math.max(1, Math.round((putPrice - putChg * (1 - pRatio) + (seededNoise(seed + t + 50) - 0.5) * 8) * 10) / 10);
      const cV = Math.round((callVol / 12) * (0.6 + seededNoise(seed + t * 2) * 0.9));
      const pV = Math.round((putVol / 12) * (0.6 + seededNoise(seed + t * 3) * 0.9));
      const minMark = 8 * 60 + 45 + t * 25;
      const hm = `${String(Math.floor(minMark / 60)).padStart(2, "0")}:${String(minMark % 60).padStart(2, "0")}`;
      intradayCurve.push({ time: hm, callPrice: cP, putPrice: pP, callVol: cV, putVol: pV });
    }

    const dayLabels = ["D-6", "D-5", "D-4", "D-3", "D-2", "昨日", "今日"];
    for (let d = 0; d < 7; d++) {
      const factor = 0.55 + (d / 6) * 0.45;
      weeklyCurve.push({
        day: dayLabels[d],
        callOi: Math.round(baseCallOi * factor),
        putOi: Math.round(basePutOi * factor)
      });
    }

    strikes.push({
      strike: k,
      isAtm: k === atmStrike,
      callPrice,
      callChg,
      callVol,
      callOi: baseCallOi,
      callOiDelta,
      callAction,
      putPrice,
      putChg,
      putVol,
      putOi: basePutOi,
      putOiDelta,
      putAction,
      intradayCurve,
      weeklyCurve
    });
  }

  // Compute Call Wall (最大買權未平倉壓力), Put Wall (最大賣權未平倉支撐), and Max Pain (莊家最大痛點)
  let maxCallOi = -1, callWallStrike = atmStrike + 300;
  let maxPutOi = -1, putWallStrike = atmStrike - 300;
  let totalCallOi = 0, totalPutOi = 0;

  strikes.forEach(s => {
    totalCallOi += s.callOi;
    totalPutOi += s.putOi;
    if (s.callOi > maxCallOi) { maxCallOi = s.callOi; callWallStrike = s.strike; }
    if (s.putOi > maxPutOi) { maxPutOi = s.putOi; putWallStrike = s.strike; }
  });

  // Max Pain calculation: strike price where total intrinsic payout by option sellers is minimized
  let minPayout = Infinity;
  let maxPainStrike = atmStrike;
  strikes.forEach(candidate => {
    const settlePrice = candidate.strike;
    let payout = 0;
    strikes.forEach(s => {
      if (settlePrice > s.strike) payout += (settlePrice - s.strike) * s.callOi;
      if (settlePrice < s.strike) payout += (s.strike - settlePrice) * s.putOi;
    });
    if (payout < minPayout) {
      minPayout = payout;
      maxPainStrike = settlePrice;
    }
  });

  strikes.forEach(s => {
    s.isCallWall = s.strike === callWallStrike;
    s.isPutWall = s.strike === putWallStrike;
    s.isMaxPain = s.strike === maxPainStrike;
  });

  return {
    strikes,
    atmStrike,
    callWallStrike,
    maxCallOi,
    putWallStrike,
    maxPutOi,
    maxPainStrike,
    totalCallOi,
    totalPutOi,
    calcPcRatio: Math.round((totalPutOi / Math.max(1, totalCallOi)) * 1000) / 10
  };
}

// 三大法人選擇權買賣方籌碼結構 (外資 / 自營商 / 投信 的 BC, SC, BP, SP 口數與契約金額)
const INSTITUTIONAL_CHIPS = [
  {
    actor: "外資及陸資 (Foreign Investors)",
    roleNote: "趨勢波段主力・重視契約金額規模",
    bcLots: 18420,
    bcAmtM: 842,
    scLots: 12150,
    scAmtM: 465,
    bpLots: 15890,
    bpAmtM: 590,
    spLots: 14320,
    spAmtM: 488,
    verdict: "買權淨多單 +6,270 口（淨額 +3.77 億），偏多佈局並搭配 BP 避險"
  },
  {
    actor: "自營商 (Dealers / Market Makers)",
    roleNote: "選擇權造市莊家・擅長雙賣收租與 Gamma 動態避險",
    bcLots: 34210,
    bcAmtM: 1120,
    scLots: 42850,
    scAmtM: 1495,
    bpLots: 29400,
    bpAmtM: 880,
    spLots: 46120,
    spAmtM: 1580,
    verdict: "大幅賣出賣權 SP (-16,720 口) 看不跌，上檔賣出買權 SC (-8,640 口) 鎖定區間收租"
  },
  {
    actor: "投信 (Investment Trust)",
    roleNote: "現貨部位避險為主",
    bcLots: 420,
    bcAmtM: 19,
    scLots: 180,
    scAmtM: 7,
    bpLots: 650,
    bpAmtM: 24,
    spLots: 110,
    spAmtM: 4,
    verdict: "小額買進賣權 BP 作為現貨基金部位下檔保護"
  }
];
