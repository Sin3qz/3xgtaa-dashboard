const fs = require("fs");

// Node 18+ hat fetch eingebaut → KEIN import nötig

async function fetchData(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d`;
  const res = await fetch(url);
  const json = await res.json();

  return json.chart.result[0].indicators.quote[0].close;
}

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

  for (let a of assets) {
    try {
      const prices = await fetchData(a.symbol);

      if (!prices || prices.length < 200) continue;

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

    } catch (e) {
      console.log("Error with", a.name);
    }
  }

  let valid = results.filter(r => r.valid);
  valid.sort((a, b) => b.momentum - a.momentum);
  const top3 = valid.slice(0, 3);

  results = results.map(r => {
    const rank = top3.findIndex(t => t.name === r.name);
    return { ...r, rank: rank >= 0 ? rank + 1 : "-" };
  });

  fs.writeFileSync("signals.json", JSON.stringify(results, null, 2));

  console.log("DONE");
}

run();
