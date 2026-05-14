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
  return (a / b - 1);
}

function momentum(p) {
  const i = p.length - 1;

  return (
    pct(p[i], p[i - 21]) +
    pct(p[i], p[i - 63]) +
    pct(p[i], p[i - 126]) +
    pct(p[i], p[i - 189])
  );
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

      const m = momentum(prices);
      const sma150 = sma(prices, 150);
      const sma5 = sma(prices, 5);
      const price = prices.at(-1);

      results.push({
        name: a.name,
        symbol: a.symbol,
        type: a.type,
        price,
        momentum: m,
        sma150,
        sma5,
        smaCheck: sma5 > sma150,
        valid: m > 0 && price > sma150
      });

    } catch (e) {
      console.log("ERROR:", a.name);
    }
  }

  // Nur gültige Assets
  let valid = results.filter(r => r.valid);

  // Sortierung Momentum
  valid.sort((a, b) => b.momentum - a.momentum);

  // EU vs EM Regel
  const hasEU = valid.find(v => v.type === "EU");
  const hasEM = valid.find(v => v.type === "EM");

  if (hasEU && hasEM) {

    if (hasEU.momentum >= hasEM.momentum) {
      valid = valid.filter(v => v.type !== "EM");
    } else {
      valid = valid.filter(v => v.type !== "EU");
    }
  }

  const top3 = valid.slice(0, 3);

  // Ranking eintragen
  results = results.map(r => {

    const rank = top3.findIndex(t => t.name === r.name);

    return {
      ...r,
      rank: rank >= 0 ? rank + 1 : "-"
    };
  });

  // Cash wenn weniger als 3
  const outOfMarket = top3.length < 3;

  const output = {
    updated: new Date().toISOString(),
    outOfMarket,
    top3,
    table: results
  };

  fs.writeFileSync(
    "signals.json",
    JSON.stringify(output, null, 2)
  );

  console.log("signals updated");

  await sendDiscord(top3, outOfMarket);

}

async function sendDiscord(top3, outOfMarket) {

  if (!process.env.GTAA_WEBHOOK) {
    console.log("No Discord webhook");
    return;
  }

  const text = top3.map((t, i) =>
    `#${i + 1} ${t.name} | Momentum ${(t.momentum * 100).toFixed(2)}%`
  ).join("\n");

  await fetch(process.env.GTAA_WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content:
        `📊 GTAA Daily Signals\n\n` +
        `${text}\n\n` +
        `${outOfMarket ? "⚠️ OUT OF MARKET / XEON" : "✅ INVESTED"}`
    })
  });

  console.log("discord sent");
}

run();
