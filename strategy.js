const fs = require("fs");

const assets = [
  { name: "Nasdaq 100", symbol: "^NDX", type: "NASDAQ" },
  { name: "EuroStoxx50", symbol: "^STOXX50E", type: "EU" },
  { name: "Emerging Markets", symbol: "EEM", type: "EM" },
  { name: "Bitcoin", symbol: "BTC-EUR", type: "BTC" },
  { name: "Gold", symbol: "GC=F", type: "GOLD" },
  { name: "Bonds", symbol: "TLT", type: "BONDS" },
  { name: "WTI Oil", symbol: "CL=F", type: "OIL" },
  { name: "USD/EUR", symbol: "USDEUR=X", type: "USDLONG" },
  { name: "EUR/USD", symbol: "EURUSD=X", type: "USDSHORT" }
];

async function fetchData(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2y&interval=1d`;

  const res = await fetch(url);
  const json = await res.json();

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

async function run() {

  let results = [];

  for (const a of assets) {

    try {

      const prices = await fetchData(a.symbol);

      if (!prices || prices.length < 200) continue;

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

        valid: momentum > 0 && current > sma150
      });

    } catch (e) {
      console.log("ERROR", a.name);
    }
  }

  // Momentum sortieren
  results.sort((a, b) => b.momentum - a.momentum);

  // Nummern vergeben
  results = results.map((r, idx) => ({
    ...r,
    rank: idx + 1
  }));

  // Nur gültige
  let valid = results.filter(r => r.valid);

  // EU vs EM Regel
  const eu = valid.find(v => v.type === "EU");
  const em = valid.find(v => v.type === "EM");

  let excludedEM = null;

  if (eu && em) {

    if (eu.momentum >= em.momentum) {
      excludedEM = em.name;
      valid = valid.filter(v => v.type !== "EM");
    } else {
      valid = valid.filter(v => v.type !== "EU");
    }
  }

  const invested = valid.slice(0, 3).map(v => v.name);

  results = results.map(r => ({
    ...r,
    invested: invested.includes(r.name),
    excludedEM: r.name === excludedEM
  }));

  const output = {
    updated: new Date().toISOString(),
    table: results,
    invested
  };

  fs.writeFileSync(
    "signals.json",
    JSON.stringify(output, null, 2)
  );

  await sendDiscord(invested);

  console.log("DONE");
}

async function sendDiscord(invested) {

  if (!process.env.GTAA_WEBHOOK) {
    console.log("No webhook");
    return;
  }

  const text = invested
    .map((a, i) => `#${i + 1} ${a}`)
    .join("\n");

  await fetch(process.env.GTAA_WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content:
        `📊 GTAA Signale\n\n${text}`
    })
  });
}

run();
