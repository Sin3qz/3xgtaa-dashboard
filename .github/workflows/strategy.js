const fs = require("fs");

// Yahoo Finance API
async function fetchData(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d`;
  const res = await fetch(url);
  const json = await res.json();

  return json.chart.result[0].indicators.quote[0].close;
}

// Assets (einfach & stabil)
const assets = [
  { name: "Nasdaq", symbol: "^NDX" },
  { name: "EuroStoxx50", symbol: "^STOXX50E" },
  { name: "Gold", symbol: "GC=F" },
  { name: "Oil", symbol: "CL=F" },
  { name: "Bitcoin", symbol: "BTC-EUR" }
];

function pct(a, b) {
  return a / b - 1;
}

function momentum(p) {
  const i = p.length - 1;

  return (
    pct(p[i], p[i - 21]) +   // 1M
    pct(p[i], p[i - 63]) +   // 3M
    pct(p[i], p[i - 126]) +  // 6M
    pct(p[i], p[i - 189])    // 9M
  );
}

function sma(p, len) {
  const slice = p.slice(-len);
  return slice.reduce((a, b) => a + b, 0) / len;
}

async function run() {
  let results = [];

  for (let a of assets) {
    const prices = await fetchData(a.symbol);

    const m = momentum(prices);
    const sma150 = sma(prices, 150);
    const sma5 = sma(prices, 5);
    const price = prices.at(-1);

    results.push({
      name: a.name,
      price,
      momentum: m,
      sma150,
      smaCheck: sma5 > sma150,
      valid: m > 0 && price > sma150
    });
  }

  // Ranking
  let valid = results.filter(r => r.valid);
  valid.sort((a, b) => b.momentum - a.momentum);
  const top3 = valid.slice(0, 3);

  results = results.map(r => {
    const rank = top3.findIndex(t => t.name === r.name);
    return { ...r, rank: rank >= 0 ? rank + 1 : "-" };
  });

  fs.writeFileSync("signals.json", JSON.stringify(results, null, 2));

  await sendDiscord(top3);
}

async function sendDiscord(top3) {
  if (!process.env.DISCORD_WEBHOOK) return;

  await fetch(process.env.DISCORD_WEBHOOK, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      content: "📊 GTAA Daily Signals",
      embeds: [{
        title: "Top 3 Assets",
        description: top3.map(t =>
          `#${t.rank} ${t.name} (${(t.momentum*100).toFixed(2)}%)`
        ).join("\n")
      }]
    })
  });
}

run();
