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
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2y&interval=1d`;

  const res = await fetch(url);
  const json = await res.json();

  if (!json.chart || !json.chart.result || !json.chart.result[0]) {
    throw new Error(`No data for ${symbol}`);
  }

  return json.chart.result[0].indicators.quote[0].close
    .filter(v => v !== null);
}

function pct(a, b) {
  return ((a / b) - 1) * 100;
}

function sma(p, len) {
  const slice = p.slice(-len);
  return slice.reduce((a, b) => a + b, 0) / len;
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function isFirstBusinessDay(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  let d = new Date(Date.UTC(year, month, 1));

  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }

  return date.toISOString().slice(0, 10) === d.toISOString().slice(0, 10);
}

function buildInvestments(results, previousPairType) {
  const eligible = results.filter(r => r.valid);

  const rawTop3 = eligible.slice(0, 3);

  const eu = eligible.find(r => r.type === "EU");
  const em = eligible.find(r => r.type === "EM");

  let forcedPair = null;

  if (previousPairType === "EU" && eu && em) {
    const emInTop3 = rawTop3.some(r => r.type === "EM");

    if (emInTop3 && eu.rank <= 4 && eu.valid) {
      forcedPair = eu;
    }
  }

  if (previousPairType === "EM" && eu && em) {
    const euInTop3 = rawTop3.some(r => r.type === "EU");

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

    const alreadyHasEU = selected.some(s => s.type === "EU");
    const alreadyHasEM = selected.some(s => s.type === "EM");

    if (asset.type === "EU" && alreadyHasEM) continue;
    if (asset.type === "EM" && alreadyHasEU) continue;

    selected.push(asset);
  }

  return selected.slice(0, 3);
}

async function getTipsData() {
  const prices = await fetchData("TIP");

  const current = prices.at(-1);
  const sma200 = sma(prices, 200);
  const sma200Pct = ((current / sma200) - 1) * 100;

  return {
    symbol: "TIP",
    current,
    sma200,
    sma200Pct
  };
}

async function run() {
  let results = [];

  for (const a of assets) {
    try {
      console.log(`Loading ${a.name}`);

      const prices = await fetchData(a.symbol);

      if (!prices || prices.length < 200) {
        console.log(`Not enough data: ${a.name}`);
        continue;
      }

      const i = prices.length - 1;
      const current = prices[i];

      const m1 = pct(current, prices[i - 21]);
      const m3 = pct(current, prices[i - 63]);
      const m6 = pct(current, prices[i - 126]);
      const m9 = pct(current, prices[i - 189]);

      const momentum = m1 + m3 + m6 + m9;

      const sma150 = sma(prices, 150);
      const sma20 = sma(prices, 20);

      const sma150Pct = pct(current, sma150);
      const sma20Pct = pct(sma20, sma150);

      results.push({
        name: a.name,
        symbol: a.symbol,
        type: a.type,

        current,

        p1m: prices[i - 21],
        p3m: prices[i - 63],
        p6m: prices[i - 126],
        p9m: prices[i - 189],

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
      });

    } catch (e) {
      console.log(`ERROR ${a.name}`);
      console.log(e.message);
    }
  }

  results.sort((a, b) => b.momentum - a.momentum);

  results = results.map((r, idx) => ({
    ...r,
    rank: idx + 1
  }));

  const today = new Date();
  const state = loadState();

  let invested = [];
  let pairHolding = state?.pairHolding || null;

  const shouldRebalance =
    !state ||
    !state.invested ||
    state.invested.length === 0 ||
    isFirstBusinessDay(today);

  if (shouldRebalance) {
    const selected = buildInvestments(results, pairHolding);

    invested = selected.map(r => r.name);

    const selectedPair = selected.find(r => r.type === "EU" || r.type === "EM");
    pairHolding = selectedPair ? selectedPair.type : null;

    saveState({
      lastRebalance: today.toISOString(),
      invested,
      pairHolding
    });

  } else {
    invested = state.invested || [];
  }

  results = results.map(r => ({
    ...r,
    invested: invested.includes(r.name),
    excludedEM: false
  }));

  let tips = null;

  try {
    tips = await getTipsData();
  } catch (e) {
    console.log("ERROR TIPS");
    console.log(e.message);
  }

  const output = {
    updated: today.toISOString(),
    rebalanceToday: shouldRebalance,
    tips,
    table: results,
    invested
  };

  fs.writeFileSync(
    "signals.json",
    JSON.stringify(output, null, 2)
  );

  await sendDiscord(results, tips);

  console.log("DONE");
}

async function sendDiscord(results, tips) {
  console.log("Discord test started");

  if (!process.env.GTAA_WEBHOOK) {
    console.log("NO WEBHOOK FOUND");
    return;
  }

  const tipsText = tips
    ? `\n\nTIPS SMA200: ${tips.sma200.toFixed(2)} | Abstand: ${tips.sma200Pct.toFixed(2)}`
    : "";

  const lines = results.map(r => {
    const marker = r.invested ? "🔵" : "⚪";

    return (
      `${marker} #${r.rank} ${r.name}\n` +
      `Momentum: ${r.momentum.toFixed(2)} | ` +
      `SMA150: ${r.sma150Pct.toFixed(2)} | ` +
      `SMA20>SMA150: ${r.sma20Pct.toFixed(2)}`
    );
  }).join("\n\n");

  const response = await fetch(process.env.GTAA_WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content:
        `📊 GTAA Signale${tipsText}\n\n` +
        `${lines}\n\n` +
        `🔵 = investiert`
    })
  });

  console.log("Discord status:", response.status);
}

run();
