async function load() {

  const res =
    await fetch("signals.json");

  const data =
    await res.json();

  const table =
    document.getElementById("table");

  const prices =
    document.getElementById("prices");

  const tipsBox =
    document.getElementById("tipsBox");

  const lastUpdate =
    document.getElementById("lastUpdate");

  table.innerHTML = "";
  prices.innerHTML = "";
  tipsBox.innerHTML = "";

  // LETZTES UPDATE

  if (data.updated && lastUpdate) {

    const date =
      new Date(data.updated);

    const datum =
      date.toLocaleDateString(
        "de-DE",
        {
          timeZone: "Europe/Berlin"
        }
      );

    const uhrzeit =
      date.toLocaleTimeString(
        "de-DE",
        {
          timeZone: "Europe/Berlin",
          hour: "2-digit",
          minute: "2-digit"
        }
      );

    lastUpdate.innerHTML = `
      <b>Letztes Update:</b>
      Datum: ${datum}
      |
      Uhrzeit: ${uhrzeit}
    `;
  }

  // TIPS
  if (data.tips) {

    tipsBox.innerHTML += `

      <div class="tips-title">
        TIPS (EUR hedged)
      </div>

      <div class="${
        data.tips.sma200Pct >= 0
          ? "green"
          : "red"
      }">

        ${
          data.tips.sma200Pct >= 0
            ? "+"
            : ""
        }

        ${data.tips.sma200Pct.toFixed(2)}%

        ${
          data.tips.sma200Pct >= 0
            ? "über SMA200"
            : "unter SMA200"
        }

      </div>
    `;
  }

  // SP500 EUR
  if (data.spy) {

    tipsBox.innerHTML += `

      <br>

      <div class="tips-title">
        S&P500 (EUR hedged)
      </div>

      <div class="${
        data.spy.sma150Pct >= 0
          ? "green"
          : "red"
      }">

        ${
          data.spy.sma150Pct >= 0
            ? "+"
            : ""
        }

        ${data.spy.sma150Pct.toFixed(2)}%

        ${
          data.spy.sma150Pct >= 0
            ? "über SMA150"
            : "unter SMA150"
        }

      </div>
    `;
  }

  // GOLD
  if (data.goldMacro) {

    tipsBox.innerHTML += `

      <br>

      <div class="tips-title">
        Gold (EUR)
      </div>

      <div class="${
        data.goldMacro.sma150Pct >= 0
          ? "green"
          : "red"
      }">

        ${
          data.goldMacro.sma150Pct >= 0
            ? "+"
            : ""
        }

        ${data.goldMacro.sma150Pct.toFixed(2)}%

        ${
          data.goldMacro.sma150Pct >= 0
            ? "über SMA150"
            : "unter SMA150"
        }

      </div>
    `;
  }

  // Dashboard
  data.table.forEach(d => {

    let rowClass = "";

    if (d.invested) {
      rowClass = "invested";
    }

    table.innerHTML += `

      <tr class="${rowClass}">

        <td>${d.rank}</td>

        <td>${d.name}</td>

        <td class="${
          d.m1 >= 0
            ? "green"
            : "red"
        }">
          ${d.m1.toFixed(2)}
        </td>

        <td class="${
          d.m3 >= 0
            ? "green"
            : "red"
        }">
          ${d.m3.toFixed(2)}
        </td>

        <td class="${
          d.m6 >= 0
            ? "green"
            : "red"
        }">
          ${d.m6.toFixed(2)}
        </td>

        <td class="${
          d.m9 >= 0
            ? "green"
            : "red"
        }">
          ${d.m9.toFixed(2)}
        </td>

        <td class="${
          d.momentum >= 0
            ? "green"
            : "red"
        }">
          ${d.momentum.toFixed(2)}
        </td>

        <td class="${
          d.sma150Pct >= 0
            ? "green"
            : "red"
        }">
          ${d.sma150Pct.toFixed(2)}
        </td>

        <td class="${
          d.sma20Pct >= 0
            ? "green"
            : "red"
        }">
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

  // Makro-Tabelle

  if (data.tips) {

    prices.innerHTML += `

      <tr>

        <td>TIPS (EUR hedged)</td>

        <td>-</td>
        <td>-</td>
        <td>-</td>

        <td>
          SMA200:
          ${data.tips.sma200.toFixed(2)}
        </td>

        <td>
          ${data.tips.current.toFixed(2)}
        </td>

      </tr>
    `;
  }

  if (data.spy) {

    prices.innerHTML += `

      <tr>

        <td>S&P500 (EUR)</td>

        <td>-</td>
        <td>-</td>
        <td>-</td>

        <td>
          SMA150:
          ${data.spy.sma150.toFixed(2)}
        </td>

        <td>
          ${data.spy.current.toFixed(2)}
        </td>

      </tr>
    `;
  }

  if (data.goldMacro) {

    prices.innerHTML += `

      <tr>

        <td>Gold (EUR)</td>

        <td>-</td>
        <td>-</td>
        <td>-</td>

        <td>
          SMA150:
          ${data.goldMacro.sma150.toFixed(2)}
        </td>

        <td>
          ${data.goldMacro.current.toFixed(2)}
        </td>

      </tr>
    `;
  }
}

load();
