const fs = require("fs");

const assets = [
  { name: "Nasdaq 100", symbol: "NQSE.DE", type: "NASDAQ" },
  { name: "EuroStoxx50", symbol: "LYSX.DE", type: "EU" },
  { name: "Emerging Markets", symbol: "EUNM.DE", type: "EM" },
  { name: "Bitcoin", symbol: "BTC-EUR", type: "BTC" },
  { name: "Bonds", symbol: "IUSV.DE", type: "BONDS" },
  { name: "Gold", symbol: "GBSE.MI", type: "GOLD" },
  { name: "WTI Oil", symbol: "ECRD.MI", type: "OIL" },
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

  // Nach Momentum sortieren
  results.sort((a, b) => b.momentum - a.momentum);

  // Ranking vergeben
  results = results.map((r, idx) => ({
    ...r,
    rank: idx + 1
  }));

  // Nur gültige Assets
  let valid = results.filter(r => r.valid);

  // EM separat markieren
  let excludedEM = null;

  const em = valid.find(v => v.type === "EM");

  if (em) {
    excludedEM = em.name;
  }

  // Investments OHNE EM
  const investCandidates =
    valid.filter(v => v.type !== "EM");

  const invested =
    investCandidates
      .slice(0, 3)
      .map(v => v.name);

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

  console.log("Discord test started");

  if (!process.env.GTAA_WEBHOOK) {

    console.log("NO WEBHOOK FOUND");

    return;
  }

  const text =
    invested
      .map((a, i) => `#${i + 1} ${a}`)
      .join("\n");

  const response = await fetch(process.env.GTAA_WEBHOOK, {

    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({

      content:
        `📊 GTAA Signale\n\n${text}`
    })
  });

  console.log("Discord status:", response.status);
}

run();
