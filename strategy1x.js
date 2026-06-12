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

function valuesChanged(a, b) {
  if (!a || !b) {
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

  return fields.some(field =>
    Math.abs(a[field] - b[field]) > 0.000001
  );
}

function macroValuesChanged(a, b) {
  if (!a || !b) {
    return false;
  }

  const fields = [
    "current",
    "sma",
    "smaPct"
  ];

  return fields.some(field =>
    Math.abs(a[field] - b[field]) > 0.000001
  );
}

function calculateMetricsAtIndex(asset, points, index) {
  const currentPoint =
    points[index];

  const usablePoints =
    points.slice(0, index + 1);

  const current =
    currentPoint.close;

  const baseDate =
    currentPoint.date;

  const p1 =
    getPointOnOrBefore(usablePoints, subtractMonths(baseDate, 1));

  const p3 =
    getPointOnOrBefore(usablePoints, subtractMonths(baseDate, 3));

  const p6 =
    getPointOnOrBefore(usablePoints, subtractMonths(baseDate, 6));

  const p9 =
    getPointOnOrBefore(usablePoints, subtractMonths(baseDate, 9));

  if (!p1 || !p3 || !p6 || !p9) {
    return null;
  }

  const closes =
    usablePoints.map(p => p.close);

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

function calculateAssetMetrics(asset, pointsRaw) {
  const points =
    getCleanPointsUntilYesterday(pointsRaw);

  if (!points || points.length < 220) {
    return null;
  }

  const currentMetrics =
    calculateMetricsAtIndex(asset, points, points.length - 1);

  const previousMetrics =
    calculateMetricsAtIndex(asset, points, points.length - 2);

  if (!currentMetrics) {
    return null;
  }

  const valueChanged =
    valuesChanged(currentMetrics, previousMetrics);

  return {
    ...currentMetrics,
    previousDate: previousMetrics ? previousMetrics.currentDate : null,
    valueChanged
  };
}

function addFreshStatus(results) {
  return results.map(r => {
    const expectedDate =
      expectedFreshDateForAsset(r);

    const plausibleDate =
      r.currentDate >= expectedDate;

    return {
      ...r,
      expectedDate,
      plausibleDate,
      fresh: plausibleDate && r.valueChanged
    };
  });
}

function calculateMacroMetrics(pointsRaw, smaLength) {
  const points =
    getCleanPointsUntilYesterday(pointsRaw);

  if (!points || points.length < smaLength + 2) {
    return null;
  }

  const currentPoint =
    points.at(-1);

  const previousPoint =
    points.at(-2);

  const currentCloses =
    points.map(p => p.close);

  const previousCloses =
    points.slice(0, -1).map(p => p.close);

  const current =
    currentPoint.close;

  const previous =
    previousPoint.close;

  const currentSma =
    sma(currentCloses, smaLength);

  const previousSma =
    sma(previousCloses, smaLength);

  const currentPct =
    pct(current, currentSma);

  const previousPct =
    pct(previous, previousSma);

  const currentMetrics = {
    current,
    sma: currentSma,
    smaPct: currentPct
  };

  const previousMetrics = {
    current: previous,
    sma: previousSma,
    smaPct: previousPct
  };

  return {
    currentDate: currentPoint.date,
    previousDate: previousPoint.date,
    current,
    sma: currentSma,
    smaPct: currentPct,
    valueChanged: macroValuesChanged(currentMetrics, previousMetrics)
  };
}

function addFreshStatusToMacro(macro, type) {
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

  return {
    ...macro,
    expectedDate,
    plausibleDate,
    fresh: plausibleDate && macro.valueChanged
  };
}

async function getTipsData() {
  const metrics =
    calculateMacroMetrics(
      await fetchData("IBC5.DE"),
      200
    );

  if (!metrics) {
    return null;
  }

  return {
    symbol: "IBC5.DE",
    currentDate: metrics.currentDate,
    previousDate: metrics.previousDate,
    current: metrics.current,
    sma200: metrics.sma,
    sma200Pct: metrics.smaPct,
    valueChanged: metrics.valueChanged
  };
}

async function getSpyData() {
  const metrics =
    calculateMacroMetrics(
      await fetchData("IBCF.DE"),
      150
    );

  if (!metrics) {
    return null;
  }

  return {
    symbol: "IBCF.DE",
    currentDate: metrics.currentDate,
    previousDate: metrics.previousDate,
    current: metrics.current,
    sma150: metrics.sma,
    sma150Pct: metrics.smaPct,
    valueChanged: metrics.valueChanged
  };
}

async function getGoldMacroData() {
  const metrics =
    calculateMacroMetrics(
      await fetchData("4GLD.DE"),
      150
    );

  if (!metrics) {
    return null;
  }

  return {
    symbol: "4GLD.DE",
    currentDate: metrics.currentDate,
    previousDate: metrics.previousDate,
    current: metrics.current,
    sma150: metrics.sma,
    sma150Pct: metrics.smaPct,
    valueChanged: metrics.valueChanged
  };
}

async function run() {
  let results = [];

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
    addFreshStatus(results);

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
