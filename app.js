async function load() {

  const res = await fetch("signals.json");
  const data = await res.json();

  const table = document.getElementById("table");
  const prices = document.getElementById("prices");

  table.innerHTML = "";
  prices.innerHTML = "";

  data.table.forEach(d => {

    let rowClass = "";

    if (d.invested) {
      rowClass = "invested";
    }

    if (d.excludedEM) {
      rowClass = "excluded";
    }

    table.innerHTML += `
      <tr class="${rowClass}">
        <td>${d.rank}</td>
        <td>${d.name}</td>

        <td class="${d.m1 >= 0 ? 'green' : 'red'}">
          ${d.m1.toFixed(2)}
        </td>

        <td class="${d.m3 >= 0 ? 'green' : 'red'}">
          ${d.m3.toFixed(2)}
        </td>

        <td class="${d.m6 >= 0 ? 'green' : 'red'}">
          ${d.m6.toFixed(2)}
        </td>

        <td class="${d.m9 >= 0 ? 'green' : 'red'}">
          ${d.m9.toFixed(2)}
        </td>

        <td class="${d.momentum >= 0 ? 'green' : 'red'}">
          ${d.momentum.toFixed(2)}
        </td>

        <td class="${d.sma150Pct >= 0 ? 'green' : 'red'}">
          ${d.sma150Pct.toFixed(2)}
        </td>

        <td class="${d.sma20Pct >= 0 ? 'green' : 'red'}">
          ${d.sma20Pct.toFixed(2)}
        </td>
      </tr>
    `;

    prices.innerHTML += `
      <tr>
        <td>${d.name}</td>
        <td>${d.p1m.toFixed(2)}</td>
        <td>${d.p3m.toFixed(2)}</td>
        <td>${d.p6m.toFixed(2)}</td>
        <td>${d.p9m.toFixed(2)}</td>
        <td>${d.current.toFixed(2)}</td>
      </tr>
    `;
  });
}

load();
