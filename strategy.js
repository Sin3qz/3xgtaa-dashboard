const fs = require("fs");

const STATE_FILE = "state.json";

const assets = [
  { name: "Nasdaq 100", symbol: "NQSE.DE", type: "NASDAQ" },
  { name: "EuroStoxx50", symbol: "LYSX.DE", type: "EU" },
  { name: "Emerging Markets", symbol: "EUNM.DE", type: "EM" },
  { name: "Bitcoin", symbol: "BTC-EUR", type: "BTC" },
  { name: "Bonds", symbol: "IUSV.DE", type: "BONDS" },
  { name: "Gold", symbol: "XAD1.DE", type: "GOLD" },
  { name: "WTI Oil", symbol: "ECRD.MI", type: "OIL" },
  { name: "USD/EUR", symbol: "USDEUR=X", type: "USDLONG" },
  { name: "EUR/USD", symbol: "EURUSD=X", type: "USDSHORT" }
];

async function fetchData(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3y&interval=1d&events=history`;

  const res = await fetch(url);
  const json = await res.json();

  if (!json.chart || !json.chart.result || !json.chart.result[0]) {
    throw new Error(`No data for ${symbol}`);
  }

  const result = json.chart.result[0];

  const timestamps = result.timestamp || [];

  const adjusted =
    result.indicators.adjclose &&
    result.indicators.adjclose[0] &&
    result.indicators.adjclose[0].adjclose;

  const close =
    result.indicators.quote[0].close;

  const values = adjusted || close;

  return timestamps
    .map((t, i) => {
      const value = values[i];

      if (value === null || value === undefined || Number.isNaN(value)) {
        return null;
      }

      return {
        date: new Date(t * 1000).toISOString().slice(0, 10),
        close: value
      };
    })
    .filter(Boolean);
}

function pct(a, b) {
  return ((a / b) - 1) * 100;
}

function sma(values, len) {
  const slice = values.slice(-len);
  return slice.reduce((a, b) => a + b, 0) / len;
}

function todayBerlinDate() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "Europe/Berlin"
    })
  );
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function yesterdayBerlinString() {
  const d = todayBerlinDate();
  d.setDate(d.getDate() - 1);
  return toDateString(d);
}

function lastWeekdayOnOrBefore(dateString) {
  const [year, month, day] =
    dateString.split("-").map(Number);

  const d =
    new Date(Date.UTC(year, month - 1, day));

  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }

  return toDateString(d);
}

function expectedFreshDateForAsset(asset) {
  const yesterday =
    yesterdayBerlinString();

  if (asset.type === "BTC") {
    return yesterday;
  }

  return lastWeekdayOnOrBefore(yesterday);
}

function subtractMonths(dateString, months) {
  const [year, month, day] =
    dateString.split("-").map(Number);

  const targetMonthIndex = month - 1 - months;

  const firstOfTarget =
    new Date(Date.UTC(year, targetMonthIndex, 1));

  const targetYear =
    firstOfTarget.getUTCFullYear();

  const targetMonth =
    firstOfTarget.getUTCMonth();

  const lastDayOfTargetMonth =
    new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  const safeDay =
    Math.min(day, lastDayOfTargetMonth);

  return toDateString(
    new Date(Date.UTC(targetYear, targetMonth, safeDay))
  );
}

function getPointOnOrBefore(points, targetDate) {
  const filtered =
    points.filter(p => p.date <= targetDate);

  if (filtered.length === 0) {
    return null;
  }

  return filtered[filtered.length - 1];
}

function getCleanPointsUntilYesterday(points) {
  const maxDate = yesterdayBerlinString();

  return points
    .filter(p => p.date <= maxDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function addFreshStatus(results) {
  return results.map(r => {
    const expectedDate =
      expectedFreshDateForAsset(r);

    return {
      ...r,
      expectedDate,
      fresh: r.currentDate >= expectedDate
    };
  });
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return null;
  }

  return JSON.parse(
    fs.readFileSync(STATE_FILE, "utf8")
  );
}

function saveState(state) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(state, null, 2)
  );
}

function isFirstBusinessDay(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  let d = new Date(Date.UTC(year, month, 1));

  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }

  return date.toISOString().slice(0, 10) ===
    d.toISOString().slice(0, 10);
}

function buildInvestments(results, previousPairType) {
  const eligible = results.filter(r => r.valid);
  const rawTop3 = eligible.slice(0, 3);

  const eu = eligible.find(r => r.type === "EU");
  const em = eligible.find(r => r.type === "EM");

  let forcedPair = null;

  if (previousPairType === "EU" && eu && em) {
    const emInTop3 =
      rawTop3.some(r => r.type === "EM");

    if (emInTop3 && eu.rank <= 4 && eu.valid) {
      forcedPair = eu;
    }
  }

  if (previousPairType === "EM" && eu && em) {
    const euInTop3 =
      rawTop3.some(r => r.type === "EU");

    if (euInTop3 && em.rank <= 4 && em.valid) {
      forcedPair = em;
    }
  }

  let selected = [];

  if (forcedPair) {
    selected.push(forcedPair);
  }

  for (const asset of eligible) {
    if (selected.length >= 3) break;
    if (selected.some(s => s.name === asset.name)) continue;

    const alreadyHasEU =
      selected.some(s => s.type === "EU");

    const alreadyHasEM =
      selected.some(s => s.type === "EM");

    if (asset.type === "EU" && alreadyHasEM) continue;
    if (asset.type === "EM" && alreadyHasEU) continue;

    selected.push(asset);
  }

  return selected.slice(0, 3);
}

function calculateAssetMetrics(asset, pointsRaw) {
  const points = getCleanPointsUntilYesterday(pointsRaw);

  if (!points || points.length < 220) {
    return null;
  }

  const currentPoint =
    points[points.length - 1];

  const current =
    currentPoint.close;

  const baseDate =
    currentPoint.date;

  const p1 =
    getPointOnOrBefore(points, subtractMonths(baseDate, 1));

  const p3 =
    getPointOnOrBefore(points, subtractMonths(baseDate, 3));

  const p6 =
    getPointOnOrBefore(points, subtractMonths(baseDate, 6));

  const p9 =
    getPointOnOrBefore(points, subtractMonths(baseDate, 9));

  if (!p1 || !p3 || !p6 || !p9) {
    return null;
  }

  const closes =
    points.map(p => p.close);

  const sma150 =
    sma(closes, 150);

  const sma20 =
    sma(closes, 20);

  const m1 =
    pct(current, p1.close);

  const m3 =
    pct(current, p3.close);

  const m6 =
    pct(current, p6.close);

  const m9 =
    pct(current, p9.close);

  const momentum =
    m1 + m3 + m6 + m9;

  const sma150Pct =
    pct(current, sma150);

  const sma20Pct =
    pct(sma20, sma150);

  return {
    name: asset.name,
    symbol: asset.symbol,
    type: asset.type,

    currentDate: baseDate,
    p1Date: p1.date,
    p3Date: p3.date,
    p6Date: p6.date,
    p9Date: p9.date,

    current,
    p1m: p1.close,
    p3m: p3.close,
    p6m: p6.close,
    p9m: p9.close,

    m1,
    m3,
    m6,
    m9,

    momentum,

    sma150Pct,
    sma20Pct,

    valid:
      momentum > 0 &&
      current > sma150 &&
      sma20 > sma150
  };
}

async function getTipsData() {
  const points =
    getCleanPointsUntilYesterday(await fetchData("IBC5.DE"));

  const closes =
    points.map(p => p.close);

  const current =
    closes.at(-1);

  const sma200 =
    sma(closes, 200);

  const sma200Pct =
    pct(current, sma200);

  return {
    symbol: "IBC5.DE",
    current,
    sma200,
    sma200Pct
  };
}

async function getSpyData() {
  const points =
    getCleanPointsUntilYesterday(await fetchData("IBCF.DE"));

  const closes =
    points.map(p => p.close);

  const current =
    closes.at(-1);

  const sma150 =
    sma(closes, 150);

  const sma150Pct =
    pct(current, sma150);

  return {
    symbol: "IBCF.DE",
    current,
    sma150,
    sma150Pct
  };
}

async function getGoldMacroData() {
  const points =
    getCleanPointsUntilYesterday(await fetchData("4GLD.DE"));

  const closes =
    points.map(p => p.close);

  const current =
    closes.at(-1);

  const sma150 =
    sma(closes, 150);

  const sma150Pct =
    pct(current, sma150);

  return {
    symbol: "4GLD.DE",
    current,
    sma150,
    sma150Pct
  };
}

async function run() {
  let results = [];

  for (const a of assets) {
    try {
      console.log(`Loading ${a.name}`);

      const rawPoints =
        await fetchData(a.symbol);

      const metrics =
        calculateAssetMetrics(a, rawPoints);

      if (!metrics) {
        console.log(`Not enough data: ${a.name}`);
        continue;
      }

      results.push(metrics);

    } catch (e) {
      console.log(`ERROR ${a.name}`);
      console.log(e.message);
    }
  }

  results.sort((a, b) =>
    b.momentum - a.momentum
  );

  results =
    results.map((r, idx) => ({
      ...r,
      rank: idx + 1
    }));

  results =
    addFreshStatus(results);

  const needsRetry =
    results.some(r => !r.fresh);

  const today =
    new Date();

  const state =
    loadState();

  let invested = [];
  let pairHolding =
    state?.pairHolding || null;

  const shouldRebalance =
    !state ||
    !state.invested ||
    state.invested.length === 0 ||
    isFirstBusinessDay(today);

  if (shouldRebalance) {
    const selected =
      buildInvestments(results, pairHolding);

    invested =
      selected.map(r => r.name);

    const selectedPair =
      selected.find(
        r =>
          r.type === "EU" ||
          r.type === "EM"
      );

    pairHolding =
      selectedPair
        ? selectedPair.type
        : null;

    saveState({
      lastRebalance: today.toISOString(),
      invested,
      pairHolding
    });

  } else {
    invested =
      state.invested || [];
  }

  results =
    results.map(r => ({
      ...r,
      invested: invested.includes(r.name)
    }));

  let tips = null;
  let spy = null;
  let goldMacro = null;

  try {
    tips = await getTipsData();
  } catch (e) {
    console.log("ERROR TIPS");
    console.log(e.message);
  }

  try {
    spy = await getSpyData();
  } catch (e) {
    console.log("ERROR SPY");
    console.log(e.message);
  }

  try {
    goldMacro = await getGoldMacroData();
  } catch (e) {
    console.log("ERROR GOLD");
    console.log(e.message);
  }

  const output = {
    updated: today.toISOString(),
    needsRetry,
    tips,
    spy,
    goldMacro,
    table: results,
    invested
  };

  fs.writeFileSync(
    "signals.json",
    JSON.stringify(output, null, 2)
  );

  await sendDiscord(results, tips, spy, goldMacro);

  console.log("DONE");
}

async function sendDiscord(results, tips, spy, goldMacro) {
  if (process.env.SKIP_DISCORD === "1") {
    console.log("SKIP DISCORD");
    return;
  }

  if (!process.env.GTAA_WEBHOOK) {
    console.log("NO WEBHOOK FOUND");
    return;
  }

  const tipsText = tips
    ? `TIPS: ${tips.sma200Pct >= 0 ? "+" : ""}${tips.sma200Pct.toFixed(2)}% ${tips.sma200Pct >= 0 ? "über SMA200" : "unter SMA200"}`
    : "TIPS: keine Daten";

  const spyText = spy
    ? `S&P500 (EUR hedged): ${spy.sma150Pct >= 0 ? "+" : ""}${spy.sma150Pct.toFixed(2)}% ${spy.sma150Pct >= 0 ? "über SMA150" : "unter SMA150"}`
    : "S&P500: keine Daten";

  const goldText = goldMacro
    ? `Gold: ${goldMacro.sma150Pct >= 0 ? "+" : ""}${goldMacro.sma150Pct.toFixed(2)}% ${goldMacro.sma150Pct >= 0 ? "über SMA150" : "unter SMA150"}`
    : "Gold: keine Daten";

  const lines =
    results.map(r => {
      const marker =
        r.invested ? "🔵" : "⚪";

      return (
        `${marker} #${r.rank} ${r.name}\n` +
        `Daten: ${r.fresh ? "✅" : "❌"} ${r.currentDate}\n` +
        `Momentum: ${r.momentum.toFixed(2)} | ` +
        `SMA150: ${r.sma150Pct.toFixed(2)} | ` +
        `SMA20>SMA150: ${r.sma20Pct.toFixed(2)}`
      );
    }).join("\n\n");

  await fetch(
    process.env.GTAA_WEBHOOK,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content:
          `📊 GTAA Signale\n\n` +
          `${tipsText}\n` +
          `${spyText}\n` +
          `${goldText}\n\n` +
          `${lines}\n\n` +
          `🔵 = investiert`
      })
    }
  );
}

run();
