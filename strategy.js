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
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2y&interval=1d&events=history`;

  const res =
    await fetch(url);

  const json =
    await res.json();

  if (!json.chart || !json.chart.result || !json.chart.result[0]) {
    throw new Error(`No data for ${symbol}`);
  }

  const result =
    json.chart.result[0];

  const adjusted =
    result.indicators.adjclose &&
    result.indicators.adjclose[0] &&
    result.indicators.adjclose[0].adjclose;

  const close =
    result.indicators.quote[0].close;

  return (adjusted || close)
    .filter(v => v !== null);
}

function pct(a, b) {
  return ((a / b) - 1) * 100;
}

function sma(p, len) {

  const slice =
    p.slice(-len);

  return slice.reduce((a, b) => a + b, 0) / len;
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

  const year =
    date.getUTCFullYear();

  const month =
    date.getUTCMonth();

  let d =
    new Date(Date.UTC(year, month, 1));

  while (
    d.getUTCDay() === 0 ||
    d.getUTCDay() === 6
  ) {
    d.setUTCDate(d.getUTCDate() + 1);
  }

  return (
    date.toISOString().slice(0, 10) ===
    d.toISOString().slice(0, 10)
  );
}

function buildInvestments(results, previousPairType) {

  const eligible =
    results.filter(r => r.valid);

  const rawTop3 =
    eligible.slice(0, 3);

  const eu =
    eligible.find(r => r.type === "EU");

  const em =
    eligible.find(r => r.type === "EM");

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

    if (selected.length >= 3) {
      break;
    }

    if (selected.some(s => s.name === asset.name)) {
      continue;
    }

    const alreadyHasEU =
      selected.some(s => s.type === "EU");

    const alreadyHasEM =
      selected.some(s => s.type === "EM");

    if (asset.type === "EU" && alreadyHasEM) {
      continue;
    }

    if (asset.type === "EM" && alreadyHasEU) {
      continue;
    }

    selected.push(asset);
  }

  return selected.slice(0, 3);
}

async function getTipsData() {

  const prices =
    await fetchData("ITPS.DE");

  const current =
    prices.at(-1);

  const sma200 =
    sma(prices, 200);

  const sma200Pct =
    ((current / sma200) - 1) * 100;

  return {
    symbol: "ITPS.DE",
    current,
    sma200,
    sma200Pct
  };
}

async function getSpyData() {

  const prices =
    await fetchData("IBCF.DE");

  const current =
    prices.at(-1);

  const sma150 =
    sma(prices, 150);

  const sma150Pct =
    ((current / sma150) - 1) * 100;

  return {
    symbol: "IBCF.DE",
    current,
    sma150,
    sma150Pct
  };
}

async function getGoldMacroData() {

  const prices =
    await fetchData("4GLD.DE");

  const current =
    prices.at(-1);

  const sma150 =
    sma(prices, 150);

  const sma150Pct =
    ((current / sma150) - 1) * 100;

  return {
    symbol: "4GLD.DE",
    current,
    sma150,
    sma150Pct
  };
}
