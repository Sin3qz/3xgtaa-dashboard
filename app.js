async function loadSignals() {

  const response =
    await fetch("signals.json");

  const data =
    await response.json();

  const tbody =
    document.querySelector("#rankingTable tbody");

  tbody.innerHTML = "";

  data.results.forEach(asset => {

    const tr =
      document.createElement("tr");

    if (asset.slot === 1) {
      tr.classList.add("top1");
    }

    if (asset.slot === 2 || asset.slot === 3) {
      tr.classList.add("top2");
    }

    tr.innerHTML = `
      <td>${asset.rank}</td>
      <td>${asset.name}</td>
      <td>${asset.momentum.toFixed(2)}</td>
      <td>${asset.sma150Pct.toFixed(2)}</td>
      <td>${asset.sma20Pct.toFixed(2)}</td>
    `;

    tbody.appendChild(tr);

  });

  const historyBody =
    document.querySelector("#historyTable tbody");

  historyBody.innerHTML = "";

  data.history.forEach(h => {

    const tr =
      document.createElement("tr");

    tr.innerHTML = `
      <td>${h.date}</td>
      <td>${h.invested.join(", ")}</td>
    `;

    historyBody.appendChild(tr);

  });

  document.getElementById("tipsBox").innerHTML =
    `
      <strong>TIPS</strong><br>
      ${data.tips.sma200Pct >= 0 ? "+" : ""}
      ${data.tips.sma200Pct.toFixed(2)}%
    `;

  document.getElementById("spyBox").innerHTML =
    `
      <strong>S&P500 (EUR hedged)</strong><br>
      ${data.spy.sma150Pct >= 0 ? "+" : ""}
      ${data.spy.sma150Pct.toFixed(2)}%
    `;

  document.getElementById("goldBox").innerHTML =
    `
      <strong>Gold</strong><br>
      ${data.gold.sma150Pct >= 0 ? "+" : ""}
      ${data.gold.sma150Pct.toFixed(2)}%
    `;

  const lastUpdate =
    document.getElementById("lastUpdate");

  if (data.updated && lastUpdate) {

    const date =
      new Date(data.updated);

    lastUpdate.innerHTML =
      "Letzte erfolgreiche Signalaktualisierung: " +
      date.toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        dateStyle: "medium",
        timeStyle: "short"
      }) +
      " Uhr";
  }
}

loadSignals();
