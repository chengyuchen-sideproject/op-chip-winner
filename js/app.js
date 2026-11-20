// ============================================================================
// OP 籌碼贏家 Pro (參照 www.op-win.com)
// 支援「臺灣期貨交易所 (TAIFEX MIS) 真實即時行情與選擇權籌碼連線」+「歷史盤勢復盤」
// ============================================================================

let CURRENT_TAB = "realtime";
let CURRENT_SESSION_ID = "LIVE_TAIFEX"; // Default to LIVE TAIFEX real-time data!
let CURRENT_LINE_MODE = "cp";           // 'cp' (CP差額圖) | 'cost' (台指期多空圖) | 'major' (主散圖)
let CURRENT_TIMEFRAME = 5;              // 1 | 5 | 15 (分鐘)
let CURRENT_CUM_DAYS = 1;               // 1 | 3 | 5 | 20
let STRIKE_VIEW_MODE = "auto";          // 'auto' | 'mobile' | 'desktop'

// Live TAIFEX State
let TAIFEX_MARKET_TYPE = "AUTO";        // "AUTO" | "0" (日盤) | "1" (夜盤)
let TAIFEX_EXPIRE_MONTH = "";           // e.g. "202611W4"
let TAIFEX_AVAILABLE_MONTHS = [];
let TAIFEX_AUTO_POLL = true;
let TAIFEX_POLL_TIMER = null;
let TAIFEX_STATUS = {
  connected: false,
  lastUpdate: "-",
  activeMarketLabel: "偵測中...",
  txfSymbol: "",
  txfPrice: 0,
  txfOpen: 0,
  txfHigh: 0,
  txfLow: 0,
  txfDiff: 0,
  txfVol: 0,
  spotPrice: 0,
  bidUnit: 0,
  askUnit: 0,
  bidCount: 0,
  askCount: 0,
  errorMsg: ""
};

// Replay Simulator State
let REPLAY_TIMEFRAME = 5;
let REPLAY_MODE = "cp";
let REPLAY_BARS = [];
let REPLAY_STEP = 15;
let REPLAY_TIMER = null;
let REPLAY_SPEED = 600;

// Academy Payoff Calculator State
let PAYOFF_ACTION = "BC";
let PAYOFF_STRIKE = 35300;
let PAYOFF_PREMIUM = 220;

// Cached Active Data
let ACTIVE_BARS = [];
let ACTIVE_CHAIN = null;

function fmtNum(n) {
  return Number(n || 0).toLocaleString();
}

function fmtSigned(n) {
  const val = Number(n || 0);
  return (val > 0 ? "+" : "") + val.toLocaleString();
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function getSessionConfig() {
  if (CURRENT_SESSION_ID === "LIVE_TAIFEX") {
    const sp = TAIFEX_STATUS.spotPrice || TAIFEX_STATUS.txfPrice || 36033;
    const tp = TAIFEX_STATUS.txfPrice || 35321;
    const to = TAIFEX_STATUS.txfOpen || tp;
    const pc = ACTIVE_CHAIN ? ACTIVE_CHAIN.calcPcRatio : 108.5;
    return {
      id: "LIVE_TAIFEX",
      label: `🟢 期交所即時連線 (${TAIFEX_STATUS.activeMarketLabel})`,
      contract: `${TAIFEX_EXPIRE_MONTH || "近月"} (${TAIFEX_STATUS.activeMarketLabel})`,
      spotClose: Math.round(sp),
      txfOpen: Math.round(to),
      txfClose: Math.round(tp),
      bias: tp >= to ? "strong_bull" : "strong_bear",
      pcRatio: pc,
      vix: 17.8,
      summaryTag: "TAIFEX 即時籌碼",
      analysisReport: {
        headline: `【期交所 MIS 即時連線】台指期最新 ${fmtNum(Math.round(tp))} 點（漲跌 ${fmtSigned(Math.round(TAIFEX_STATUS.txfDiff))}），合約 ${TAIFEX_EXPIRE_MONTH || '近月'}`,
        volumeNote: `目前台指期累計成交量 ${fmtNum(TAIFEX_STATUS.txfVol)} 口，委買總口數 ${fmtNum(TAIFEX_STATUS.bidUnit)} 口 vs 委賣總口數 ${fmtNum(TAIFEX_STATUS.askUnit)} 口。`,
        spreadNote: `台指期 ${fmtNum(Math.round(tp))} 點 vs 加權現貨 ${fmtNum(Math.round(sp))} 點，價差 ${fmtSigned(Math.round(tp - sp))} 點。`,
        weightsNote: `平均每筆委買 ${(TAIFEX_STATUS.bidUnit / Math.max(1, TAIFEX_STATUS.bidCount)).toFixed(2)} 口 vs 平均每筆委賣 ${(TAIFEX_STATUS.askUnit / Math.max(1, TAIFEX_STATUS.askCount)).toFixed(2)} 口（反映主力大單傾向）。`,
        techView: ACTIVE_BARS.length ? `即時多空分界成本 (VWAP 綠線) 位於 ${fmtNum(ACTIVE_BARS[ACTIVE_BARS.length - 1].greenMidCost)} 點，短多成本 (紅線) ${fmtNum(ACTIVE_BARS[ACTIVE_BARS.length - 1].redBullCost)} 點，短空成本 (藍線) ${fmtNum(ACTIVE_BARS[ACTIVE_BARS.length - 1].blueBearCost)} 點。` : "等待即時分K資料載入。",
        chipView: ACTIVE_CHAIN ? `目前選擇權買權最大未平倉壓力區 (Call Wall) 位於 ${fmtNum(ACTIVE_CHAIN.callWallStrike)} 點 (${fmtNum(ACTIVE_CHAIN.maxCallOi)} 口)；賣權最大未平倉支撐區 (Put Wall) 位於 ${fmtNum(ACTIVE_CHAIN.putWallStrike)} 點 (${fmtNum(ACTIVE_CHAIN.maxPutOi)} 口)；莊家最大痛點 (Max Pain) 位於 ${fmtNum(ACTIVE_CHAIN.maxPainStrike)} 點。` : "等待選擇權 T 字報價載入。"
      }
    };
  }
  return MARKET_SESSIONS.find(s => s.id === CURRENT_SESSION_ID) || MARKET_SESSIONS[0];
}

// ============================================================================
// 1. Real-Time TAIFEX MIS API Client (Async Native Android Bridge / Proxy / CORS)
// ============================================================================
const __taifexPending = {};
let __taifexReqSeq = 1;

window.__onTaifexAsyncResult = function(reqId, ok, payload) {
  const cb = __taifexPending[reqId];
  if (!cb) return;
  delete __taifexPending[reqId];
  if (!ok) {
    cb.reject(new Error(payload || "Network error"));
    return;
  }
  try {
    cb.resolve(JSON.parse(payload));
  } catch (e) {
    cb.reject(e);
  }
};

async function taifexPost(endpoint, payloadObj) {
  const targetUrl = `https://mis.taifex.com.tw/futures/api/${endpoint}`;
  const bodyStr = JSON.stringify(payloadObj);

  // Path A1: Non-blocking Async Native Android Bridge (does not freeze UI thread!)
  if (window.TaifexNative && typeof window.TaifexNative.postJsonAsync === "function") {
    return await new Promise((resolve, reject) => {
      const reqId = String(__taifexReqSeq++);
      __taifexPending[reqId] = { resolve, reject };
      window.TaifexNative.postJsonAsync(reqId, targetUrl, bodyStr);
    });
  }

  // Path A2: Legacy Sync Native Android Bridge fallback
  if (window.TaifexNative && typeof window.TaifexNative.postJson === "function") {
    const raw = window.TaifexNative.postJson(targetUrl, bodyStr);
    if (raw && !raw.startsWith("ERROR:")) {
      return JSON.parse(raw);
    }
  }

  // Path B: Local Python/Node proxy server (/taifex-mis/<endpoint>)
  if (location.protocol.startsWith("http") && (location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
    try {
      const resp = await fetch(`/taifex-mis/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json;charset=UTF-8" },
        body: bodyStr
      });
      if (resp.ok) return await resp.json();
    } catch (e) {}
  }

  // Path C: Direct fetch (works when WebView allowUniversalAccessFromFileURLs is enabled)
  try {
    const resp = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: bodyStr
    });
    if (resp.ok) return await resp.json();
  } catch (e) {}

  // Path D: CORS Proxy fallback for GitHub Pages / Desktop browser file://
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
  const resp = await fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: bodyStr
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

function formatTaifexTime(tStr) {
  const s = String(tStr || "").padStart(6, "0");
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}

async function fetchLiveTaifexData() {
  if (CURRENT_SESSION_ID !== "LIVE_TAIFEX") return;
  try {
    // Step 1: Decide MarketType (0 = 日盤 08:45~13:45, 1 = 夜盤 15:00~05:00)
    const nowHour = new Date().getHours();
    let mType = TAIFEX_MARKET_TYPE;
    if (mType === "AUTO") {
      mType = (nowHour >= 15 || nowHour < 6) ? "1" : "0";
    }

    // Fetch Day Session TXF (for Spot TXF-S and Day references) & Night Session TXF if mType == "1"
    const fDayResp = await taifexPost("getQuoteList", {
      MarketType: "0", SymbolType: "F", KindID: "1", CID: "TXF",
      ExpireMonth: "", RowSize: "全部", PageNo: "", SortColumn: "", AscDesc: "A"
    });
    const dayQuotes = (fDayResp && fDayResp.RtData && fDayResp.RtData.QuoteList) || [];
    const spotRow = dayQuotes.find(q => q.SymbolID === "TXF-S");
    const dayFrontTxf = dayQuotes.find(q => q.SymbolID && q.SymbolID.endsWith("-F") && Number(q.CLastPrice) > 0);

    let activeTxfRow = dayFrontTxf;
    if (mType === "1") {
      const fNightResp = await taifexPost("getQuoteList", {
        MarketType: "1", SymbolType: "F", KindID: "1", CID: "TXF",
        ExpireMonth: "", RowSize: "全部", PageNo: "", SortColumn: "", AscDesc: "A"
      });
      const nightQuotes = (fNightResp && fNightResp.RtData && fNightResp.RtData.QuoteList) || [];
      const nightFrontTxf = nightQuotes.find(q => q.SymbolID && q.SymbolID.endsWith("-M") && Number(q.CLastPrice) > 0);
      if (nightFrontTxf) {
        activeTxfRow = nightFrontTxf;
      } else {
        mType = "0";
      }
    }

    if (!activeTxfRow) throw new Error("無法取得期交所台指期即時報價");

    // Step 2: Fetch 1-minute K-lines & Order Book of active TXF (getChartData1M)
    const chart1mResp = await taifexPost("getChartData1M", { SymbolID: activeTxfRow.SymbolID });
    const rtChart = (chart1mResp && chart1mResp.RtData) || {};
    const quoteDetail = rtChart.Quote || activeTxfRow;
    const rawTicks = rtChart.Ticks || [];

    const spotVal = spotRow && Number(spotRow.CLastPrice) > 0 ? Number(spotRow.CLastPrice) : Number(activeTxfRow.CLastPrice);
    const txfPrice = Number(quoteDetail.CLastPrice || activeTxfRow.CLastPrice || 0);
    const txfRef = Number(quoteDetail.CRefPrice || activeTxfRow.CRefPrice || txfPrice);
    const txfOpen = Number(quoteDetail.COpenPrice || activeTxfRow.COpenPrice || txfPrice);

    TAIFEX_STATUS = {
      connected: true,
      lastUpdate: formatTaifexTime(activeTxfRow.CTime || new Date().toTimeString().slice(0, 8).replace(/:/g, "")),
      activeMarketLabel: mType === "1" ? "夜盤即時 (After-Hours)" : "日盤即時 (Regular)",
      activeMarketType: mType,
      txfSymbol: activeTxfRow.SymbolID,
      txfPrice: txfPrice,
      txfOpen: txfOpen,
      txfHigh: Number(quoteDetail.CHighPrice || txfPrice),
      txfLow: Number(quoteDetail.CLowPrice || txfPrice),
      txfDiff: txfPrice - txfRef,
      txfVol: Number(quoteDetail.CTotalVolume || activeTxfRow.CTotalVolume || 0),
      spotPrice: spotVal,
      bidUnit: Number(quoteDetail.CBidUnit || 0),
      askUnit: Number(quoteDetail.CAskUnit || 0),
      bidCount: Number(quoteDetail.CBidCount || 1),
      askCount: Number(quoteDetail.CAskCount || 1),
      errorMsg: ""
    };

    PAYOFF_STRIKE = Math.round(txfPrice / 100) * 100;

    // Step 3: Fetch Available Option Contract Months (if not yet fetched)
    const ddlResp = await taifexPost("getCmdyMonthDDLItemByKind", {
      MarketType: mType, SymbolType: "O", KindID: "1", CID: "TXO"
    });
    const rawMonths = ((ddlResp && ddlResp.RtData && ddlResp.RtData.Items) || [])
      .map(x => x.item)
      .filter(m => m && /^[0-9]{6}/.test(m));
    if (rawMonths.length) {
      TAIFEX_AVAILABLE_MONTHS = rawMonths;
      if (!TAIFEX_EXPIRE_MONTH || rawMonths.indexOf(TAIFEX_EXPIRE_MONTH) === -1) {
        TAIFEX_EXPIRE_MONTH = rawMonths[0];
      }
    }

    // Step 4: Fetch Options T-Quote Chain (both Day Session for OpenInterest and Active Session for Live Prices)
    const optActiveResp = await taifexPost("getQuoteListOption", {
      MarketType: mType, SymbolType: "O", KindID: "1", CID: "TXO",
      ExpireMonth: TAIFEX_EXPIRE_MONTH, RowSize: "全部", PageNo: "", SortColumn: "", AscDesc: "A"
    });
    const activeOptList = (optActiveResp && optActiveResp.RtData && optActiveResp.RtData.QuoteList) || [];

    let dayOiMap = {};
    if (mType === "1") {
      try {
        const optDayResp = await taifexPost("getQuoteListOption", {
          MarketType: "0", SymbolType: "O", KindID: "1", CID: "TXO",
          ExpireMonth: TAIFEX_EXPIRE_MONTH, RowSize: "全部", PageNo: "", SortColumn: "", AscDesc: "A"
        });
        const dayOptList = (optDayResp && optDayResp.RtData && optDayResp.RtData.QuoteList) || [];
        dayOptList.forEach(o => {
          const k = `${Math.round(Number(o.StrikePrice))}_${o.CP}`;
          dayOiMap[k] = Number(o.OpenInterest || 0);
        });
      } catch (e) {}
    }

    // Build Live Strike Chain & Net Call/Put Option Force
    const BuiltChain = buildLiveStrikeChainFromTaifex(activeOptList, dayOiMap, txfPrice);
    ACTIVE_CHAIN = BuiltChain;

    // Build Live Intraday 1m / 5m / 15m Bars & 3-Mode Chip Lines from TAIFEX 1M Ticks
    ACTIVE_BARS = buildLiveBarsFromTaifexTicks(rawTicks, CURRENT_TIMEFRAME, BuiltChain, TAIFEX_STATUS);
    REPLAY_BARS = buildLiveBarsFromTaifexTicks(rawTicks, REPLAY_TIMEFRAME, BuiltChain, TAIFEX_STATUS);
    if (REPLAY_STEP >= REPLAY_BARS.length) {
      REPLAY_STEP = Math.max(0, REPLAY_BARS.length - 1);
    }

    markAllTabsDirty();
    updateTickerBar();
    if (CURRENT_TAB === "realtime") { renderRealtimeTab(); TAB_DIRTY.realtime = false; }
    else if (CURRENT_TAB === "strikes") { renderStrikesTab(); TAB_DIRTY.strikes = false; }
    else if (CURRENT_TAB === "analysis") { renderAnalysisTab(); TAB_DIRTY.analysis = false; }
  } catch (err) {
    TAIFEX_STATUS.connected = false;
    TAIFEX_STATUS.errorMsg = err.message || String(err);
    if (!ACTIVE_BARS.length) {
      const fallbackCfg = MARKET_SESSIONS[0];
      ACTIVE_BARS = generateIntradaySeries(fallbackCfg, CURRENT_TIMEFRAME);
      ACTIVE_CHAIN = generateStrikeChain(fallbackCfg, CURRENT_CUM_DAYS);
    }
    markAllTabsDirty();
    updateTickerBar();
    if (CURRENT_TAB === "realtime") { renderRealtimeTab(); TAB_DIRTY.realtime = false; }
  }
}

/**
 * Converts TAIFEX getQuoteListOption response into our structured Strike Chain,
 * calculating live BC/SC/BP/SP dominant actions, Call/Put Walls, Max Pain, and Total Call/Put Net Force.
 */
function buildLiveStrikeChainFromTaifex(optList, dayOiMap, spotPrice) {
  const atmStrike = Math.round(spotPrice / 100) * 100;
  const strikeMap = {};

  optList.forEach(o => {
    const k = Math.round(Number(o.StrikePrice || 0));
    if (!k) return;
    if (!strikeMap[k]) {
      strikeMap[k] = {
        strike: k,
        isAtm: k === atmStrike,
        callSymbol: "", callPrice: 0, callRef: 0, callChg: 0, callVol: 0, callOi: 0, callOiDelta: 0, callBid: 0, callAsk: 0, callAction: "SC",
        putSymbol: "",  putPrice: 0,  putRef: 0,  putChg: 0,  putVol: 0,  putOi: 0,  putOiDelta: 0,  putBid: 0,  putAsk: 0,  putAction: "SP",
        intradayCurve: [],
        weeklyCurve: []
      };
    }
    const row = strikeMap[k];
    const lastP = Number(o.CLastPrice || o.CRefPrice || 0);
    const refP = Number(o.CRefPrice || lastP || 0);
    const chg = Math.round((lastP - refP) * 10) / 10;
    const vol = Number(o.CTotalVolume || 0);
    const oiKey = `${k}_${o.CP}`;
    const oi = Number(o.OpenInterest || dayOiMap[oiKey] || 0);
    const bidSz = Number(o.CBestBidSize || o.CBidSize1 || 0);
    const askSz = Number(o.CBestAskSize || o.CAskSize1 || 0);

    if (o.CP === "C") {
      row.callSymbol = o.SymbolID || "";
      row.callPrice = lastP;
      row.callRef = refP;
      row.callChg = chg;
      row.callVol = vol;
      row.callOi = oi;
      row.callBid = bidSz;
      row.callAsk = askSz;
      // Price up or bid-heavy on Call = BC (買進買權); Price down or ask-heavy = SC (賣出買權)
      row.callAction = (chg > 0 || (chg === 0 && bidSz > askSz)) ? "BC" : "SC";
      row.callOiDelta = Math.round((chg >= 0 ? 1 : -1) * Math.min(oi, Math.round(vol * 0.22)));
    } else if (o.CP === "P") {
      row.putSymbol = o.SymbolID || "";
      row.putPrice = lastP;
      row.putRef = refP;
      row.putChg = chg;
      row.putVol = vol;
      row.putOi = oi;
      row.putBid = bidSz;
      row.putAsk = askSz;
      // Price up or bid-heavy on Put = BP (買進賣權); Price down or ask-heavy = SP (賣出賣權)
      row.putAction = (chg > 0 || (chg === 0 && bidSz > askSz)) ? "BP" : "SP";
      row.putOiDelta = Math.round((chg >= 0 ? 1 : -1) * Math.min(oi, Math.round(vol * 0.22)));
    }
  });

  // Filter strikes within ATM +/- 1200 pts so the T-table focuses on active strikes
  let allStrikes = Object.values(strikeMap).sort((a, b) => a.strike - b.strike);
  let nearStrikes = allStrikes.filter(s => Math.abs(s.strike - atmStrike) <= 1200 && (s.callVol + s.putVol + s.callOi + s.putOi > 0));
  if (nearStrikes.length < 8) nearStrikes = allStrikes.slice(Math.max(0, Math.floor(allStrikes.length / 2) - 10), Math.floor(allStrikes.length / 2) + 10);

  let maxCallOi = -1, callWallStrike = atmStrike + 300;
  let maxPutOi = -1, putWallStrike = atmStrike - 300;
  let totalCallOi = 0, totalPutOi = 0;
  let totalCallNetForce = 0; // >0 BC, <0 SC
  let totalPutNetForce = 0;  // >0 BP, <0 SP

  nearStrikes.forEach(s => {
    const cWeight = s.callOi > 0 ? s.callOi : s.callVol;
    const pWeight = s.putOi > 0 ? s.putOi : s.putVol;
    totalCallOi += cWeight;
    totalPutOi += pWeight;
    if (cWeight > maxCallOi) { maxCallOi = cWeight; callWallStrike = s.strike; }
    if (pWeight > maxPutOi) { maxPutOi = pWeight; putWallStrike = s.strike; }

    // Active Call/Put Net Force in contracts:
    // If Call price > RefPrice, buyers are actively lifting Call (+BC); if Call price < RefPrice, sellers are pressing Call (-SC)
    const cDir = s.callChg > 0 ? 1 : (s.callChg < 0 ? -1 : (s.callBid >= s.callAsk ? 0.3 : -0.3));
    const pDir = s.putChg > 0 ? 1 : (s.putChg < 0 ? -1 : (s.putBid >= s.putAsk ? 0.3 : -0.3));
    totalCallNetForce += Math.round(s.callVol * cDir * 0.35);
    totalPutNetForce += Math.round(s.putVol * pDir * 0.35);
  });

  // Max Pain calculation
  let minPayout = Infinity, maxPainStrike = atmStrike;
  nearStrikes.forEach(cand => {
    const sp = cand.strike;
    let payout = 0;
    nearStrikes.forEach(s => {
      const cW = s.callOi || s.callVol;
      const pW = s.putOi || s.putVol;
      if (sp > s.strike) payout += (sp - s.strike) * cW;
      if (sp < s.strike) payout += (s.strike - sp) * pW;
    });
    if (payout < minPayout) { minPayout = payout; maxPainStrike = sp; }
  });

  nearStrikes.forEach(s => {
    s.isCallWall = s.strike === callWallStrike;
    s.isPutWall = s.strike === putWallStrike;
    s.isMaxPain = s.strike === maxPainStrike;
  });

  return {
    strikes: nearStrikes,
    atmStrike,
    callWallStrike,
    maxCallOi,
    putWallStrike,
    maxPutOi,
    maxPainStrike,
    totalCallOi,
    totalPutOi,
    totalCallNetForce,
    totalPutNetForce,
    calcPcRatio: Math.round((totalPutOi / Math.max(1, totalCallOi)) * 1000) / 10
  };
}

/**
 * Converts TAIFEX getChartData1M 1-minute ticks [Time, Open, High, Low, Close, Vol]
 * into 1m / 5m / 15m K-line bars with real-time VWAP Cost Lines, CP Spread Lines, and Major/Retail Lines!
 */
function buildLiveBarsFromTaifexTicks(rawTicks, timeframeMin, builtChain, statusObj) {
  if (!rawTicks || !rawTicks.length) {
    return generateIntradaySeries(getSessionConfig(), timeframeMin);
  }

  // Group 1-minute ticks into N-minute bars
  const step = Math.max(1, timeframeMin || 5);
  const grouped = [];
  for (let i = 0; i < rawTicks.length; i += step) {
    const chunk = rawTicks.slice(i, i + step);
    if (!chunk.length) continue;
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const tStr = String(last[0] || "").padStart(6, "0");
    const timeLabel = `${tStr.slice(0, 2)}:${tStr.slice(2, 4)}`;
    const open = Number(first[1]);
    let high = -Infinity, low = Infinity, vol = 0;
    chunk.forEach(tk => {
      const h = Number(tk[2]), l = Number(tk[3]), v = Number(tk[5] || 0);
      if (h > high) high = h;
      if (l < low) low = l;
      vol += v;
    });
    const close = Number(last[4]);
    grouped.push({ time: timeLabel, open, high, low, close, vol });
  }

  // Compute cumulative VWAP (Green Mid Cost), Rolling Bull/Bear Costs, and Cumulative CP / Major-Retail curves
  let cumPV = 0, cumV = 0;
  let runningDeltaV = 0;
  const totalBars = grouped.length;
  const finalCallNet = builtChain ? builtChain.totalCallNetForce : 1500;
  const finalPutNet = builtChain ? builtChain.totalPutNetForce : -1200;
  const orderBookMajorBias = (statusObj.bidUnit - statusObj.askUnit) - (statusObj.bidCount - statusObj.askCount) * 1.3;

  // First pass to compute total signed volume delta
  const barSignedVols = grouped.map((b, idx) => {
    const prevC = idx > 0 ? grouped[idx - 1].close : b.open;
    const dP = b.close - prevC;
    const range = Math.max(1, b.high - b.low);
    const closePos = ((b.close - b.low) / range) - 0.5; // -0.5 to +0.5
    return (dP !== 0 ? Math.sign(dP) : Math.sign(closePos)) * b.vol * (0.4 + Math.abs(closePos));
  });

  return grouped.map((b, idx) => {
    const typPrice = (b.high + b.low + b.close) / 3;
    cumPV += typPrice * Math.max(1, b.vol);
    cumV += Math.max(1, b.vol);
    const vwap = Math.round(cumPV / cumV);

    // Rolling window high/low volume-weighted cost bands
    const winStart = Math.max(0, idx - 12);
    const winSlice = grouped.slice(winStart, idx + 1);
    const avgRange = winSlice.reduce((acc, x) => acc + (x.high - x.low), 0) / winSlice.length;
    const redBullCost = Math.round(vwap + (b.close >= vwap ? -avgRange * 0.35 : avgRange * 0.45));
    const blueBearCost = Math.round(vwap - (b.close <= vwap ? -avgRange * 0.35 : avgRange * 0.45));
    const greenMidCost = vwap;

    runningDeltaV += barSignedVols[idx];
    const progress = (idx + 1) / Math.max(1, totalBars);

    // Scale intraday trajectory so the latest bar matches the live Options Chain Call/Put Net Force
    const waveOffset = Math.round(runningDeltaV * 0.45);
    const callVal = Math.round(finalCallNet * progress + waveOffset * 0.5);
    const putVal = Math.round(finalPutNet * progress - waveOffset * 0.5);
    const cpDiffVal = callVal - putVal;

    const majorVal = Math.round(runningDeltaV * 0.65 + orderBookMajorBias * progress);
    const retailVal = Math.round(-majorVal * 0.82);
    const trendVal = Math.round(majorVal - retailVal * 0.55);

    return {
      idx,
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      vol: b.vol,
      callVal,
      putVal,
      cpDiffVal,
      callAction: callVal >= 0 ? "BC (買進買權)" : "SC (賣出買權)",
      putAction: putVal >= 0 ? "BP (買進賣權)" : "SP (賣出賣權)",
      redBullCost,
      blueBearCost,
      greenMidCost,
      majorVal,
      retailVal,
      trendVal
    };
  });
}

function startTaifexAutoPoll() {
  if (TAIFEX_POLL_TIMER) clearInterval(TAIFEX_POLL_TIMER);
  if (CURRENT_SESSION_ID === "LIVE_TAIFEX" && TAIFEX_AUTO_POLL) {
    TAIFEX_POLL_TIMER = setInterval(() => {
      if (CURRENT_SESSION_ID === "LIVE_TAIFEX" && TAIFEX_AUTO_POLL) {
        fetchLiveTaifexData();
      }
    }, 6000);
  }
}

function toggleTaifexAutoPoll() {
  TAIFEX_AUTO_POLL = !TAIFEX_AUTO_POLL;
  if (TAIFEX_AUTO_POLL) {
    fetchLiveTaifexData();
    startTaifexAutoPoll();
  } else if (TAIFEX_POLL_TIMER) {
    clearInterval(TAIFEX_POLL_TIMER);
    TAIFEX_POLL_TIMER = null;
  }
  renderRealtimeTab();
}

function refreshSessionData() {
  if (CURRENT_SESSION_ID === "LIVE_TAIFEX") {
    fetchLiveTaifexData();
    startTaifexAutoPoll();
    return;
  }
  if (TAIFEX_POLL_TIMER) {
    clearInterval(TAIFEX_POLL_TIMER);
    TAIFEX_POLL_TIMER = null;
  }
  const cfg = getSessionConfig();
  ACTIVE_BARS = generateIntradaySeries(cfg, CURRENT_TIMEFRAME);
  ACTIVE_CHAIN = generateStrikeChain(cfg, CURRENT_CUM_DAYS);
  updateTickerBar();
}

function updateTickerBar() {
  const cfg = getSessionConfig();
  const lastBar = ACTIVE_BARS[ACTIVE_BARS.length - 1] || { close: cfg.txfClose, cpDiffVal: 0, callAction: "BC", putAction: "SP" };
  const txfPrice = CURRENT_SESSION_ID === "LIVE_TAIFEX" && TAIFEX_STATUS.txfPrice ? TAIFEX_STATUS.txfPrice : lastBar.close;
  const txfChg = CURRENT_SESSION_ID === "LIVE_TAIFEX" ? TAIFEX_STATUS.txfDiff : (txfPrice - cfg.txfOpen);
  const spread = Math.round(txfPrice - cfg.spotClose);
  const isBull = lastBar.cpDiffVal >= 0;

  const liveBadge = CURRENT_SESSION_ID === "LIVE_TAIFEX"
    ? (TAIFEX_STATUS.connected
        ? `<span class="op-badge badge-sc" style="background:rgba(16,185,129,0.22);color:#34d399;border-color:#10b981">🟢 期交所 MIS 即時連線 (${TAIFEX_STATUS.lastUpdate})</span>`
        : `<span class="op-badge badge-sp">⚠️ 連線期交所中...</span>`)
    : `<span class="op-badge badge-bp">📂 歷史回顧模式</span>`;

  const el = document.getElementById("tickerBarContent");
  if (!el) return;
  el.innerHTML = `
    <div class="ticker-items">
      ${liveBadge}
      <span>合約: <strong>${escapeHtml(cfg.contract)}</strong></span>
      <span>台指期 (${escapeHtml(TAIFEX_STATUS.txfSymbol || 'TXF')}): <strong class="${txfChg >= 0 ? 'up-red' : 'dn-green'}">${fmtNum(txfPrice)} (${txfChg >= 0 ? '▲' : '▼'}${Math.abs(Math.round(txfChg))})</strong></span>
      <span>現貨: <strong>${fmtNum(cfg.spotClose)}</strong></span>
      <span>價差: <strong class="${spread >= 0 ? 'up-red' : 'dn-green'}">${spread >= 0 ? '+' : ''}${spread}</strong></span>
      <span>P/C Ratio: <strong style="color:#fde047">${ACTIVE_CHAIN ? ACTIVE_CHAIN.calcPcRatio : cfg.pcRatio}%</strong></span>
      <span>CP 差額: <strong style="color:${isBull ? '#34d399' : '#f87171'}">${fmtSigned(lastBar.cpDiffVal)} 口</strong></span>
    </div>
    <div>
      <span class="op-badge ${isBull ? 'badge-bc' : 'badge-bp'}">
        🎯 ${isBull ? '多方控盤 (CP差額 > 0)' : '空方控盤 (CP差額 < 0)'}
      </span>
    </div>
  `;
}

// ============================================================================
// Navigation & Zero-Lag Tab Caching
// ============================================================================
const TAB_DIRTY = { realtime: true, strikes: true, replay: true, analysis: true, academy: true };

function markAllTabsDirty() {
  TAB_DIRTY.realtime = true;
  TAB_DIRTY.strikes = true;
  TAB_DIRTY.replay = true;
  TAB_DIRTY.analysis = true;
  // academy is static+interactive, only render once unless clicked
}

function switchView(tabId) {
  if (CURRENT_TAB === tabId && !TAB_DIRTY[tabId]) return;
  CURRENT_TAB = tabId;
  document.querySelectorAll(".tab-view").forEach(v => {
    v.classList.toggle("active", v.id === "tab-" + tabId);
  });
  document.querySelectorAll(".top-nav-btn, .m-nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tabId);
  });

  if (!TAB_DIRTY[tabId]) return;
  TAB_DIRTY[tabId] = false;

  if (tabId === "realtime") renderRealtimeTab();
  else if (tabId === "strikes") renderStrikesTab();
  else if (tabId === "replay") renderReplayTab();
  else if (tabId === "analysis") renderAnalysisTab();
  else if (tabId === "academy") renderAcademyTab();
}

function onSessionChange(newSessionId) {
  CURRENT_SESSION_ID = newSessionId;
  markAllTabsDirty();
  if (newSessionId === "LIVE_TAIFEX") {
    fetchLiveTaifexData();
    startTaifexAutoPoll();
  } else {
    refreshSessionData();
    REPLAY_BARS = generateIntradaySeries(getSessionConfig(), REPLAY_TIMEFRAME);
    REPLAY_STEP = Math.min(REPLAY_BARS.length - 1, Math.max(10, Math.floor(REPLAY_BARS.length * 0.6)));
    TAB_DIRTY[CURRENT_TAB] = true;
    switchView(CURRENT_TAB);
  }
}

// ============================================================================
// Tab 1: 即時籌碼與三種核心線圖 (CP差額圖 / 台指期多空圖 / 主散圖)
// ============================================================================
function renderRealtimeTab() {
  if (!ACTIVE_BARS.length || !ACTIVE_CHAIN) {
    const fallbackCfg = MARKET_SESSIONS[0];
    ACTIVE_BARS = generateIntradaySeries(fallbackCfg, CURRENT_TIMEFRAME);
    ACTIVE_CHAIN = generateStrikeChain(fallbackCfg, CURRENT_CUM_DAYS);
  }
  const cfg = getSessionConfig();
  const lastBar = ACTIVE_BARS[ACTIVE_BARS.length - 1];
  const chain = ACTIVE_CHAIN;
  const container = document.getElementById("tab-realtime");

  const modeDescriptions = {
    cp: {
      title: "1. CP 差額圖（選擇權多空口數總額與 BC/SC/BP/SP 即時判讀）",
      legends: [
        { color: "#10b981", label: "綠線 (CP 差額值)：判斷選擇權籌碼多空口數之總額變化" },
        { color: "#ef4444", label: "紅線 (Call 買權)：零軸之上 = 買進 (BC 看漲)；零軸之下 = 賣出 (SC 看不漲)" },
        { color: "#3b82f6", label: "藍線 (Put 賣權)：零軸之上 = 買進 (BP 看跌)；零軸之下 = 賣出 (SP 看不跌)" }
      ]
    },
    cost: {
      title: "2. 台指期多空成本圖（短多成本 / 短空成本 / 多空分界 VWAP）",
      legends: [
        { color: "#f8fafc", label: "白線 (台指期指數)：當日台指期即時成交連線" },
        { color: "#ef4444", label: "紅線 (多方成本)：多方有量進場時接手，站上短多成本時偏多看" },
        { color: "#3b82f6", label: "藍線 (短空成本)：跌破藍線時偏空看" },
        { color: "#10b981", label: "綠線 (多空成本 VWAP)：線上偏多、線下偏空" }
      ]
    },
    major: {
      title: "3. 主散籌碼對決圖（期交所委買賣大單主力 vs 散戶籌碼動向）",
      legends: [
        { color: "#ef4444", label: "紅線 (主力籌碼)：主力大單積極買進時為正數，反之賣出為負值" },
        { color: "#3b82f6", label: "藍線 (散戶籌碼)：顯示散戶小單反向籌碼動向" },
        { color: "#10b981", label: "綠線 (市場趨勢)：顯示整體市場合力方向" }
      ]
    }
  };

  const curMeta = modeDescriptions[CURRENT_LINE_MODE];

  container.innerHTML = `
    <!-- Top Live TAIFEX Control Bar -->
    <div class="panel-card" style="padding:12px 16px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:0.82rem;color:#38bdf8;font-weight:700">📡 資料來源：</span>
          <select class="select-input" onchange="onSessionChange(this.value)">
            <option value="LIVE_TAIFEX" ${CURRENT_SESSION_ID === 'LIVE_TAIFEX' ? 'selected' : ''}>🟢 臺灣期貨交易所 (TAIFEX MIS) 真實即時連線</option>
            ${MARKET_SESSIONS.map(s => `<option value="${s.id}" ${s.id === CURRENT_SESSION_ID ? 'selected' : ''}>📂 ${escapeHtml(s.label)}</option>`).join("")}
          </select>

          ${CURRENT_SESSION_ID === "LIVE_TAIFEX" ? `
            <select class="select-input" onchange="TAIFEX_MARKET_TYPE=this.value;fetchLiveTaifexData()" title="切換日盤/夜盤">
              <option value="AUTO" ${TAIFEX_MARKET_TYPE === 'AUTO' ? 'selected' : ''}>⚡ 自動判別日/夜盤</option>
              <option value="0" ${TAIFEX_MARKET_TYPE === '0' ? 'selected' : ''}>☀️ 日盤 (08:45~13:45)</option>
              <option value="1" ${TAIFEX_MARKET_TYPE === '1' ? 'selected' : ''}>🌙 夜盤 (15:00~05:00)</option>
            </select>
            ${TAIFEX_AVAILABLE_MONTHS.length ? `
              <select class="select-input" onchange="TAIFEX_EXPIRE_MONTH=this.value;fetchLiveTaifexData()" title="切換選擇權週別/月份">
                ${TAIFEX_AVAILABLE_MONTHS.map(m => `<option value="${m}" ${m === TAIFEX_EXPIRE_MONTH ? 'selected' : ''}>合約：${m}</option>`).join("")}
              </select>
            ` : ''}
          ` : ''}
        </div>

        <div class="btn-group">
          <button class="btn ${CURRENT_TIMEFRAME === 1 ? 'active' : ''}" onclick="CURRENT_TIMEFRAME=1;refreshSessionData()">1分線</button>
          <button class="btn ${CURRENT_TIMEFRAME === 5 ? 'active' : ''}" onclick="CURRENT_TIMEFRAME=5;refreshSessionData()">5分線</button>
          <button class="btn ${CURRENT_TIMEFRAME === 15 ? 'active' : ''}" onclick="CURRENT_TIMEFRAME=15;refreshSessionData()">15分線</button>
          ${CURRENT_SESSION_ID === "LIVE_TAIFEX" ? `
            <button class="btn ${TAIFEX_AUTO_POLL ? 'btn-teal' : ''}" onclick="toggleTaifexAutoPoll()">
              ${TAIFEX_AUTO_POLL ? '🟢 每 6 秒自動同步期交所 (點擊暫停)' : '⏸️ 已暫停同步 (點擊恢復)'}
            </button>
            <button class="btn btn-primary" onclick="fetchLiveTaifexData()">🔄 立即刷新</button>
          ` : ''}
        </div>
      </div>
    </div>

    <!-- 5 Core Chip KPI Cards -->
    <div class="kpi-grid">
      <div class="kpi-card cp-card">
        <div class="kpi-label"><span>🟢 CP 差額值 (多空總額)</span><span class="op-badge ${lastBar.cpDiffVal >= 0 ? 'badge-bc' : 'badge-bp'}">${lastBar.cpDiffVal >= 0 ? '偏多格局' : '偏空格局'}</span></div>
        <div class="kpi-val" style="color:${lastBar.cpDiffVal >= 0 ? '#34d399' : '#f87171'}">${fmtSigned(lastBar.cpDiffVal)} <span style="font-size:0.85rem">口</span></div>
        <div class="kpi-sub">Call: <strong style="color:#f87171">${fmtSigned(lastBar.callVal)}</strong> | Put: <strong style="color:#60a5fa">${fmtSigned(lastBar.putVal)}</strong></div>
      </div>

      <div class="kpi-card call-wall">
        <div class="kpi-label"><span>🔴 Call 買權主力狀態</span><span class="op-badge ${lastBar.callVal >= 0 ? 'badge-bc' : 'badge-sc'}">${lastBar.callVal >= 0 ? 'BC 買進買權' : 'SC 賣出買權'}</span></div>
        <div class="kpi-val" style="color:#f87171">${fmtNum(chain.callWallStrike)} <span style="font-size:0.82rem;color:var(--muted)">最大壓力</span></div>
        <div class="kpi-sub">天花板量能: <strong>${fmtNum(chain.maxCallOi)} 口</strong> (零軸${lastBar.callVal >= 0 ? '之上看漲' : '之下看不漲'})</div>
      </div>

      <div class="kpi-card put-wall">
        <div class="kpi-label"><span>🔵 Put 賣權主力狀態</span><span class="op-badge ${lastBar.putVal >= 0 ? 'badge-bp' : 'badge-sp'}">${lastBar.putVal >= 0 ? 'BP 買進賣權' : 'SP 賣出賣權'}</span></div>
        <div class="kpi-val" style="color:#60a5fa">${fmtNum(chain.putWallStrike)} <span style="font-size:0.82rem;color:var(--muted)">最大支撐</span></div>
        <div class="kpi-sub">地板量能: <strong>${fmtNum(chain.maxPutOi)} 口</strong> (零軸${lastBar.putVal >= 0 ? '之上看跌' : '之下看不跌'})</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label"><span>🎯 莊家最大痛點 (Max Pain)</span><span style="color:#fde047;font-weight:700">結算收斂區</span></div>
        <div class="kpi-val" style="color:#fde047">${fmtNum(chain.maxPainStrike)} <span style="font-size:0.82rem;color:var(--muted)">點</span></div>
        <div class="kpi-sub">莊家防守區間：<strong>${fmtNum(Math.min(chain.putWallStrike, chain.callWallStrike))} ~ ${fmtNum(Math.max(chain.putWallStrike, chain.callWallStrike))}</strong></div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label"><span>🌡️ 期交所委買賣大單力道</span><span style="color:#38bdf8;font-weight:700">P/C ${chain.calcPcRatio}%</span></div>
        <div class="kpi-val" style="color:${lastBar.majorVal >= 0 ? '#f87171' : '#4ade80'}">${fmtSigned(lastBar.majorVal)}</div>
        <div class="kpi-sub">委買: <strong>${fmtNum(TAIFEX_STATUS.bidUnit || 49075)}口</strong> | 委賣: <strong>${fmtNum(TAIFEX_STATUS.askUnit || 48874)}口</strong></div>
      </div>
    </div>

    ${buildChipAdviceHtml(lastBar, chain)}

    <!-- Main 3-Mode Chip Line Chart (op-win.com core feature) -->
    <div class="panel-card">
      <div class="panel-header">
        <div>
          <h2 class="section-h2">${escapeHtml(curMeta.title)}</h2>
          <div style="font-size:0.77rem;color:var(--muted);margin-top:3px">💡 滑鼠移至線圖或手機觸控滑動，可檢視任一時間點的三線數值與主力 BC / SC / BP / SP 狀態</div>
        </div>
        <div class="btn-group">
          <button class="btn ${CURRENT_LINE_MODE === 'cp' ? 'active' : ''}" onclick="CURRENT_LINE_MODE='cp';renderRealtimeTab()">1. CP 差額圖</button>
          <button class="btn ${CURRENT_LINE_MODE === 'cost' ? 'active' : ''}" onclick="CURRENT_LINE_MODE='cost';renderRealtimeTab()">2. 台指期多空圖</button>
          <button class="btn ${CURRENT_LINE_MODE === 'major' ? 'active' : ''}" onclick="CURRENT_LINE_MODE='major';renderRealtimeTab()">3. 主散圖</button>
        </div>
      </div>

      <div class="chart-wrap">
        <canvas id="realtimeChipCanvas" width="1120" height="340"></canvas>
      </div>

      <div class="chart-legend-bar">
        ${curMeta.legends.map(lg => `
          <div class="legend-item">
            <span class="legend-dot" style="background:${lg.color}"></span>
            <span>${escapeHtml(lg.label)}</span>
          </div>
        `).join("")}
      </div>
    </div>

    <!-- Quick Preview of Support/Resistance OI Walls -->
    <div class="panel-card">
      <div class="panel-header">
        <h2 class="section-h2">各履約價支撐壓力分佈預覽 (Call 壓力天花板 vs Put 支撐地板)</h2>
        <button class="btn btn-primary" onclick="switchView('strikes')">進入完整 T 字籌碼報價表 (點擊價位看期交所即時 1 分量價曲線) ➔</button>
      </div>
      <div class="chart-wrap">
        <canvas id="oiWallPreviewCanvas" width="1120" height="230"></canvas>
      </div>
    </div>
  `;

  drawThreeLineChipChart("realtimeChipCanvas", ACTIVE_BARS, CURRENT_LINE_MODE);
  drawOiWallChart("oiWallPreviewCanvas", ACTIVE_CHAIN);
}

// ============================================================================
// Canvas Renderer 1: op-win.com 3-Mode Chip Line Chart
// ============================================================================
function drawThreeLineChipChart(canvasId, bars, mode, maxIdx = null) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !bars || !bars.length) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const sliceBars = maxIdx !== null ? bars.slice(0, maxIdx + 1) : bars;
  if (!sliceBars.length) return;

  const padL = 68, padR = 64, padT = 20, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  let seriesList = [];
  let showZeroAxis = true;

  if (mode === "cp") {
    seriesList = [
      { key: "cpDiffVal", name: "綠線 (CP差額)", color: "#10b981", width: 2.8, fill: "rgba(16, 185, 129, 0.12)" },
      { key: "callVal",   name: "紅線 (Call買權)", color: "#ef4444", width: 2.0 },
      { key: "putVal",    name: "藍線 (Put賣權)",  color: "#3b82f6", width: 2.0 }
    ];
  } else if (mode === "cost") {
    showZeroAxis = false;
    seriesList = [
      { key: "close",        name: "台指期價格",     color: "#f8fafc", width: 2.4 },
      { key: "redBullCost",  name: "紅線 (多方成本)", color: "#ef4444", width: 2.0 },
      { key: "greenMidCost", name: "綠線 (多空成本)", color: "#10b981", width: 2.2 },
      { key: "blueBearCost", name: "藍線 (短空成本)", color: "#3b82f6", width: 2.0 }
    ];
  } else {
    seriesList = [
      { key: "trendVal",  name: "綠線 (市場趨勢)", color: "#10b981", width: 2.6, fill: "rgba(16, 185, 129, 0.1)" },
      { key: "majorVal",  name: "紅線 (主力籌碼)", color: "#ef4444", width: 2.2 },
      { key: "retailVal", name: "藍線 (散戶籌碼)", color: "#3b82f6", width: 2.0 }
    ];
  }

  let allVals = [];
  seriesList.forEach(s => {
    sliceBars.forEach(b => allVals.push(b[s.key]));
  });
  if (showZeroAxis) allVals.push(0);

  let minV = Math.min(...allVals);
  let maxV = Math.max(...allVals);
  if (showZeroAxis) {
    const absMax = Math.max(Math.abs(minV), Math.abs(maxV), 200);
    minV = -absMax * 1.12;
    maxV = absMax * 1.12;
  } else {
    const pad = Math.max(15, (maxV - minV) * 0.15);
    minV -= pad;
    maxV += pad;
  }
  const spanV = Math.max(1, maxV - minV);

  const xOf = idx => padL + (idx / Math.max(1, bars.length - 1)) * plotW;
  const yOf = val => padT + plotH - ((val - minV) / spanV) * plotH;

  ctx.font = "11px Consolas, monospace";
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i / 4);
    const v = Math.round(maxV - (spanV * i / 4));
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "right";
    ctx.fillText(showZeroAxis ? fmtSigned(v) : fmtNum(v), padL - 8, y + 4);
  }

  if (showZeroAxis) {
    const yZero = yOf(0);
    ctx.save();
    ctx.strokeStyle = "rgba(250, 204, 21, 0.65)";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(padL, yZero); ctx.lineTo(padL + plotW, yZero); ctx.stroke();
    ctx.fillStyle = "#fde047";
    ctx.textAlign = "left";
    ctx.fillText("零軸 (0) ▲買方(BC/BP) / ▼賣方(SC/SP)", padL + 8, yZero - 6);
    ctx.restore();
  }

  seriesList.forEach(s => {
    if (s.fill && sliceBars.length > 1) {
      const yBase = showZeroAxis ? yOf(0) : (padT + plotH);
      ctx.beginPath();
      ctx.moveTo(xOf(0), yBase);
      sliceBars.forEach((b, idx) => ctx.lineTo(xOf(idx), yOf(b[s.key])));
      ctx.lineTo(xOf(sliceBars.length - 1), yBase);
      ctx.closePath();
      ctx.fillStyle = s.fill;
      ctx.fill();
    }
    ctx.beginPath();
    sliceBars.forEach((b, idx) => {
      const cx = xOf(idx), cy = yOf(b[s.key]);
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.stroke();

    const lastB = sliceBars[sliceBars.length - 1];
    const lastY = yOf(lastB[s.key]);
    ctx.fillStyle = s.color;
    ctx.textAlign = "left";
    ctx.fillText(showZeroAxis ? fmtSigned(lastB[s.key]) : fmtNum(lastB[s.key]), padL + plotW + 6, lastY + 4);
  });

  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  const tickCount = 6;
  for (let i = 0; i <= tickCount; i++) {
    const bIdx = Math.min(bars.length - 1, Math.round((bars.length - 1) * i / tickCount));
    ctx.fillText(bars[bIdx].time, xOf(bIdx), H - 8);
  }

  const tooltip = document.getElementById("chartTooltip");
  canvas.onmousemove = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const cx = ((evt.clientX - rect.left) / rect.width) * W;
    if (cx < padL || cx > padL + plotW) {
      if (tooltip) tooltip.style.display = "none";
      return;
    }
    const ratio = (cx - padL) / plotW;
    const idx = Math.min(sliceBars.length - 1, Math.max(0, Math.round(ratio * (bars.length - 1))));
    const b = sliceBars[idx];
    if (!b || !tooltip) return;

    let rowsHtml = `<div style="color:#fde047;font-weight:800;border-bottom:1px solid #334155;padding-bottom:3px;margin-bottom:4px">🕒 時間：${b.time} | 台指期：${fmtNum(b.close)} (量 ${b.vol})</div>`;
    if (mode === "cp") {
      rowsHtml += `
        <div><span style="color:#10b981">■ 綠線 (CP 差額值)：</span><strong>${fmtSigned(b.cpDiffVal)} 口</strong></div>
        <div><span style="color:#ef4444">■ 紅線 (Call 買權)：</span><strong>${fmtSigned(b.callVal)}</strong> (${b.callAction})</div>
        <div><span style="color:#3b82f6">■ 藍線 (Put 賣權)：</span><strong>${fmtSigned(b.putVal)}</strong> (${b.putAction})</div>
      `;
    } else if (mode === "cost") {
      rowsHtml += `
        <div><span style="color:#ef4444">■ 紅線 (多方成本)：</span><strong>${fmtNum(b.redBullCost)}</strong></div>
        <div><span style="color:#10b981">■ 綠線 (多空分界 VWAP)：</span><strong>${fmtNum(b.greenMidCost)}</strong> (${b.close >= b.greenMidCost ? '線上偏多' : '線下偏空'})</div>
        <div><span style="color:#3b82f6">■ 藍線 (短空成本)：</span><strong>${fmtNum(b.blueBearCost)}</strong></div>
      `;
    } else {
      rowsHtml += `
        <div><span style="color:#ef4444">■ 紅線 (主力籌碼)：</span><strong>${fmtSigned(b.majorVal)}</strong></div>
        <div><span style="color:#3b82f6">■ 藍線 (散戶籌碼)：</span><strong>${fmtSigned(b.retailVal)}</strong></div>
        <div><span style="color:#10b981">■ 綠線 (市場趨勢)：</span><strong>${fmtSigned(b.trendVal)}</strong></div>
      `;
    }
    tooltip.innerHTML = rowsHtml;
    tooltip.style.display = "block";
    tooltip.style.left = Math.min(window.innerWidth - 260, evt.clientX + 14) + "px";
    tooltip.style.top = Math.min(window.innerHeight - 130, evt.clientY + 14) + "px";
  };
  canvas.onmouseleave = () => {
    if (tooltip) tooltip.style.display = "none";
  };
}

// ============================================================================
// Canvas Renderer 2: Call / Put OI Support & Resistance Bar Chart
// ============================================================================
function drawOiWallChart(canvasId, chain) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !chain || !chain.strikes.length) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const strikes = chain.strikes;
  const padL = 58, padR = 30, padT = 24, padB = 32;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const valOfC = s => s.callOi > 0 ? s.callOi : s.callVol;
  const valOfP = s => s.putOi > 0 ? s.putOi : s.putVol;
  const maxOi = Math.max(...strikes.map(s => Math.max(valOfC(s), valOfP(s))), 100);

  ctx.font = "11px Consolas, monospace";
  for (let i = 0; i <= 3; i++) {
    const y = padT + (plotH * i / 3);
    const val = Math.round(maxOi * (1 - i / 3));
    ctx.strokeStyle = "#1e293b";
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "right";
    ctx.fillText(fmtNum(val), padL - 6, y + 4);
  }

  const groupW = plotW / strikes.length;
  const barW = Math.max(5, (groupW - 8) / 2);

  strikes.forEach((s, idx) => {
    const gx = padL + idx * groupW + 4;
    const ch = (valOfC(s) / maxOi) * plotH;
    const ph = (valOfP(s) / maxOi) * plotH;

    ctx.fillStyle = s.isCallWall ? "#ef4444" : "rgba(239, 68, 68, 0.72)";
    ctx.fillRect(gx, padT + plotH - ch, barW, ch);

    ctx.fillStyle = s.isPutWall ? "#3b82f6" : "rgba(59, 130, 246, 0.72)";
    ctx.fillRect(gx + barW + 2, padT + plotH - ph, barW, ph);

    if (strikes.length <= 20 || idx % 2 === 0 || s.isCallWall || s.isPutWall || s.isAtm) {
      ctx.fillStyle = s.isAtm ? "#fde047" : (s.isCallWall ? "#fca5a5" : (s.isPutWall ? "#93c5fd" : "#94a3b8"));
      ctx.textAlign = "center";
      ctx.fillText(String(s.strike), gx + barW, H - 10);
    }

    if (s.isCallWall) {
      ctx.fillStyle = "#fca5a5";
      ctx.fillText("壓力天花板", gx + barW, padT + plotH - ch - 5);
    } else if (s.isPutWall) {
      ctx.fillStyle = "#93c5fd";
      ctx.fillText("支撐地板", gx + barW, padT + plotH - ph - 5);
    }
  });
}

// ============================================================================
// Dynamic Real-Time Chip Strategy Advice Engine
// ============================================================================
function buildChipAdviceHtml(lastBar, chain) {
  if (!lastBar || !chain) return "";
  const cp = lastBar.cpDiffVal;
  const cVal = lastBar.callVal;
  const pVal = lastBar.putVal;
  const price = lastBar.close;
  const vwap = lastBar.greenMidCost;
  const bullCost = lastBar.redBullCost;
  const bearCost = lastBar.blueBearCost;
  const callWall = chain.callWallStrike;
  const putWall = chain.putWallStrike;
  const maxPain = chain.maxPainStrike;

  let postureTitle = "";
  let postureBadge = "";
  let buyerAdvice = "";
  let sellerAdvice = "";
  let riskNote = "";

  if (cVal >= 0 && pVal < 0) {
    postureTitle = "🚀 主力強偏多（買權買進 BC ＋ 賣權賣出 SP）";
    postureBadge = `<span class="op-badge badge-bc">多方攻擊格局</span>`;
    buyerAdvice = `順勢偏多：指數 ${price >= vwap ? '站穩' : '若站回'}多空成本綠線 (${fmtNum(vwap)}) 且紅線維持正值，可採 <strong>BC (買進價平/價外一檔 Call)</strong> 或期指順勢做多。`;
    sellerAdvice = `穩健收租：下檔 <strong>${fmtNum(putWall)}</strong> 具大量 Put 支撐，可於 ${fmtNum(putWall)} 下方建立 <strong>SP (賣出賣權)</strong> 或牛市看漲價差。`;
    riskNote = `⚠️ 停損參考：若 CP 差額急縮或跌破短多成本紅線 (${fmtNum(bullCost)})，多單應減碼獲利。`;
  } else if (cVal < 0 && pVal >= 0) {
    postureTitle = "🐻 主力偏空防守（賣權買進 BP ＋ 買權賣出 SC）";
    postureBadge = `<span class="op-badge badge-bp">空方主導格局</span>`;
    buyerAdvice = `避險/偏空：目前指數 (${fmtNum(price)}) ${price <= vwap ? '壓在多空分界綠線 (' + fmtNum(vwap) + ') 之下' : '高檔承壓'}，反彈不過短空成本藍線 (${fmtNum(bearCost)}) 時，可採 <strong>BP (買進賣權)</strong> 或空單避險。`;
    sellerAdvice = `上檔壓力：<strong>${fmtNum(callWall)}</strong> 為最大 Call 壓力天花板，適合在 ${fmtNum(callWall)} 上方佈局 <strong>SC (賣出買權)</strong> 或熊市看跌價差。`;
    riskNote = `⚠️ 反轉警訊：下檔留意 <strong>${fmtNum(putWall)}</strong> 地板支撐；若反彈站回綠線 (${fmtNum(vwap)}) 且藍線 Put 轉負，空單須立即停利。`;
  } else if (cVal < 0 && pVal < 0) {
    postureTitle = "⚖️ 莊家區間雙賣收租（買權賣出 SC ＋ 賣權賣出 SP）";
    postureBadge = `<span class="op-badge badge-sc">區間盤整收斂</span>`;
    buyerAdvice = `買方觀望：雙邊時間價值快速流失，不建議追高買 BC 或殺低買 BP，等待突破 <strong>${fmtNum(putWall)} ~ ${fmtNum(callWall)}</strong> 區間再順勢跟進。`;
    sellerAdvice = `賣方雙收：莊家鎖定最大痛點 <strong>${fmtNum(maxPain)}</strong> 附近，可在壓力 ${fmtNum(callWall)} 之上 SC ＋ 支撐 ${fmtNum(putWall)} 之下 SP（鐵兀鷹策略）。`;
    riskNote = `⚠️ 風控提示：若盤中出現單邊帶量突破並導致紅/藍線翻正 (> 0)，賣方需嚴格對鎖停損。`;
  } else {
    postureTitle = "⚡ 多空雙買震盪（BC 與 BP 同時放大・波動率上升）";
    postureBadge = `<span class="op-badge badge-sp">高波動變盤前夕</span>`;
    buyerAdvice = `順勢突破：市場避險與追價情緒同步升溫，建議以 <strong>${fmtNum(vwap)} (VWAP 綠線)</strong> 為多空分界，站穩偏多、跌破偏空，嚴設停損不凹單。`;
    sellerAdvice = `賣方減碼：雙買格局容易出現急漲急跌掃停損，賣方部位建議縮小口數或改用垂直價差鎖住最大風險。`;
    riskNote = `⚠️ 關鍵點位：觀察指數往 ${fmtNum(callWall)} (壓力) 或 ${fmtNum(putWall)} (支撐) 哪一側率先表態。`;
  }

  return `
    <div class="advice-card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div style="font-size:0.98rem;font-weight:800;color:#fff">💡 目前籌碼實戰操作建議：${escapeHtml(postureTitle)}</div>
        ${postureBadge}
      </div>
      <div class="advice-grid">
        <div class="advice-item">
          <div style="color:#38bdf8;font-weight:700;margin-bottom:3px">1. 買方 / 期指順勢建議</div>
          <div style="color:#e2e8f0">${buyerAdvice}</div>
        </div>
        <div class="advice-item">
          <div style="color:#fbbf24;font-weight:700;margin-bottom:3px">2. 賣方 / 區間策略建議</div>
          <div style="color:#e2e8f0">${sellerAdvice}</div>
        </div>
        <div class="advice-item">
          <div style="color:#34d399;font-weight:700;margin-bottom:3px">3. 關鍵防守點位與風控</div>
          <div style="color:#e2e8f0">${riskNote}<br><span style="color:var(--muted);font-size:0.74rem">壓力 ${fmtNum(callWall)} ｜ 痛點 ${fmtNum(maxPain)} ｜ 支撐 ${fmtNum(putWall)}</span></div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Tab 2: 選擇權籌碼 T 字報價表 & 點擊價位即時載入期交所 1 分鐘量價曲線
// ============================================================================
function renderStrikesTab() {
  const chain = ACTIVE_CHAIN;
  const lastBar = ACTIVE_BARS[ACTIVE_BARS.length - 1];
  const container = document.getElementById("tab-strikes");
  const maxOi = Math.max(chain.maxCallOi, chain.maxPutOi, 1);
  const useMobileCards = STRIKE_VIEW_MODE === "mobile" || (STRIKE_VIEW_MODE === "auto" && window.innerWidth <= 860);

  const mobileListHtml = `
    <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--muted);padding:0 6px 6px">
      <span style="color:#fca5a5;font-weight:700">◀ 🔴 CALL 買權 (價格/量/主力)</span>
      <span style="color:#fde047;font-weight:700">履約價 (點擊看曲線)</span>
      <span style="color:#93c5fd;font-weight:700">🔵 PUT 賣權 (價格/量/主力) ▶</span>
    </div>
    <div class="t-mobile-list">
      ${chain.strikes.map((s, idx) => {
        const cVal = s.callOi > 0 ? s.callOi : s.callVol;
        const pVal = s.putOi > 0 ? s.putOi : s.putVol;
        const cPct = Math.min(100, Math.round((cVal / maxOi) * 100));
        const pPct = Math.min(100, Math.round((pVal / maxOi) * 100));
        const cardCls = [
          "t-m-card",
          s.isAtm ? "atm-card" : "",
          s.isCallWall ? "call-wall-card" : "",
          s.isPutWall ? "put-wall-card" : ""
        ].filter(Boolean).join(" ");

        let tag = "";
        if (s.isCallWall) tag = `<div style="font-size:0.65rem;color:#fca5a5;font-weight:700">🚨壓力頂</div>`;
        else if (s.isPutWall) tag = `<div style="font-size:0.65rem;color:#93c5fd;font-weight:700">🛡️支撐底</div>`;
        else if (s.isAtm) tag = `<div style="font-size:0.65rem;color:#fde047;font-weight:700">⚡價平區</div>`;
        else if (s.isMaxPain) tag = `<div style="font-size:0.65rem;color:#34d399;font-weight:700">🎯痛點</div>`;

        return `
          <div class="${cardCls}" onclick="openStrikeModal(${idx})">
            <div class="t-m-grid">
              <div class="t-m-side call">
                <div>
                  <strong style="font-size:0.95rem;color:#fff">${s.callPrice.toFixed(1)}</strong>
                  <span class="${s.callChg >= 0 ? 'up-red' : 'dn-green'}" style="font-size:0.72rem">(${s.callChg >= 0 ? '+' : ''}${s.callChg.toFixed(1)})</span>
                </div>
                <div style="font-size:0.72rem;color:var(--muted)">量 ${fmtNum(s.callVol)} ｜ OI ${fmtNum(s.callOi)}</div>
                <span class="op-badge ${s.callAction === 'BC' ? 'badge-bc' : 'badge-sc'}">${s.callAction} ${s.callAction === 'BC' ? '買買權' : '賣買權'}</span>
              </div>

              <div class="t-m-center">
                <div style="font-size:0.94rem;font-weight:800;color:#fde047">${fmtNum(s.strike)}</div>
                ${tag || `<div style="font-size:0.65rem;color:var(--muted)">點看曲線</div>`}
              </div>

              <div class="t-m-side put">
                <div>
                  <span class="${s.putChg >= 0 ? 'up-red' : 'dn-green'}" style="font-size:0.72rem">(${s.putChg >= 0 ? '+' : ''}${s.putChg.toFixed(1)})</span>
                  <strong style="font-size:0.95rem;color:#fff">${s.putPrice.toFixed(1)}</strong>
                </div>
                <div style="font-size:0.72rem;color:var(--muted)">量 ${fmtNum(s.putVol)} ｜ OI ${fmtNum(s.putOi)}</div>
                <span class="op-badge ${s.putAction === 'BP' ? 'badge-bp' : 'badge-sp'}">${s.putAction} ${s.putAction === 'BP' ? '買賣權' : '賣賣權'}</span>
              </div>
            </div>
            <div class="t-m-bars">
              <div class="t-m-bar-track call"><div class="oi-bar-call" style="width:${cPct}%"></div></div>
              <div class="t-m-bar-track put"><div class="oi-bar-put" style="width:${pPct}%"></div></div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  const desktopTableHtml = `
    <div class="table-scroll">
      <table class="t-table">
        <thead>
          <tr>
            <th colspan="6" class="call-head">🔴 CALL 買權（看漲 / 賣方SC為上檔壓力天花板）</th>
            <th class="strike-col">履約價<br>(點擊看曲線)</th>
            <th colspan="6" class="put-head">🔵 PUT 賣權（看跌 / 賣方SP為下檔支撐地板）</th>
          </tr>
          <tr>
            <th>主力判定</th>
            <th>籌碼分佈</th>
            <th>未平倉 (OI)</th>
            <th>預估增減</th>
            <th>即時成交量</th>
            <th>最新價 (漲跌)</th>
            <th class="strike-col">Strike</th>
            <th>最新價 (漲跌)</th>
            <th>即時成交量</th>
            <th>預估增減</th>
            <th>未平倉 (OI)</th>
            <th>籌碼分佈</th>
            <th>主力判定</th>
          </tr>
        </thead>
        <tbody>
          ${chain.strikes.map((s, idx) => {
            const cVal = s.callOi > 0 ? s.callOi : s.callVol;
            const pVal = s.putOi > 0 ? s.putOi : s.putVol;
            const cPct = Math.min(100, Math.round((cVal / maxOi) * 100));
            const pPct = Math.min(100, Math.round((pVal / maxOi) * 100));
            const rowCls = [
              "strike-row",
              s.isAtm ? "atm-row" : "",
              s.isCallWall ? "call-wall-row" : "",
              s.isPutWall ? "put-wall-row" : ""
            ].filter(Boolean).join(" ");

            let strikeTag = "";
            if (s.isCallWall) strikeTag = `<div style="font-size:0.68rem;color:#fca5a5">🚨 最大壓力天花板</div>`;
            else if (s.isPutWall) strikeTag = `<div style="font-size:0.68rem;color:#93c5fd">🛡️ 最大支撐地板</div>`;
            else if (s.isAtm) strikeTag = `<div style="font-size:0.68rem;color:#fde047">⚡ 價平核心區</div>`;
            else if (s.isMaxPain) strikeTag = `<div style="font-size:0.68rem;color:#34d399">🎯 莊家最大痛點</div>`;

            return `
              <tr class="${rowCls}" onclick="openStrikeModal(${idx})" title="點擊查看 ${s.strike} 履約價當日分時量價曲線">
                <td><span class="op-badge ${s.callAction === 'BC' ? 'badge-bc' : 'badge-sc'}">${s.callAction === 'BC' ? 'BC 買進買權' : 'SC 賣出買權'}</span></td>
                <td><div class="oi-bar-wrap"><div class="oi-bar-call" style="width:${cPct}%"></div></div></td>
                <td style="font-weight:700;color:#f8fafc">${fmtNum(s.callOi)}</td>
                <td class="${s.callOiDelta >= 0 ? 'up-red' : 'dn-green'}">${fmtSigned(s.callOiDelta)}</td>
                <td style="color:#e2e8f0;font-weight:600">${fmtNum(s.callVol)}</td>
                <td><strong>${s.callPrice.toFixed(1)}</strong> <span class="${s.callChg >= 0 ? 'up-red' : 'dn-green'}" style="font-size:0.74rem">(${s.callChg >= 0 ? '+' : ''}${s.callChg.toFixed(1)})</span></td>
                <td class="strike-col">
                  <div style="font-size:0.95rem">📈 ${fmtNum(s.strike)}</div>
                  ${strikeTag}
                </td>
                <td><strong>${s.putPrice.toFixed(1)}</strong> <span class="${s.putChg >= 0 ? 'up-red' : 'dn-green'}" style="font-size:0.74rem">(${s.putChg >= 0 ? '+' : ''}${s.putChg.toFixed(1)})</span></td>
                <td style="color:#e2e8f0;font-weight:600">${fmtNum(s.putVol)}</td>
                <td class="${s.putOiDelta >= 0 ? 'up-red' : 'dn-green'}">${fmtSigned(s.putOiDelta)}</td>
                <td style="font-weight:700;color:#f8fafc">${fmtNum(s.putOi)}</td>
                <td><div class="oi-bar-wrap"><div class="oi-bar-put" style="width:${pPct}%"></div></div></td>
                <td><span class="op-badge ${s.putAction === 'BP' ? 'badge-bp' : 'badge-sp'}">${s.putAction === 'BP' ? 'BP 買進賣權' : 'SP 賣出賣權'}</span></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = `
    ${buildChipAdviceHtml(lastBar, chain)}

    <div class="panel-card">
      <div class="panel-header">
        <div>
          <h2 class="section-h2">選擇權 T 字籌碼支撐壓力佈局表（點擊任一履約價看即時曲線）</h2>
          <div style="font-size:0.78rem;color:var(--muted);margin-top:3px">
            💡 手機版自動切換為「零左右滑動 T 字卡片」；點擊任一價位即可查看期交所 1 分鐘量價曲線！
          </div>
        </div>
        <div class="btn-group">
          <button class="btn ${useMobileCards ? 'active' : ''}" onclick="STRIKE_VIEW_MODE='mobile';renderStrikesTab()">📱 精簡手機版 (免左右滑)</button>
          <button class="btn ${!useMobileCards ? 'active' : ''}" onclick="STRIKE_VIEW_MODE='desktop';renderStrikesTab()">💻 完整電腦表格</button>
          ${CURRENT_SESSION_ID === "LIVE_TAIFEX" && TAIFEX_AVAILABLE_MONTHS.length ? `
            <select class="select-input" onchange="TAIFEX_EXPIRE_MONTH=this.value;fetchLiveTaifexData()">
              ${TAIFEX_AVAILABLE_MONTHS.map(m => `<option value="${m}" ${m === TAIFEX_EXPIRE_MONTH ? 'selected' : ''}>合約：${m}</option>`).join("")}
            </select>
            <button class="btn btn-primary" onclick="fetchLiveTaifexData()">🔄 同步</button>
          ` : `
            <button class="btn ${CURRENT_CUM_DAYS === 1 ? 'active' : ''}" onclick="CURRENT_CUM_DAYS=1;refreshSessionData();renderStrikesTab()">1日</button>
            <button class="btn ${CURRENT_CUM_DAYS === 3 ? 'active' : ''}" onclick="CURRENT_CUM_DAYS=3;refreshSessionData();renderStrikesTab()">3日</button>
            <button class="btn ${CURRENT_CUM_DAYS === 5 ? 'active' : ''}" onclick="CURRENT_CUM_DAYS=5;refreshSessionData();renderStrikesTab()">5日</button>
          `}
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding:10px 14px;background:#090e1a;border-radius:10px;font-size:0.8rem">
        <div>🔴 <strong>壓力天花板：</strong><span style="color:#f87171;font-weight:800">${fmtNum(chain.callWallStrike)}</span> (${fmtNum(chain.maxCallOi)}口)</div>
        <div>🎯 <strong>最大痛點：</strong><span style="color:#fde047;font-weight:800">${fmtNum(chain.maxPainStrike)}</span></div>
        <div>🔵 <strong>支撐地板：</strong><span style="color:#60a5fa;font-weight:800">${fmtNum(chain.putWallStrike)}</span> (${fmtNum(chain.maxPutOi)}口)</div>
        <div>📊 <strong>P/C Ratio：</strong><span style="color:#34d399;font-weight:800">${chain.calcPcRatio}%</span></div>
      </div>

      ${useMobileCards ? mobileListHtml : desktopTableHtml}
    </div>

    <!-- Three Major Institutional Investors Table -->
    <div class="panel-card">
      <div class="panel-header">
        <h2 class="section-h2">三大法人選擇權買賣方籌碼結構（看懂「契約價值」與口數佈局）</h2>
      </div>
      <div class="table-scroll">
        <table class="t-table">
          <thead>
            <tr>
              <th style="text-align:left">法人身份</th>
              <th>BC 買進買權 (看大漲)</th>
              <th>SC 賣出買權 (看不漲)</th>
              <th>BP 買進賣權 (看大跌)</th>
              <th>SP 賣出賣權 (看不跌)</th>
              <th style="text-align:left">主力籌碼多空總結</th>
            </tr>
          </thead>
          <tbody>
            ${INSTITUTIONAL_CHIPS.map(inst => `
              <tr>
                <td style="text-align:left">
                  <strong style="color:#fff">${escapeHtml(inst.actor)}</strong>
                  <div style="font-size:0.73rem;color:var(--muted)">${escapeHtml(inst.roleNote)}</div>
                </td>
                <td><strong class="up-red">${fmtNum(inst.bcLots)} 口</strong><div style="font-size:0.73rem;color:var(--muted)">${fmtNum(inst.bcAmtM)} 百萬</div></td>
                <td><strong class="dn-green">${fmtNum(inst.scLots)} 口</strong><div style="font-size:0.73rem;color:var(--muted)">${fmtNum(inst.scAmtM)} 百萬</div></td>
                <td><strong class="put-blue">${fmtNum(inst.bpLots)} 口</strong><div style="font-size:0.73rem;color:var(--muted)">${fmtNum(inst.bpAmtM)} 百萬</div></td>
                <td><strong style="color:#fbbf24">${fmtNum(inst.spLots)} 口</strong><div style="font-size:0.73rem;color:var(--muted)">${fmtNum(inst.spAmtM)} 百萬</div></td>
                <td style="text-align:left;color:#e2e8f0;font-size:0.8rem">${escapeHtml(inst.verdict)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function openStrikeModal(strikeIdx) {
  const s = ACTIVE_CHAIN.strikes[strikeIdx];
  if (!s) return;
  const modal = document.getElementById("strikeModal");
  const body = document.getElementById("strikeModalContent");

  body.innerHTML = `
    <div class="panel-header" style="margin-bottom:12px">
      <div>
        <h3 style="margin:0;font-size:1.15rem;color:#fde047">📈 履約價 ${fmtNum(s.strike)} — 當日分時量價曲線 & 大單委買賣力道</h3>
        <div style="font-size:0.78rem;color:var(--muted);margin-top:3px">
          🔴 Call (${escapeHtml(s.callSymbol || '買權')}): <strong style="color:#f87171">${s.callPrice}</strong> (量: ${fmtNum(s.callVol)} / OI: ${fmtNum(s.callOi)} / ${s.callAction}) ｜
          🔵 Put (${escapeHtml(s.putSymbol || '賣權')}): <strong style="color:#60a5fa">${s.putPrice}</strong> (量: ${fmtNum(s.putVol)} / OI: ${fmtNum(s.putOi)} / ${s.putAction})
        </div>
      </div>
      <button class="btn" onclick="document.getElementById('strikeModal').style.display='none'">關閉 ✕</button>
    </div>

    <div id="strikeLiveLoading" style="font-size:0.8rem;color:#38bdf8;margin-bottom:8px">
      ${s.callSymbol ? '📡 正在向臺灣期貨交易所 (getChartData1M) 載入此履約價 1 分鐘真實量價曲線...' : ''}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">
      <div class="chart-wrap">
        <div style="font-size:0.82rem;font-weight:700;color:#fca5a5;margin-bottom:6px">🔴 ${fmtNum(s.strike)} Call 買權 — 當日分時權利金與成交量曲線</div>
        <canvas id="strikeCallCanvas" width="440" height="220"></canvas>
      </div>
      <div class="chart-wrap">
        <div style="font-size:0.82rem;font-weight:700;color:#93c5fd;margin-bottom:6px">🔵 ${fmtNum(s.strike)} Put 賣權 — 當日分時權利金與成交量曲線</div>
        <canvas id="strikePutCanvas" width="440" height="220"></canvas>
      </div>
    </div>
  `;
  modal.style.display = "flex";

  // If connected to LIVE_TAIFEX and we have callSymbol / putSymbol, fetch real 1M ticks for this strike!
  if (CURRENT_SESSION_ID === "LIVE_TAIFEX" && (s.callSymbol || s.putSymbol)) {
    try {
      const [cResp, pResp] = await Promise.all([
        s.callSymbol ? taifexPost("getChartData1M", { SymbolID: s.callSymbol }) : Promise.resolve(null),
        s.putSymbol ? taifexPost("getChartData1M", { SymbolID: s.putSymbol }) : Promise.resolve(null)
      ]);
      const cTicks = (cResp && cResp.RtData && cResp.RtData.Ticks) || [];
      const pTicks = (pResp && pResp.RtData && pResp.RtData.Ticks) || [];
      const cQuote = (cResp && cResp.RtData && cResp.RtData.Quote) || {};
      const pQuote = (pResp && pResp.RtData && pResp.RtData.Quote) || {};

      const loadEl = document.getElementById("strikeLiveLoading");
      if (loadEl) {
        loadEl.innerHTML = `✅ 已載入期交所即時明細｜🔴 Call 委買 ${fmtNum(cQuote.CBidUnit || 0)}口 (${fmtNum(cQuote.CBidCount || 0)}筆) vs 委賣 ${fmtNum(cQuote.CAskUnit || 0)}口｜🔵 Put 委買 ${fmtNum(pQuote.CBidUnit || 0)}口 (${fmtNum(pQuote.CBidCount || 0)}筆) vs 委賣 ${fmtNum(pQuote.CAskUnit || 0)}口`;
      }

      drawSingleOptionTickCanvas("strikeCallCanvas", cTicks, "#ef4444");
      drawSingleOptionTickCanvas("strikePutCanvas", pTicks, "#3b82f6");
      return;
    } catch (e) {}
  }

  // Fallback to pre-built intradayCurve
  const cTicksFallback = (s.intradayCurve || []).map(p => [p.time.replace(":", "") + "00", p.callPrice, p.callPrice, p.callPrice, p.callPrice, p.callVol]);
  const pTicksFallback = (s.intradayCurve || []).map(p => [p.time.replace(":", "") + "00", p.putPrice, p.putPrice, p.putPrice, p.putPrice, p.putVol]);
  drawSingleOptionTickCanvas("strikeCallCanvas", cTicksFallback, "#ef4444");
  drawSingleOptionTickCanvas("strikePutCanvas", pTicksFallback, "#3b82f6");
}

function drawSingleOptionTickCanvas(canvasId, ticks, lineColor) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!ticks || !ticks.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.fillText("此履約價尚無分時成交資料", W / 2 - 70, H / 2);
    return;
  }

  const padL = 48, padR = 20, padT = 16, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const prices = ticks.map(t => Number(t[4]));
  const vols = ticks.map(t => Number(t[5] || 0));
  const minP = Math.min(...prices) * 0.96;
  const maxP = Math.max(...prices, minP + 1) * 1.04;
  const maxV = Math.max(...vols, 10);

  ctx.font = "10px Consolas, monospace";
  for (let i = 0; i <= 3; i++) {
    const y = padT + (plotH * i / 3);
    const v = Math.round(maxP - ((maxP - minP) * i / 3));
    ctx.strokeStyle = "#1e293b";
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "right";
    ctx.fillText(String(v), padL - 5, y + 3);
  }

  const xOf = i => padL + (i / Math.max(1, ticks.length - 1)) * plotW;
  const yOfP = p => padT + plotH - ((p - minP) / Math.max(1, maxP - minP)) * plotH;

  // Volume bars at bottom 30% of chart
  const barW = Math.max(1.5, plotW / ticks.length);
  ticks.forEach((t, i) => {
    const vh = (Number(t[5] || 0) / maxV) * (plotH * 0.32);
    ctx.fillStyle = "rgba(148, 163, 184, 0.25)";
    ctx.fillRect(xOf(i) - barW / 2, padT + plotH - vh, barW, vh);
  });

  // Premium line
  ctx.beginPath();
  ticks.forEach((t, i) => {
    const cx = xOf(i), cy = yOfP(Number(t[4]));
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // X-axis time ticks
  for (let i = 0; i <= 4; i++) {
    const idx = Math.min(ticks.length - 1, Math.round((ticks.length - 1) * i / 4));
    const ts = String(ticks[idx][0] || "").padStart(6, "0");
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText(`${ts.slice(0, 2)}:${ts.slice(2, 4)}`, xOf(idx), H - 7);
  }
}

// ============================================================================
// Tab 3: 盤勢回顧與 1分 / 5分 / 15分 K 線逐步復盤模擬演練
// ============================================================================
function renderReplayTab() {
  if (!REPLAY_BARS.length) {
    REPLAY_BARS = ACTIVE_BARS.length ? ACTIVE_BARS.slice() : generateIntradaySeries(MARKET_SESSIONS[0], REPLAY_TIMEFRAME);
    REPLAY_STEP = Math.min(REPLAY_BARS.length - 1, Math.max(8, Math.floor(REPLAY_BARS.length * 0.5)));
  }
  const curBar = REPLAY_BARS[REPLAY_STEP] || REPLAY_BARS[REPLAY_BARS.length - 1];
  const container = document.getElementById("tab-replay");

  container.innerHTML = `
    <div class="panel-card">
      <div class="panel-header">
        <div>
          <h2 class="section-h2">盤勢回顧與 1分 / 5分 / 15分 K 線逐步復盤模擬演練</h2>
          <div style="font-size:0.78rem;color:var(--muted);margin-top:3px">
            💡 可使用期交所今日即時分 K 或挑選歷史盤勢，以 1分 / 5分 / 15分 K 線逐步推進，同步觀察下方 CP 差額三線圖轉折
          </div>
        </div>
        <div class="btn-group">
          <select class="select-input" onchange="onSessionChange(this.value)">
            <option value="LIVE_TAIFEX" ${CURRENT_SESSION_ID === 'LIVE_TAIFEX' ? 'selected' : ''}>🟢 期交所今日真實分 K 復盤</option>
            ${MARKET_SESSIONS.map(s => `<option value="${s.id}" ${s.id === CURRENT_SESSION_ID ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join("")}
          </select>
          <button class="btn ${REPLAY_TIMEFRAME === 1 ? 'active' : ''}" onclick="changeReplayTimeframe(1)">1分K</button>
          <button class="btn ${REPLAY_TIMEFRAME === 5 ? 'active' : ''}" onclick="changeReplayTimeframe(5)">5分K</button>
          <button class="btn ${REPLAY_TIMEFRAME === 15 ? 'active' : ''}" onclick="changeReplayTimeframe(15)">15分K</button>
        </div>
      </div>

      <div style="background:#090e1a;border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div class="btn-group">
          <button class="btn" onclick="resetReplay()">⏮️ 重頭</button>
          <button class="btn" onclick="stepReplay(-1)">⏪ 退一步</button>
          <button class="btn btn-primary" onclick="toggleReplayPlay()">
            ${REPLAY_TIMER ? '⏸️ 暫停復盤' : '▶️ 自動播放復盤'}
          </button>
          <button class="btn" onclick="stepReplay(1)">⏩ 下根K線</button>
        </div>

        <div style="flex:1;min-width:200px;display:flex;align-items:center;gap:10px">
          <span style="font-size:0.78rem;color:#fde047;font-weight:700">🕒 ${curBar.time} (${REPLAY_STEP + 1}/${REPLAY_BARS.length})</span>
          <input type="range" min="1" max="${Math.max(1, REPLAY_BARS.length - 1)}" value="${REPLAY_STEP}" style="flex:1" oninput="REPLAY_STEP=Number(this.value);updateReplayChartsOnly()">
        </div>

        <div class="btn-group">
          <button class="btn ${REPLAY_MODE === 'cp' ? 'active' : ''}" onclick="REPLAY_MODE='cp';updateReplayChartsOnly()">連動 CP 差額圖</button>
          <button class="btn ${REPLAY_MODE === 'major' ? 'active' : ''}" onclick="REPLAY_MODE='major';updateReplayChartsOnly()">連動 主散圖</button>
        </div>
      </div>

      <div id="replaySignalBanner" style="margin-bottom:12px;padding:10px 14px;background:rgba(37,99,235,0.14);border-left:4px solid var(--royal);border-radius:6px;font-size:0.83rem"></div>

      <div class="chart-wrap" style="margin-bottom:12px">
        <div style="font-size:0.8rem;font-weight:700;color:#cbd5e1;margin-bottom:4px">📈 台指期 ${REPLAY_TIMEFRAME} 分 K 線圖 ＋ 紅線(多方成本) / 綠線(多空成本 VWAP) / 藍線(短空成本)</div>
        <canvas id="replayKlineCanvas" width="1120" height="240"></canvas>
      </div>

      <div class="chart-wrap">
        <div style="font-size:0.8rem;font-weight:700;color:#cbd5e1;margin-bottom:4px">📊 同步籌碼即時線圖 (${REPLAY_MODE === 'cp' ? 'CP 差額圖：綠線差額 / 紅線Call / 藍線Put' : '主散圖：紅線主力 / 藍線散戶 / 綠線趨勢'})</div>
        <canvas id="replayChipCanvas" width="1120" height="220"></canvas>
      </div>
    </div>
  `;

  updateReplayChartsOnly();
}

function changeReplayTimeframe(tf) {
  if (REPLAY_TIMER) { clearInterval(REPLAY_TIMER); REPLAY_TIMER = null; }
  REPLAY_TIMEFRAME = tf;
  if (CURRENT_SESSION_ID === "LIVE_TAIFEX") {
    CURRENT_TIMEFRAME = tf;
    fetchLiveTaifexData();
  } else {
    REPLAY_BARS = generateIntradaySeries(getSessionConfig(), REPLAY_TIMEFRAME);
    REPLAY_STEP = Math.min(REPLAY_BARS.length - 1, Math.max(5, Math.floor(REPLAY_BARS.length * 0.45)));
    renderReplayTab();
  }
}

function resetReplay() {
  if (REPLAY_TIMER) { clearInterval(REPLAY_TIMER); REPLAY_TIMER = null; }
  REPLAY_STEP = 2;
  renderReplayTab();
}

function stepReplay(delta) {
  REPLAY_STEP = Math.min(REPLAY_BARS.length - 1, Math.max(1, REPLAY_STEP + delta));
  renderReplayTab();
}

function toggleReplayPlay() {
  if (REPLAY_TIMER) {
    clearInterval(REPLAY_TIMER);
    REPLAY_TIMER = null;
    renderReplayTab();
    return;
  }
  if (REPLAY_STEP >= REPLAY_BARS.length - 1) REPLAY_STEP = 2;
  REPLAY_TIMER = setInterval(() => {
    if (REPLAY_STEP < REPLAY_BARS.length - 1) {
      REPLAY_STEP++;
      updateReplayChartsOnly();
    } else {
      clearInterval(REPLAY_TIMER);
      REPLAY_TIMER = null;
      renderReplayTab();
    }
  }, REPLAY_SPEED);
  renderReplayTab();
}

function updateReplayChartsOnly() {
  const curBar = REPLAY_BARS[REPLAY_STEP] || REPLAY_BARS[REPLAY_BARS.length - 1];
  const banner = document.getElementById("replaySignalBanner");
  if (banner && curBar) {
    const costSignal = curBar.close >= curBar.redBullCost
      ? "🔴 指數站上【短多成本紅線】，多方強勢控盤"
      : (curBar.close <= curBar.blueBearCost ? "🔵 指數跌破【短空成本藍線】，空方強勢控盤" : "🟢 指數於多空成本區間震盪");
    banner.innerHTML = `
      <strong>[${curBar.time}] 復盤即時數值：</strong>
      台指期 <strong>${fmtNum(curBar.close)}</strong> (高 ${curBar.high} / 低 ${curBar.low}) ｜
      CP 差額 <strong style="color:${curBar.cpDiffVal >= 0 ? '#34d399' : '#f87171'}">${fmtSigned(curBar.cpDiffVal)}</strong> ｜
      Call <strong style="color:#f87171">${fmtSigned(curBar.callVal)}</strong> (${curBar.callAction}) ｜
      Put <strong style="color:#60a5fa">${fmtSigned(curBar.putVal)}</strong> (${curBar.putAction}) ｜
      <strong>${costSignal}</strong>
    `;
  }
  drawKlineWithCostCanvas("replayKlineCanvas", REPLAY_BARS, REPLAY_STEP);
  drawThreeLineChipChart("replayChipCanvas", REPLAY_BARS, REPLAY_MODE, REPLAY_STEP);
}

function drawKlineWithCostCanvas(canvasId, bars, maxIdx) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !bars || !bars.length) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const slice = bars.slice(0, maxIdx + 1);
  const padL = 68, padR = 64, padT = 16, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  let minP = Infinity, maxP = -Infinity;
  slice.forEach(b => {
    minP = Math.min(minP, b.low, b.blueBearCost, b.redBullCost);
    maxP = Math.max(maxP, b.high, b.blueBearCost, b.redBullCost);
  });
  const pad = Math.max(15, (maxP - minP) * 0.12);
  minP -= pad; maxP += pad;
  const spanP = Math.max(1, maxP - minP);

  const xOf = i => padL + (i / Math.max(1, bars.length - 1)) * plotW;
  const yOf = p => padT + plotH - ((p - minP) / spanP) * plotH;

  ctx.font = "11px Consolas, monospace";
  for (let i = 0; i <= 3; i++) {
    const y = padT + (plotH * i / 3);
    const v = Math.round(maxP - (spanP * i / 3));
    ctx.strokeStyle = "#1e293b";
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "right";
    ctx.fillText(fmtNum(v), padL - 8, y + 4);
  }

  const candleW = Math.max(3, Math.min(12, (plotW / bars.length) * 0.65));
  slice.forEach((b, i) => {
    const cx = xOf(i);
    const isUp = b.close >= b.open;
    const color = isUp ? "#ef4444" : "#22c55e";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, yOf(b.high));
    ctx.lineTo(cx, yOf(b.low));
    ctx.stroke();

    const yTop = yOf(Math.max(b.open, b.close));
    const yBot = yOf(Math.min(b.open, b.close));
    ctx.fillStyle = color;
    ctx.fillRect(cx - candleW / 2, yTop, candleW, Math.max(2, yBot - yTop));
  });

  const costLines = [
    { key: "redBullCost", color: "#ef4444" },
    { key: "greenMidCost", color: "#10b981" },
    { key: "blueBearCost", color: "#3b82f6" }
  ];
  costLines.forEach(cl => {
    ctx.beginPath();
    slice.forEach((b, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(b[cl.key])) : ctx.lineTo(xOf(i), yOf(b[cl.key])));
    ctx.strokeStyle = cl.color;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  });
}

// ============================================================================
// Tab 4: 盤勢分析報告與策略中心 (參照 op-win.com/ctlist.jsp)
// ============================================================================
function renderAnalysisTab() {
  const cfg = getSessionConfig();
  const rep = cfg.analysisReport;
  const chain = ACTIVE_CHAIN;
  const container = document.getElementById("tab-analysis");

  container.innerHTML = `
    <div class="panel-card">
      <div class="panel-header">
        <div>
          <h2 class="section-h2">台指盤勢與選擇權支撐壓力分析報告（量化模組解讀）</h2>
          <div style="font-size:0.78rem;color:var(--muted);margin-top:3px">結合期交所即時量能、選擇權最大未平倉支撐壓力區與三大法人買賣方籌碼結構</div>
        </div>
        <select class="select-input" onchange="onSessionChange(this.value)">
          <option value="LIVE_TAIFEX" ${CURRENT_SESSION_ID === 'LIVE_TAIFEX' ? 'selected' : ''}>🟢 期交所即時連線分析</option>
          ${MARKET_SESSIONS.map(s => `<option value="${s.id}" ${s.id === CURRENT_SESSION_ID ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join("")}
        </select>
      </div>

      <div style="background:rgba(37,99,235,0.14);border:1px solid rgba(37,99,235,0.4);border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-size:0.76rem;color:#38bdf8;font-weight:700">📌 最新分析報告摘要</div>
        <div style="font-size:1.12rem;font-weight:800;color:#fff;margin-top:4px">${escapeHtml(rep.headline)}</div>
      </div>

      <h3 class="section-h2" style="margin-bottom:12px">盤面關鍵指標觀察</h3>
      <div class="table-scroll" style="margin-bottom:18px">
        <table class="t-table">
          <thead>
            <tr>
              <th style="text-align:left;width:160px">觀察指標</th>
              <th style="text-align:left;width:230px">當前態勢</th>
              <th style="text-align:left">量化模組深度解讀</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="text-align:left;font-weight:700;color:#fff">成交量能與委買賣</td>
              <td style="text-align:left;color:#38bdf8">即時量能與大單監控</td>
              <td style="text-align:left;color:#cbd5e1">${escapeHtml(rep.volumeNote)}</td>
            </tr>
            <tr>
              <td style="text-align:left;font-weight:700;color:#fff">期現貨價差</td>
              <td style="text-align:left;color:#fde047">期貨 ${fmtNum(cfg.txfClose)} / 現貨 ${fmtNum(cfg.spotClose)}</td>
              <td style="text-align:left;color:#cbd5e1">${escapeHtml(rep.spreadNote)}</td>
            </tr>
            <tr>
              <td style="text-align:left;font-weight:700;color:#fff">大戶單筆口數比</td>
              <td style="text-align:left;color:#4ade80">主力 vs 散戶委託結構</td>
              <td style="text-align:left;color:#cbd5e1">${escapeHtml(rep.weightsNote)}</td>
            </tr>
            <tr>
              <td style="text-align:left;font-weight:700;color:#fff">選擇權支撐壓力區</td>
              <td style="text-align:left;color:#f87171">${fmtNum(chain.putWallStrike)} ~ ${fmtNum(chain.callWallStrike)}</td>
              <td style="text-align:left;color:#cbd5e1">下檔 ${fmtNum(chain.putWallStrike)} Put 最大支撐地板；上檔 ${fmtNum(chain.callWallStrike)} Call 最大壓力天花板，最大痛點 ${fmtNum(chain.maxPainStrike)}。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-bottom:18px">
        <div style="background:#090e1a;border:1px solid var(--border);border-top:3px solid var(--royal);border-radius:10px;padding:15px">
          <h4 style="margin:0 0 8px;color:#38bdf8">📈 技術面與多空成本解析</h4>
          <p style="margin:0;font-size:0.88rem;color:#cbd5e1;line-height:1.65">${escapeHtml(rep.techView)}</p>
        </div>
        <div style="background:#090e1a;border:1px solid var(--border);border-top:3px solid #10b981;border-radius:10px;padding:15px">
          <h4 style="margin:0 0 8px;color:#34d399">🎯 選擇權籌碼面深度解析</h4>
          <p style="margin:0;font-size:0.88rem;color:#cbd5e1;line-height:1.65">${escapeHtml(rep.chipView)}</p>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Tab 5: 選擇權基礎教學與四大動作損益試算器 (參照 op-win.com/option.jsp)
// ============================================================================
function renderAcademyTab() {
  const container = document.getElementById("tab-academy");

  container.innerHTML = `
    <div class="panel-card">
      <div class="panel-header">
        <h2 class="section-h2">選擇權基礎教學 — 四大基本動作 (BC / BP / SC / SP) 與互動損益試算</h2>
      </div>

      <p style="font-size:0.9rem;color:#cbd5e1;margin-top:0">
        選擇權（Options）是一種<strong>「未來的權利契約」</strong>。買方（Buy）支付權利金取得權利，風險有限、獲利無限；賣方（Sell）收取權利金並承擔履約義務，賺取時間價值（Theta）結算收益。
      </p>

      <div class="table-scroll" style="margin-bottom:18px">
        <table class="t-table">
          <thead>
            <tr>
              <th style="text-align:left;width:110px">動作代號</th>
              <th style="text-align:left;width:210px">完整名稱</th>
              <th style="text-align:left;width:140px">市場看法 (View)</th>
              <th style="text-align:left;width:150px">對應即時線圖特徵</th>
              <th style="text-align:left">實戰策略說明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="text-align:left"><span class="op-badge badge-bc">BC</span></td>
              <td style="text-align:left;font-weight:700;color:#fff">Buy Call (買進買權)</td>
              <td style="text-align:left;color:#f87171;font-weight:700">大漲 (Bullish)</td>
              <td style="text-align:left;color:#fca5a5">紅線 (Call) 位於零軸之上</td>
              <td style="text-align:left;color:#cbd5e1">預期市場將大幅上漲，支付權利金追求高槓桿突破報酬。</td>
            </tr>
            <tr>
              <td style="text-align:left"><span class="op-badge badge-bp">BP</span></td>
              <td style="text-align:left;font-weight:700;color:#fff">Buy Put (買進賣權)</td>
              <td style="text-align:left;color:#60a5fa;font-weight:700">大跌 (Bearish)</td>
              <td style="text-align:left;color:#93c5fd">藍線 (Put) 位於零軸之上</td>
              <td style="text-align:left;color:#cbd5e1">預期市場將大幅下跌或崩盤，支付權利金做空獲利或保護現貨。</td>
            </tr>
            <tr>
              <td style="text-align:left"><span class="op-badge badge-sc">SC</span></td>
              <td style="text-align:left;font-weight:700;color:#fff">Sell Call (賣出買權)</td>
              <td style="text-align:left;color:#4ade80;font-weight:700">不漲 / 緩跌 (壓力)</td>
              <td style="text-align:left;color:#86efac">紅線 (Call) 位於零軸之下</td>
              <td style="text-align:left;color:#cbd5e1">預期行情漲不過某履約價（天花板壓力），收取權利金賺取時間價值。</td>
            </tr>
            <tr>
              <td style="text-align:left"><span class="op-badge badge-sp">SP</span></td>
              <td style="text-align:left;font-weight:700;color:#fff">Sell Put (賣出賣權)</td>
              <td style="text-align:left;color:#fbbf24;font-weight:700">不跌 / 緩漲 (支撐)</td>
              <td style="text-align:left;color:#fde047">藍線 (Put) 位於零軸之下</td>
              <td style="text-align:left;color:#cbd5e1">預期行情跌不破某履約價（地板支撐），收取權利金賺取結算收益。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 class="section-h2" style="margin-bottom:12px">🧮 四大動作到期損益曲線互動試算器</h3>
      <div style="background:#090e1a;border:1px solid var(--border);border-radius:12px;padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <div class="btn-group">
            <button class="btn ${PAYOFF_ACTION === 'BC' ? 'active' : ''}" onclick="PAYOFF_ACTION='BC';renderAcademyTab()">BC 買進買權 (看大漲)</button>
            <button class="btn ${PAYOFF_ACTION === 'BP' ? 'active' : ''}" onclick="PAYOFF_ACTION='BP';renderAcademyTab()">BP 買進賣權 (看大跌)</button>
            <button class="btn ${PAYOFF_ACTION === 'SC' ? 'active' : ''}" onclick="PAYOFF_ACTION='SC';renderAcademyTab()">SC 賣出買權 (看不漲)</button>
            <button class="btn ${PAYOFF_ACTION === 'SP' ? 'active' : ''}" onclick="PAYOFF_ACTION='SP';renderAcademyTab()">SP 賣出賣權 (看不跌)</button>
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:0.82rem">
            <span>履約價：<strong style="color:#fde047">${PAYOFF_STRIKE}</strong></span>
            <span>權利金：<strong style="color:#38bdf8">${PAYOFF_PREMIUM} 點</strong> (每點 50 元 = NT$${fmtNum(PAYOFF_PREMIUM * 50)})</span>
          </div>
        </div>
        <div class="chart-wrap">
          <canvas id="payoffCanvas" width="1080" height="220"></canvas>
        </div>
      </div>
    </div>
  `;

  drawPayoffCanvas();
}

function drawPayoffCanvas() {
  const canvas = document.getElementById("payoffCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const padL = 65, padR = 30, padT = 20, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const k = PAYOFF_STRIKE, prem = PAYOFF_PREMIUM;
  const minS = k - 600, maxS = k + 600;

  const pts = [];
  for (let s = minS; s <= maxS; s += 25) {
    let pnl = 0;
    if (PAYOFF_ACTION === "BC") pnl = Math.max(0, s - k) - prem;
    else if (PAYOFF_ACTION === "BP") pnl = Math.max(0, k - s) - prem;
    else if (PAYOFF_ACTION === "SC") pnl = prem - Math.max(0, s - k);
    else if (PAYOFF_ACTION === "SP") pnl = prem - Math.max(0, k - s);
    pts.push({ s, pnl });
  }

  const maxAbs = 500;
  const xOf = s => padL + ((s - minS) / (maxS - minS)) * plotW;
  const yOf = v => padT + plotH / 2 - (v / maxAbs) * (plotH / 2);

  ctx.strokeStyle = "rgba(250, 204, 21, 0.5)";
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(padL, yOf(0)); ctx.lineTo(padL + plotW, yOf(0)); ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "#334155";
  ctx.beginPath(); ctx.moveTo(xOf(k), padT); ctx.lineTo(xOf(k), padT + plotH); ctx.stroke();

  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(xOf(p.s), yOf(p.pnl)) : ctx.lineTo(xOf(p.s), yOf(p.pnl)));
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2.6;
  ctx.stroke();

  const be = (PAYOFF_ACTION === "BC" || PAYOFF_ACTION === "SC") ? (k + prem) : (k - prem);
  ctx.fillStyle = "#fde047";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`損益兩平點：${be} 點`, xOf(be), yOf(0) - 10);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`履約價 ${k}`, xOf(k), H - 8);
}

// ============================================================================
// Initialization
// ============================================================================
window.addEventListener("DOMContentLoaded", () => {
  // Initialize fallback first so screen renders in 0ms, then immediately fetch live TAIFEX data!
  const fallbackCfg = MARKET_SESSIONS[0];
  ACTIVE_BARS = generateIntradaySeries(fallbackCfg, CURRENT_TIMEFRAME);
  ACTIVE_CHAIN = generateStrikeChain(fallbackCfg, CURRENT_CUM_DAYS);
  renderRealtimeTab();
  fetchLiveTaifexData();
  startTaifexAutoPoll();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
});
