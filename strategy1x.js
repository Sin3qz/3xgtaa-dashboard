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

  if (
    asset.type === "BTC" ||
    asset.type === "USDLONG" ||
    asset.type === "USDSHORT" ||
    asset.symbol === "BTC-EUR" ||
    asset.symbol === "USDEUR=X" ||
    asset.symbol === "EURUSD=X"
  ) {
    return yesterday;
  }

  return lastWeekdayOnOrBefore(yesterday);
}

function subtractMonths(dateString, months) {
  const [year, month, day] =
    dateString.split("-").map(Number);

  const targetMonthIndex =
    month - 1 - months;

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
  const maxDate =
    yesterdayBerlinString();

  return points
    .filter(p => p.date <= maxDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function convertUsdSeriesToEur(usdPoints, fxPointsRaw) {
  const fxPoints =
    getCleanPointsUntilYesterday(fxPointsRaw);

  return usdPoints
    .map(p => {
      const fx =
        getPointOnOrBefore(fxPoints, p.date);

      if (!fx) {
        return null;
      }

      return {
        date: p.date,
        close: p.close * fx.close
      };
    })
    .filter(Boolean);
}

function loadPreviousOutput(fileName) {
  if (!fs.existsSync(fileName)) {
    return null;
  }

  try {
    return JSON.parse(
      fs.readFileSync(fileName, "utf8")
    );
  } catch (e) {
    return null;
  }
}

function hasMeaningfulChange(current, previous) {
  if (!previous) {
    return false;
  }

  const fields = [
    "current",
    "m1",
    "m3",
    "m6",
    "m9",
    "momentum",
    "sma150Pct",
    "sma20Pct"
  ];

  return fields.some(field => {
    if (
      typeof current[field] !== "number" ||
      typeof previous[field] !== "number"
    ) {
      return false;
    }

    return Math.abs(current[field] - previous[field]) > 0.000001;
  });
}

function hasMacroChange(current, previous) {
  if (!previous) {
    return false;
  }

  const fields = [
    "current",
    "sma200",
    "sma200Pct",
    "sma150",
    "sma150Pct"
  ];

  return fields.some(field => {
    if (
      typeof current[field] !== "number" ||
      typeof previous[field] !== "number"
    ) {
      return false;
    }

    return Math.abs(current[field] - previous[field]) > 0.000001;
  });
}

function addFreshStatus(results, previousOutput) {
  const previousTable =
    previousOutput && previousOutput.table
      ? previousOutput.table
      : [];

  return results.map(r => {
    const expectedDate =
      expectedFreshDateForAsset(r);

    const previous =
      previousTable.find(
        p =>
          p.symbol === r.symbol ||
          p.name === r.name
      );

    const plausibleDate =
      r.currentDate >= expectedDate;

    const valueChanged =
      hasMeaningfulChange(r, previous);

    return {
      ...r,
      expectedDate,
      valueChanged,
      fresh: plausibleDate || valueChanged
    };
  });
}

function addFreshStatusToMacro(macro, previousMacro, type) {
  if (!macro) {
    return macro;
  }

  const expectedDate =
    expectedFreshDateForAsset({
      symbol: macro.symbol,
      type
    });

  const plausibleDate =
    macro.currentDate >= expectedDate;

  const valueChanged =
    hasMacroChange(macro, previousMacro);

  return {
    ...macro,
    expectedDate,
    valueChanged,
    fresh: plausibleDate || valueChanged
  };
}

function calculateAssetMetrics(asset, pointsRaw) {
  const points =
    getCleanPointsUntilYesterday(pointsRaw);

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

  const currentPoint =
    points.at(-1);

  const closes =
    points.map(p => p.close);

  const current =
    currentPoint.close;

  const sma200 =
    sma(closes, 200);

  const sma200Pct =
    pct(current, sma200);

  return {
    symbol: "IBC5.DE",
    currentDate: currentPoint.date,
    current,
    sma200,
    sma200Pct
  };
}

async function getSpyData() {
  const points =
    getCleanPointsUntilYesterday(await fetchData("IBCF.DE"));

  const currentPoint =
    points.at(-1);

  const closes =
    points.map(p => p.close);

  const current =
    currentPoint.close;

  const sma150 =
    sma(closes, 150);

  const sma150Pct =
    pct(current, sma150);

  return {
    symbol: "IBCF.DE",
    currentDate: currentPoint.date,
    current,
    sma150,
    sma150Pct
  };
}

async function getGoldMacroData() {
  const points =
    getCleanPointsUntilYesterday(await fetchData("4GLD.DE"));

  const currentPoint =
    points.at(-1);

  const closes =
    points.map(p => p.close);

  const current =
    currentPoint.close;

  const sma150 =
    sma(closes, 150);

  const sma150Pct =
    pct(current, sma150);

  return {
    symbol: "4GLD.DE",
    currentDate: currentPoint.date,
    current,
    sma150,
    sma150Pct
  };
}

async function run() {
  let results = [];

  const previousOutput =
    loadPreviousOutput("signals1x.json");

  const usdEurRaw =
    await fetchData("USDEUR=X");

  for (const a of assets) {
    try {
      console.log(`Loading ${a.name}`);

      let rawPoints =
        await fetchData(a.symbol);

      if (a.convertUsdToEur) {
        rawPoints =
          convertUsdSeriesToEur(rawPoints, usdEurRaw);
      }

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
    addFreshStatus(results, previousOutput);

  const invested =
    results
      .filter(r => r.valid)
      .slice(0, 2)
      .map(r => r.name);

  results =
    results.map(r => ({
      ...r,
      invested: invested.includes(r.name),
      slot: invested.indexOf(r.name) + 1
    }));

  let tips = null;
  let spy = null;
  let goldMacro = null;

  try {
    tips = await getTipsData();
    tips = addFreshStatusToMacro(
      tips,
      previousOutput ? previousOutput.tips : null,
      "MACRO"
    );
  } catch (e) {
    console.log("ERROR TIPS");
    console.log(e.message);
  }

  try {
    spy = await getSpyData();
    spy = addFreshStatusToMacro(
      spy,
      previousOutput ? previousOutput.spy : null,
      "MACRO"
    );
  } catch (e) {
    console.log("ERROR SPY");
    console.log(e.message);
  }

  try {
    goldMacro = await getGoldMacroData();
    goldMacro = addFreshStatusToMacro(
      goldMacro,
      previousOutput ? previousOutput.goldMacro : null,
      "MACRO"
    );
  } catch (e) {
    console.log("ERROR GOLD");
    console.log(e.message);
  }

  const needsRetry =
    results.some(r => !r.fresh) ||
    (tips && !tips.fresh) ||
    (spy && !spy.fresh) ||
    (goldMacro && !goldMacro.fresh);

  const output = {
    updated: new Date().toISOString(),
    needsRetry,
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

  await sendDiscord(results);

  console.log("DONE 1xGTAA");
}

async function sendDiscord(results) {
  if (process.env.SKIP_DISCORD === "1") {
    console.log("SKIP DISCORD");
    return;
  }

  if (!process.env.GTAA_WEBHOOK) {
    console.log("NO WEBHOOK FOUND");
    return;
  }

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
          `📊 1xGTAA Signale\n\n` +
          `${lines}\n\n` +
          `🔹 = Platz 1 investiert\n` +
          `🔵 = Platz 2 investiert`
      })
    }
  );
}

run();
