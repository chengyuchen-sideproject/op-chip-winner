// ============================================================================
// OP 籌碼贏家 Pro (參照 www.op-win.com) — 核心互動看盤、三線圖、T字表與K線復盤引擎
// ============================================================================

let CURRENT_TAB = "realtime";
let CURRENT_SESSION_ID = MARKET_SESSIONS[0].id;
let CURRENT_LINE_MODE = "cp"; // 'cp' (CP差額圖) | 'cost' (台指期多空圖) | 'major' (主散圖)
let CURRENT_TIMEFRAME = 5;    // 1 | 5 | 15 (分鐘)
let CURRENT_CUM_DAYS = 1;     // 1 | 3 | 5 | 20 (波段累積天數)

// Live Tick Simulation
let LIVE_TIMER = null;
let LIVE_OFFSET = 0;

// Replay Simulator State
let REPLAY_TIMEFRAME = 5;
let REPLAY_MODE = "cp";
let REPLAY_BARS = [];
let REPLAY_STEP = 15;
let REPLAY_TIMER = null;
let REPLAY_SPEED = 600;

// Academy Payoff Calculator State
let PAYOFF_ACTION = "BC"; // BC | BP | SC | SP
let PAYOFF_STRIKE = 22800;
let PAYOFF_PREMIUM = 140;

// Cached Session Data
let ACTIVE_BARS = [];
let ACTIVE_CHAIN = null;

function getSessionConfig() {
  return MARKET_SESSIONS.find(s => s.id === CURRENT_SESSION_ID) || MARKET_SESSIONS[0];
}

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

function refreshSessionData() {
  const cfg = getSessionConfig();
  ACTIVE_BARS = generateIntradaySeries(cfg, CURRENT_TIMEFRAME);
  ACTIVE_CHAIN = generateStrikeChain(cfg, CURRENT_CUM_DAYS);
  updateTickerBar();
}

function updateTickerBar() {
  const cfg = getSessionConfig();
  const lastBar = ACTIVE_BARS[ACTIVE_BARS.length - 1] || { close: cfg.txfClose, cpDiffVal: 0, callAction: "BC", putAction: "SP" };
  const txfPrice = lastBar.close + LIVE_OFFSET;
  const txfChg = txfPrice - cfg.txfOpen;
  const spread = txfPrice - cfg.spotClose;
  const isBull = lastBar.cpDiffVal >= 0;

  const el = document.getElementById("tickerBarContent");
  if (!el) return;
  el.innerHTML = `
    <div class="ticker-items">
      <span>📅 <strong>${escapeHtml(cfg.contract)}</strong></span>
      <span>台指期 (TXF): <strong class="${txfChg >= 0 ? 'up-red' : 'dn-green'}">${fmtNum(txfPrice)} (${txfChg >= 0 ? '▲' : '▼'}${Math.abs(txfChg)})</strong></span>
      <span>加權現貨: <strong>${fmtNum(cfg.spotClose)}</strong></span>
      <span>期現貨價差: <strong class="${spread >= 0 ? 'up-red' : 'dn-green'}">${spread >= 0 ? '+' : ''}${spread} 點</strong></span>
      <span>P/C Ratio: <strong style="color:#fde047">${ACTIVE_CHAIN ? ACTIVE_CHAIN.calcPcRatio : cfg.pcRatio}%</strong></span>
      <span>CP 差額值: <strong style="color:${isBull ? '#34d399' : '#f87171'}">${fmtSigned(lastBar.cpDiffVal)} 口</strong></span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span class="op-badge ${isBull ? 'badge-bc' : 'badge-bp'}">
        🎯 量化訊號：${isBull ? '多方控盤 (CP差額 > 0)' : '空方控盤 (CP差額 < 0)'}
      </span>
    </div>
  `;
}

// ============================================================================
// Navigation
// ============================================================================
function switchView(tabId) {
  CURRENT_TAB = tabId;
  document.querySelectorAll(".tab-view").forEach(v => {
    v.classList.toggle("active", v.id === "tab-" + tabId);
  });
  document.querySelectorAll(".top-nav-btn, .m-nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tabId);
  });

  if (tabId === "realtime") renderRealtimeTab();
  if (tabId === "strikes") renderStrikesTab();
  if (tabId === "replay") renderReplayTab();
  if (tabId === "analysis") renderAnalysisTab();
  if (tabId === "academy") renderAcademyTab();
}

function onSessionChange(newSessionId) {
  CURRENT_SESSION_ID = newSessionId;
  LIVE_OFFSET = 0;
  refreshSessionData();
  REPLAY_BARS = generateIntradaySeries(getSessionConfig(), REPLAY_TIMEFRAME);
  REPLAY_STEP = Math.min(REPLAY_BARS.length - 1, Math.max(10, Math.floor(REPLAY_BARS.length * 0.6)));
  switchView(CURRENT_TAB);
}

// ============================================================================
// Tab 1: 即時籌碼與三種核心線圖 (CP差額圖 / 台指期多空圖 / 主散圖)
// ============================================================================
function renderRealtimeTab() {
  const cfg = getSessionConfig();
  const lastBar = ACTIVE_BARS[ACTIVE_BARS.length - 1];
  const chain = ACTIVE_CHAIN;
  const container = document.getElementById("tab-realtime");

  const modeDescriptions = {
    cp: {
      title: "1. CP 差額圖（選擇權多空口數總額與 BC/SC/BP/SP 判讀）",
      legends: [
        { color: "#10b981", label: "綠線 (CP 差額值)：判斷選擇權籌碼多空口數之總額變化" },
        { color: "#ef4444", label: "紅線 (Call 買權)：零軸之上 = 買進 (BC 看漲)；零軸之下 = 賣出 (SC 看不漲)" },
        { color: "#3b82f6", label: "藍線 (Put 賣權)：零軸之上 = 買進 (BP 看跌)；零軸之下 = 賣出 (SP 看不跌)" }
      ]
    },
    cost: {
      title: "2. 台指期多空成本圖（短多成本 / 短空成本 / 多空分界線）",
      legends: [
        { color: "#f8fafc", label: "白線 (台指期指數)：當日台指期即時收盤連線" },
        { color: "#ef4444", label: "紅線 (多方成本)：多方有量進場時接手，站上短多成本時偏多看" },
        { color: "#3b82f6", label: "藍線 (短空成本)：跌破藍線時偏空看" },
        { color: "#10b981", label: "綠線 (多空成本)：線上偏多、線下偏空" }
      ]
    },
    major: {
      title: "3. 主散籌碼對決圖（主力大戶 vs 散戶籌碼動向）",
      legends: [
        { color: "#ef4444", label: "紅線 (主力籌碼)：主力積極買進時為正數，反之賣出為負值" },
        { color: "#3b82f6", label: "藍線 (散戶籌碼)：顯示散戶小台/微台與選擇權動向（常為反指標）" },
        { color: "#10b981", label: "綠線 (市場趨勢)：顯示整體市場合力方向" }
      ]
    }
  };

  const curMeta = modeDescriptions[CURRENT_LINE_MODE];

  container.innerHTML = `
    <!-- Top Date & Live Bar -->
    <div class="panel-card" style="padding:12px 16px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:0.82rem;color:var(--muted);font-weight:700">📊 盤勢日期 / 模式切換：</span>
          <select class="select-input" onchange="onSessionChange(this.value)">
            ${MARKET_SESSIONS.map(s => `<option value="${s.id}" ${s.id === CURRENT_SESSION_ID ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join("")}
          </select>
        </div>
        <div class="btn-group">
          <button class="btn ${CURRENT_TIMEFRAME === 1 ? 'active' : ''}" onclick="CURRENT_TIMEFRAME=1;refreshSessionData();renderRealtimeTab()">1分線</button>
          <button class="btn ${CURRENT_TIMEFRAME === 5 ? 'active' : ''}" onclick="CURRENT_TIMEFRAME=5;refreshSessionData();renderRealtimeTab()">5分線</button>
          <button class="btn ${CURRENT_TIMEFRAME === 15 ? 'active' : ''}" onclick="CURRENT_TIMEFRAME=15;refreshSessionData();renderRealtimeTab()">15分線</button>
          <button class="btn ${LIVE_TIMER ? 'btn-teal' : ''}" onclick="toggleLiveSimulation()">
            ${LIVE_TIMER ? '🟢 盤中即時跳動中 (點擊停止)' : '⚡ 啟動模擬盤中即時更新'}
          </button>
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
        <div class="kpi-sub">天花板 OI: <strong>${fmtNum(chain.maxCallOi)} 口</strong> (零軸${lastBar.callVal >= 0 ? '之上看漲' : '之下看不漲'})</div>
      </div>

      <div class="kpi-card put-wall">
        <div class="kpi-label"><span>🔵 Put 賣權主力狀態</span><span class="op-badge ${lastBar.putVal >= 0 ? 'badge-bp' : 'badge-sp'}">${lastBar.putVal >= 0 ? 'BP 買進賣權' : 'SP 賣出賣權'}</span></div>
        <div class="kpi-val" style="color:#60a5fa">${fmtNum(chain.putWallStrike)} <span style="font-size:0.82rem;color:var(--muted)">最大支撐</span></div>
        <div class="kpi-sub">地板 OI: <strong>${fmtNum(chain.maxPutOi)} 口</strong> (零軸${lastBar.putVal >= 0 ? '之上看跌' : '之下看不跌'})</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label"><span>🎯 莊家最大痛點 (Max Pain)</span><span style="color:#fde047;font-weight:700">結算收斂區</span></div>
        <div class="kpi-val" style="color:#fde047">${fmtNum(chain.maxPainStrike)} <span style="font-size:0.82rem;color:var(--muted)">點</span></div>
        <div class="kpi-sub">莊家最有利區間：<strong>${fmtNum(chain.putWallStrike)} ~ ${fmtNum(chain.callWallStrike)}</strong></div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label"><span>🌡️ P/C Ratio & 主散動向</span><span style="color:#38bdf8;font-weight:700">VIX ${cfg.vix}</span></div>
        <div class="kpi-val" style="color:${chain.calcPcRatio >= 100 ? '#34d399' : '#f87171'}">${chain.calcPcRatio}%</div>
        <div class="kpi-sub">主力: <strong style="color:#f87171">${fmtSigned(lastBar.majorVal)}</strong> | 散戶: <strong style="color:#60a5fa">${fmtSigned(lastBar.retailVal)}</strong></div>
      </div>
    </div>

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

    <!-- Quick Preview of Support/Resistance OI Walls & Quick Jump -->
    <div class="panel-card">
      <div class="panel-header">
        <h2 class="section-h2">各履約價支撐壓力分佈預覽 (Call 壓力天花板 vs Put 支撐地板)</h2>
        <button class="btn btn-primary" onclick="switchView('strikes')">進入完整 T 字籌碼報價表 (點擊價位看量價曲線) ➔</button>
      </div>
      <div class="chart-wrap">
        <canvas id="oiWallPreviewCanvas" width="1120" height="230"></canvas>
      </div>
    </div>
  `;

  drawThreeLineChipChart("realtimeChipCanvas", ACTIVE_BARS, CURRENT_LINE_MODE);
  drawOiWallChart("oiWallPreviewCanvas", ACTIVE_CHAIN);
}

function toggleLiveSimulation() {
  if (LIVE_TIMER) {
    clearInterval(LIVE_TIMER);
    LIVE_TIMER = null;
    renderRealtimeTab();
    return;
  }
  LIVE_TIMER = setInterval(() => {
    if (!ACTIVE_BARS.length) return;
    const last = ACTIVE_BARS[ACTIVE_BARS.length - 1];
    const deltaP = Math.round((Math.random() - 0.48) * 14);
    last.close += deltaP;
    last.high = Math.max(last.high, last.close);
    last.low = Math.min(last.low, last.close);
    last.callVal += Math.round((Math.random() - 0.46) * 85);
    last.putVal += Math.round((Math.random() - 0.52) * 85);
    last.cpDiffVal = last.callVal - last.putVal;
    last.majorVal += Math.round((Math.random() - 0.47) * 75);
    last.retailVal -= Math.round((Math.random() - 0.47) * 65);
    last.trendVal = Math.round(last.majorVal - last.retailVal * 0.6);
    updateTickerBar();
    if (CURRENT_TAB === "realtime") {
      drawThreeLineChipChart("realtimeChipCanvas", ACTIVE_BARS, CURRENT_LINE_MODE);
    }
  }, 1500);
  renderRealtimeTab();
}

// ============================================================================
// Canvas Renderer 1: op-win.com 3-Mode Chip Line Chart (CP差額圖 / 台指期多空圖 / 主散圖)
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
    const absMax = Math.max(Math.abs(minV), Math.abs(maxV), 500);
    minV = -absMax * 1.1;
    maxV = absMax * 1.1;
  } else {
    const pad = Math.max(20, (maxV - minV) * 0.15);
    minV -= pad;
    maxV += pad;
  }
  const spanV = Math.max(1, maxV - minV);

  const xOf = idx => padL + (idx / Math.max(1, bars.length - 1)) * plotW;
  const yOf = val => padT + plotH - ((val - minV) / spanV) * plotH;

  // Grid lines
  ctx.font = "11px Consolas, monospace";
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i / 4);
    const v = Math.round(maxV - (spanV * i / 4));
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "right";
    ctx.fillText(fmtSigned(v), padL - 8, y + 4);
  }

  // Zero Axis Highlight for CP Spread & Major/Retail
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

  // Draw Series
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

    // End value label
    const lastB = sliceBars[sliceBars.length - 1];
    const lastY = yOf(lastB[s.key]);
    ctx.fillStyle = s.color;
    ctx.textAlign = "left";
    ctx.fillText(fmtSigned(lastB[s.key]), padL + plotW + 6, lastY + 4);
  });

  // Time X-Axis Labels
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  const tickCount = 6;
  for (let i = 0; i <= tickCount; i++) {
    const bIdx = Math.min(bars.length - 1, Math.round((bars.length - 1) * i / tickCount));
    ctx.fillText(bars[bIdx].time, xOf(bIdx), H - 8);
  }

  // Bind Hover Tooltip
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

    let rowsHtml = `<div style="color:#fde047;font-weight:800;border-bottom:1px solid #334155;padding-bottom:3px;margin-bottom:4px">🕒 時間：${b.time} | 台指期：${fmtNum(b.close)}</div>`;
    if (mode === "cp") {
      rowsHtml += `
        <div><span style="color:#10b981">■ 綠線 (CP 差額值)：</span><strong>${fmtSigned(b.cpDiffVal)} 口</strong></div>
        <div><span style="color:#ef4444">■ 紅線 (Call 買權)：</span><strong>${fmtSigned(b.callVal)}</strong> (${b.callAction})</div>
        <div><span style="color:#3b82f6">■ 藍線 (Put 賣權)：</span><strong>${fmtSigned(b.putVal)}</strong> (${b.putAction})</div>
      `;
    } else if (mode === "cost") {
      rowsHtml += `
        <div><span style="color:#ef4444">■ 紅線 (多方成本)：</span><strong>${fmtNum(b.redBullCost)}</strong></div>
        <div><span style="color:#10b981">■ 綠線 (多空分界)：</span><strong>${fmtNum(b.greenMidCost)}</strong> (${b.close >= b.greenMidCost ? '線上偏多' : '線下偏空'})</div>
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
  if (!canvas || !chain) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const strikes = chain.strikes;
  const padL = 58, padR = 30, padT = 24, padB = 32;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxOi = Math.max(...strikes.map(s => Math.max(s.callOi, s.putOi)), 1000);

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
  const barW = Math.max(6, (groupW - 10) / 2);

  strikes.forEach((s, idx) => {
    const gx = padL + idx * groupW + 5;
    const ch = (s.callOi / maxOi) * plotH;
    const ph = (s.putOi / maxOi) * plotH;

    // Call Bar (Red = 買權未平倉壓力)
    ctx.fillStyle = s.isCallWall ? "#ef4444" : "rgba(239, 68, 68, 0.72)";
    ctx.fillRect(gx, padT + plotH - ch, barW, ch);

    // Put Bar (Blue = 賣權未平倉支撐)
    ctx.fillStyle = s.isPutWall ? "#3b82f6" : "rgba(59, 130, 246, 0.72)";
    ctx.fillRect(gx + barW + 2, padT + plotH - ph, barW, ph);

    // Strike label
    ctx.fillStyle = s.isAtm ? "#fde047" : (s.isCallWall ? "#fca5a5" : (s.isPutWall ? "#93c5fd" : "#94a3b8"));
    ctx.textAlign = "center";
    ctx.fillText(String(s.strike), gx + barW, H - 10);

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
// Tab 2: 選擇權籌碼 T 字報價表 & 波段累積籌碼 & 單一履約價量價曲線彈窗
// ============================================================================
function renderStrikesTab() {
  const chain = ACTIVE_CHAIN;
  const container = document.getElementById("tab-strikes");
  const maxOi = Math.max(chain.maxCallOi, chain.maxPutOi, 1);

  container.innerHTML = `
    <div class="panel-card">
      <div class="panel-header">
        <div>
          <h2 class="section-h2">選擇權 T 字籌碼支撐壓力佈局表（點擊任一履約價看當日與一週量價曲線）</h2>
          <div style="font-size:0.78rem;color:var(--muted);margin-top:3px">
            💡 參照 <code>op-win.com</code>：可自訂波段累積日期，並點擊任一履約價位查看當天分時與一週內的量價曲線變化
          </div>
        </div>
        <div class="btn-group">
          <button class="btn ${CURRENT_CUM_DAYS === 1 ? 'active' : ''}" onclick="CURRENT_CUM_DAYS=1;refreshSessionData();renderStrikesTab()">當日籌碼 (1日)</button>
          <button class="btn ${CURRENT_CUM_DAYS === 3 ? 'active' : ''}" onclick="CURRENT_CUM_DAYS=3;refreshSessionData();renderStrikesTab()">近 3 日波段累積</button>
          <button class="btn ${CURRENT_CUM_DAYS === 5 ? 'active' : ''}" onclick="CURRENT_CUM_DAYS=5;refreshSessionData();renderStrikesTab()">週選波段累積 (5日)</button>
          <button class="btn ${CURRENT_CUM_DAYS === 20 ? 'active' : ''}" onclick="CURRENT_CUM_DAYS=20;refreshSessionData();renderStrikesTab()">月選波段累積 (20日)</button>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;padding:10px 14px;background:#090e1a;border-radius:10px;font-size:0.82rem">
        <div>🔴 <strong>買權最大壓力區 (Call Wall)：</strong><span style="color:#f87171;font-weight:800">${fmtNum(chain.callWallStrike)} 點</span> (${fmtNum(chain.maxCallOi)} 口)</div>
        <div>🎯 <strong>莊家最大痛點 (Max Pain)：</strong><span style="color:#fde047;font-weight:800">${fmtNum(chain.maxPainStrike)} 點</span></div>
        <div>🔵 <strong>賣權最大支撐區 (Put Wall)：</strong><span style="color:#60a5fa;font-weight:800">${fmtNum(chain.putWallStrike)} 點</span> (${fmtNum(chain.maxPutOi)} 口)</div>
        <div>📊 <strong>總未平倉 P/C Ratio：</strong><span style="color:#34d399;font-weight:800">${chain.calcPcRatio}%</span> (Put ${fmtNum(chain.totalPutOi)} / Call ${fmtNum(chain.totalCallOi)})</div>
      </div>

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
              <th>OI 分佈</th>
              <th>未平倉 (OI)</th>
              <th>單日增減</th>
              <th>成交量</th>
              <th>成交價 (漲跌)</th>
              <th class="strike-col">Strike</th>
              <th>成交價 (漲跌)</th>
              <th>成交量</th>
              <th>單日增減</th>
              <th>未平倉 (OI)</th>
              <th>OI 分佈</th>
              <th>主力判定</th>
            </tr>
          </thead>
          <tbody>
            ${chain.strikes.map((s, idx) => {
              const cPct = Math.min(100, Math.round((s.callOi / maxOi) * 100));
              const pPct = Math.min(100, Math.round((s.putOi / maxOi) * 100));
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
                <tr class="${rowCls}" onclick="openStrikeModal(${idx})" title="點擊查看 ${s.strike} 履約價當日分時與一週量價曲線">
                  <td><span class="op-badge ${s.callAction === 'BC' ? 'badge-bc' : 'badge-sc'}">${s.callAction === 'BC' ? 'BC 買進買權' : 'SC 賣出買權'}</span></td>
                  <td><div class="oi-bar-wrap"><div class="oi-bar-call" style="width:${cPct}%"></div></div></td>
                  <td style="font-weight:700;color:#f8fafc">${fmtNum(s.callOi)}</td>
                  <td class="${s.callOiDelta >= 0 ? 'up-red' : 'dn-green'}">${fmtSigned(s.callOiDelta)}</td>
                  <td style="color:var(--muted)">${fmtNum(s.callVol)}</td>
                  <td><strong>${s.callPrice.toFixed(1)}</strong> <span class="${s.callChg >= 0 ? 'up-red' : 'dn-green'}" style="font-size:0.74rem">(${s.callChg >= 0 ? '+' : ''}${s.callChg.toFixed(1)})</span></td>
                  <td class="strike-col">
                    <div style="font-size:0.95rem">📈 ${fmtNum(s.strike)}</div>
                    ${strikeTag}
                  </td>
                  <td><strong>${s.putPrice.toFixed(1)}</strong> <span class="${s.putChg >= 0 ? 'up-red' : 'dn-green'}" style="font-size:0.74rem">(${s.putChg >= 0 ? '+' : ''}${s.putChg.toFixed(1)})</span></td>
                  <td style="color:var(--muted)">${fmtNum(s.putVol)}</td>
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

function openStrikeModal(strikeIdx) {
  const s = ACTIVE_CHAIN.strikes[strikeIdx];
  if (!s) return;
  const modal = document.getElementById("strikeModal");
  const body = document.getElementById("strikeModalContent");

  body.innerHTML = `
    <div class="panel-header" style="margin-bottom:12px">
      <div>
        <h3 style="margin:0;font-size:1.15rem;color:#fde047">📈 履約價 ${fmtNum(s.strike)} — 當日分時量價曲線 & 一週未平倉趨勢</h3>
        <div style="font-size:0.78rem;color:var(--muted);margin-top:3px">
          Call 報價: <strong style="color:#f87171">${s.callPrice}</strong> (OI: ${fmtNum(s.callOi)} 口 / ${s.callAction}) |
          Put 報價: <strong style="color:#60a5fa">${s.putPrice}</strong> (OI: ${fmtNum(s.putOi)} 口 / ${s.putAction})
        </div>
      </div>
      <button class="btn" onclick="document.getElementById('strikeModal').style.display='none'">關閉 ✕</button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">
      <div class="chart-wrap">
        <div style="font-size:0.82rem;font-weight:700;color:#e2e8f0;margin-bottom:6px">🕒 當日分時權利金報價與成交量曲線 (08:45 ~ 13:45)</div>
        <canvas id="strikeIntradayCanvas" width="440" height="220"></canvas>
      </div>
      <div class="chart-wrap">
        <div style="font-size:0.82rem;font-weight:700;color:#e2e8f0;margin-bottom:6px">📅 近一週 (7日) Call vs Put 未平倉量累積曲線</div>
        <canvas id="strikeWeeklyCanvas" width="440" height="220"></canvas>
      </div>
    </div>
  `;
  modal.style.display = "flex";

  // Draw Intraday Strike Curve
  const c1 = document.getElementById("strikeIntradayCanvas");
  if (c1) {
    const ctx = c1.getContext("2d");
    const W = c1.width, H = c1.height;
    ctx.clearRect(0, 0, W, H);
    const pts = s.intradayCurve;
    const padL = 42, padR = 20, padT = 16, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxP = Math.max(...pts.map(p => Math.max(p.callPrice, p.putPrice)), 10) * 1.1;

    ctx.font = "10px Consolas, monospace";
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i / 3);
      ctx.strokeStyle = "#1e293b";
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "right";
      ctx.fillText(Math.round(maxP * (1 - i / 3)), padL - 5, y + 3);
    }

    const xOf = i => padL + (i / Math.max(1, pts.length - 1)) * plotW;
    const yOf = v => padT + plotH - (v / maxP) * plotH;

    // Call Price Line (Red)
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(p.callPrice)) : ctx.lineTo(xOf(i), yOf(p.callPrice)));
    ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2.2; ctx.stroke();

    // Put Price Line (Blue)
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(p.putPrice)) : ctx.lineTo(xOf(i), yOf(p.putPrice)));
    ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 2.2; ctx.stroke();

    pts.forEach((p, i) => {
      if (i % 3 === 0 || i === pts.length - 1) {
        ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center";
        ctx.fillText(p.time, xOf(i), H - 7);
      }
    });
  }

  // Draw 7-Day Weekly OI Curve
  const c2 = document.getElementById("strikeWeeklyCanvas");
  if (c2) {
    const ctx = c2.getContext("2d");
    const W = c2.width, H = c2.height;
    ctx.clearRect(0, 0, W, H);
    const pts = s.weeklyCurve;
    const padL = 48, padR = 20, padT = 16, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxO = Math.max(...pts.map(p => Math.max(p.callOi, p.putOi)), 500) * 1.1;

    ctx.font = "10px Consolas, monospace";
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i / 3);
      ctx.strokeStyle = "#1e293b";
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "right";
      ctx.fillText(fmtNum(Math.round(maxO * (1 - i / 3))), padL - 5, y + 3);
    }

    const xOf = i => padL + (i / Math.max(1, pts.length - 1)) * plotW;
    const yOf = v => padT + plotH - (v / maxO) * plotH;

    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(p.callOi)) : ctx.lineTo(xOf(i), yOf(p.callOi)));
    ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2.2; ctx.stroke();

    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(p.putOi)) : ctx.lineTo(xOf(i), yOf(p.putOi)));
    ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 2.2; ctx.stroke();

    pts.forEach((p, i) => {
      ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center";
      ctx.fillText(p.day, xOf(i), H - 7);
    });
  }
}

// ============================================================================
// Tab 3: 盤勢回顧與 1分 / 5分 / 15分 K 線逐步復盤模擬演練 (op-win.com Feature #3)
// ============================================================================
function renderReplayTab() {
  if (!REPLAY_BARS.length) {
    REPLAY_BARS = generateIntradaySeries(getSessionConfig(), REPLAY_TIMEFRAME);
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
            💡 挑選特定日期並以 1分 / 5分 / 15分 K 線逐步推進，同步觀察下方 CP 差額三線圖與多空成本的轉折信號
          </div>
        </div>
        <div class="btn-group">
          <select class="select-input" onchange="onSessionChange(this.value)">
            ${MARKET_SESSIONS.map(s => `<option value="${s.id}" ${s.id === CURRENT_SESSION_ID ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join("")}
          </select>
          <button class="btn ${REPLAY_TIMEFRAME === 1 ? 'active' : ''}" onclick="changeReplayTimeframe(1)">1分K</button>
          <button class="btn ${REPLAY_TIMEFRAME === 5 ? 'active' : ''}" onclick="changeReplayTimeframe(5)">5分K</button>
          <button class="btn ${REPLAY_TIMEFRAME === 15 ? 'active' : ''}" onclick="changeReplayTimeframe(15)">15分K</button>
        </div>
      </div>

      <!-- Replay Controls Bar -->
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
          <input type="range" min="1" max="${REPLAY_BARS.length - 1}" value="${REPLAY_STEP}" style="flex:1" oninput="REPLAY_STEP=Number(this.value);updateReplayChartsOnly()">
        </div>

        <div class="btn-group">
          <button class="btn ${REPLAY_MODE === 'cp' ? 'active' : ''}" onclick="REPLAY_MODE='cp';updateReplayChartsOnly()">連動 CP 差額圖</button>
          <button class="btn ${REPLAY_MODE === 'major' ? 'active' : ''}" onclick="REPLAY_MODE='major';updateReplayChartsOnly()">連動 主散圖</button>
        </div>
      </div>

      <div id="replaySignalBanner" style="margin-bottom:12px;padding:10px 14px;background:rgba(37,99,235,0.14);border-left:4px solid var(--royal);border-radius:6px;font-size:0.83rem"></div>

      <!-- Top Canvas: K-Line + Bull/Bear Cost Lines -->
      <div class="chart-wrap" style="margin-bottom:12px">
        <div style="font-size:0.8rem;font-weight:700;color:#cbd5e1;margin-bottom:4px">📈 台指期 ${REPLAY_TIMEFRAME} 分 K 線圖 ＋ 紅線(多方成本) / 綠線(多空成本) / 藍線(短空成本)</div>
        <canvas id="replayKlineCanvas" width="1120" height="240"></canvas>
      </div>

      <!-- Bottom Canvas: Synchronized CP Spread / Major-Retail Chart -->
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
  REPLAY_BARS = generateIntradaySeries(getSessionConfig(), REPLAY_TIMEFRAME);
  REPLAY_STEP = Math.min(REPLAY_BARS.length - 1, Math.max(5, Math.floor(REPLAY_BARS.length * 0.45)));
  renderReplayTab();
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
    ctx.fillStyle = "#94a3b8"; ctx.textAlign = "right";
    ctx.fillText(fmtNum(v), padL - 8, y + 4);
  }

  // Draw Candlesticks
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

  // Overlay Cost Lines (Red Bull Cost, Green Mid Cost, Blue Bear Cost)
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
          <h2 class="section-h2">近日台指盤勢分析報告（量化模組解讀）</h2>
          <div style="font-size:0.78rem;color:var(--muted);margin-top:3px">結合技術面乖離、選擇權最大未平倉支撐壓力區與三大法人買賣方籌碼結構</div>
        </div>
        <select class="select-input" onchange="onSessionChange(this.value)">
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
              <td style="text-align:left;font-weight:700;color:#fff">成交量能</td>
              <td style="text-align:left;color:#38bdf8">高檔維持溫和攻擊量</td>
              <td style="text-align:left;color:#cbd5e1">${escapeHtml(rep.volumeNote)}</td>
            </tr>
            <tr>
              <td style="text-align:left;font-weight:700;color:#fff">期現貨價差</td>
              <td style="text-align:left;color:#fde047">期貨 ${fmtNum(cfg.txfClose)} / 現貨 ${fmtNum(cfg.spotClose)}</td>
              <td style="text-align:left;color:#cbd5e1">${escapeHtml(rep.spreadNote)}</td>
            </tr>
            <tr>
              <td style="text-align:left;font-weight:700;color:#fff">權值股動向</td>
              <td style="text-align:left;color:#4ade80">台積電、AI 權值股核心</td>
              <td style="text-align:left;color:#cbd5e1">${escapeHtml(rep.weightsNote)}</td>
            </tr>
            <tr>
              <td style="text-align:left;font-weight:700;color:#fff">選擇權支撐壓力區</td>
              <td style="text-align:left;color:#f87171">${fmtNum(chain.putWallStrike)} ~ ${fmtNum(chain.callWallStrike)}</td>
              <td style="text-align:left;color:#cbd5e1">下檔 ${fmtNum(chain.putWallStrike)} Put OI 地板支撐；上檔 ${fmtNum(chain.callWallStrike)} Call OI 天花板壓力，最大痛點 ${fmtNum(chain.maxPainStrike)}。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-bottom:18px">
        <div style="background:#090e1a;border:1px solid var(--border);border-top:3px solid var(--royal);border-radius:10px;padding:15px">
          <h4 style="margin:0 0 8px;color:#38bdf8">📈 技術面深度解析</h4>
          <p style="margin:0;font-size:0.88rem;color:#cbd5e1;line-height:1.65">${escapeHtml(rep.techView)}</p>
        </div>
        <div style="background:#090e1a;border:1px solid var(--border);border-top:3px solid #10b981;border-radius:10px;padding:15px">
          <h4 style="margin:0 0 8px;color:#34d399">🎯 籌碼面深度解析</h4>
          <p style="margin:0;font-size:0.88rem;color:#cbd5e1;line-height:1.65">${escapeHtml(rep.chipView)}</p>
        </div>
      </div>

      <h3 class="section-h2" style="margin-bottom:12px">當前操盤因應策略</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
        <div style="background:#131f35;border:1px solid var(--border);border-radius:10px;padding:14px">
          <div style="font-weight:800;color:#fff;margin-bottom:6px">📉 1. 低吸不追高（守支撐地板）</div>
          <div style="font-size:0.83rem;color:#cbd5e1">接近關鍵 Put 最大未平倉支撐區（${fmtNum(chain.putWallStrike)}）且短多成本紅線止穩時再建立偏多部位（SP 或看多價差），切忌衝高追價。</div>
        </div>
        <div style="background:#131f35;border:1px solid var(--border);border-radius:10px;padding:14px">
          <div style="font-weight:800;color:#fff;margin-bottom:6px">🌙 2. 留意夜盤避險與三線翻轉</div>
          <div style="font-size:0.83rem;color:#cbd5e1">美股波動加劇時，觀察 CP 差額綠線是否跌破零軸、以及藍線（Put）是否躍升至零軸上方（主力轉買 BP）。</div>
        </div>
        <div style="background:#131f35;border:1px solid var(--border);border-radius:10px;padding:14px">
          <div style="font-weight:800;color:#fff;margin-bottom:6px">🔄 3. 賣方雙收 vs 買方突破策略</div>
          <div style="font-size:0.83rem;color:#cbd5e1">當紅線 (Call) 與藍線 (Put) 皆在零軸之下（SC + SP），代表莊家鎖定區間收租；若單邊突破零軸則順勢跟進買方。</div>
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

      <!-- Interactive Payoff Simulator -->
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
  const minS = k - 500, maxS = k + 500;

  const pts = [];
  for (let s = minS; s <= maxS; s += 25) {
    let pnl = 0;
    if (PAYOFF_ACTION === "BC") pnl = Math.max(0, s - k) - prem;
    else if (PAYOFF_ACTION === "BP") pnl = Math.max(0, k - s) - prem;
    else if (PAYOFF_ACTION === "SC") pnl = prem - Math.max(0, s - k);
    else if (PAYOFF_ACTION === "SP") pnl = prem - Math.max(0, k - s);
    pts.push({ s, pnl });
  }

  const maxAbs = 400;
  const xOf = s => padL + ((s - minS) / (maxS - minS)) * plotW;
  const yOf = v => padT + plotH / 2 - (v / maxAbs) * (plotH / 2);

  // Zero line
  ctx.strokeStyle = "rgba(250, 204, 21, 0.5)";
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(padL, yOf(0)); ctx.lineTo(padL + plotW, yOf(0)); ctx.stroke();
  ctx.setLineDash([]);

  // Strike vertical line
  ctx.strokeStyle = "#334155";
  ctx.beginPath(); ctx.moveTo(xOf(k), padT); ctx.lineTo(xOf(k), padT + plotH); ctx.stroke();

  // Payoff curve
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
  refreshSessionData();
  renderRealtimeTab();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
});
