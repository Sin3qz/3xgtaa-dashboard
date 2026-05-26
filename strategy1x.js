const fs = require("fs");

const assets = [
  { name: "Nasdaq 100", symbol: "XNAS.DE", type: "NASDAQ" },
  { name: "EM Small Caps", symbol: "SPYX.DE", type: "EMSC" },
  { name: "EMU Value", symbol: "AW1T.DE", type: "VALUE" },
  {
    name: "Bonds",
    symbol: "SXRM.DE",
    type: "BONDS",
    convertUsdToEur: true
  },
  { name: "Gold", symbol: "4GLD.DE", type: "GOLD" },
  { name: "Rohstoffe", symbol: "UEQU.DE", type: "COMMODITIES" },
  {
    name: "USD Overnight Rate",
    symbol: "FEDF.MI",
    type: "CASHUSD"
  }
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

function convertUsdSeriesToEur(
  usdPrices,
  usdEurPrices
) {

  const minLength =
    Math.min(
      usdPrices.length,
      usdEurPrices.length
    );

  const usd =
    usdPrices.slice(-minLength);

  const fx =
    usdEurPrices.slice(-minLength);

  return usd.map((price, i) =>
    price * fx[i]
  );
}

async function getTipsData() {

  const prices =
    await fetchData("TI5G.L");

  const current =
    prices.at(-1);

  const sma200 =
    sma(prices, 200);

  const sma200Pct =
    ((current / sma200) - 1) * 100;

  return {
    symbol: "TI5G.L",
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

async function run() {

  let results = [];

  const usdEurPrices =
    await fetchData("USDEUR=X");

  for (const a of assets) {

    try {

      console.log(`Loading ${a.name}`);

      let prices =
        await fetchData(a.symbol);

      // Bonds USD → EUR
      if (a.convertUsdToEur) {

        prices =
          convertUsdSeriesToEur(
            prices,
            usdEurPrices
          );
      }

      if (!prices || prices.length < 200) {
        continue;
      }

      const i =
        prices.length - 1;

      const current =
        prices[i];

      const m1 =
        pct(current, prices[i - 21]);

      const m3 =
        pct(current, prices[i - 63]);

      const m6 =
        pct(current, prices[i - 126]);

      const m9 =
        pct(current, prices[i - 189]);

      const momentum =
        m1 + m3 + m6 + m9;

      const sma150 =
        sma(prices, 150);

      const sma20 =
        sma(prices, 20);

      const sma150Pct =
        pct(current, sma150);

      const sma20Pct =
        pct(sma20, sma150);

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

  results.sort((a, b) =>
    b.momentum - a.momentum
  );

  results = results.map((r, idx) => ({
    ...r,
    rank: idx + 1
  }));

  const invested =
    results
      .filter(r => r.valid)
      .slice(0, 2)
      .map(r => r.name);

  results = results.map(r => ({
    ...r,
    invested:
      invested.includes(r.name),

    slot:
      invested.indexOf(r.name) + 1
  }));

  let tips = null;
  let spy = null;
  let goldMacro = null;

  try {
    tips =
      await getTipsData();
  } catch (e) {
    console.log("ERROR TIPS");
  }

  try {
    spy =
      await getSpyData();
  } catch (e) {
    console.log("ERROR SPY");
  }

  try {
    goldMacro =
      await getGoldMacroData();
  } catch (e) {
    console.log("ERROR GOLD");
  }

  const output = {

    updated:
      new Date().toISOString(),

    tips,
    spy,
    goldMacro,

    table: results,

    invested
  };

  fs.writeFileSync(
    "signals1x.json",
    JSON.stringify(output, null, 2)
  );

  await sendDiscord(
    results,
    tips,
    spy,
    goldMacro
  );

  console.log("DONE 1xGTAA");
}

async function sendDiscord(
  results,
  tips,
  spy,
  goldMacro
) {

  if (!process.env.GTAA_WEBHOOK) {
    console.log("NO WEBHOOK FOUND");
    return;
  }

  const tipsText =
    tips
      ? `TIPS: ${tips.sma200Pct >= 0 ? "+" : ""}${tips.sma200Pct.toFixed(2)}% ${tips.sma200Pct >= 0 ? "über SMA200" : "unter SMA200"}`
      : "TIPS: keine Daten";

  const spyText =
    spy
      ? `SPY: ${spy.sma150Pct >= 0 ? "+" : ""}${spy.sma150Pct.toFixed(2)}% ${spy.sma150Pct >= 0 ? "über SMA150" : "unter SMA150"}`
      : "SPY: keine Daten";

  const goldText =
    goldMacro
      ? `Gold: ${goldMacro.sma150Pct >= 0 ? "+" : ""}${goldMacro.sma150Pct.toFixed(2)}% ${goldMacro.sma150Pct >= 0 ? "über SMA150" : "unter SMA150"}`
      : "Gold: keine Daten";

  const lines =
    results.map(r => {

      const marker =
        r.slot === 1
          ? "🔹"
          : r.slot === 2
            ? "🔵"
            : "⚪";

      return (
        `${marker} #${r.rank} ${r.name}\n` +
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
          `📊 1xGTAA Signale\n\n` +
          `${tipsText}\n` +
          `${spyText}\n` +
          `${goldText}\n\n` +
          `${lines}\n\n` +
          `🔹 = Platz 1 investiert\n` +
          `🔵 = Platz 2 investiert`
      })
    }
  );
}

run();
