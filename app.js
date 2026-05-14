async function load() {

  const res = await fetch("signals.json");
  const data = await res.json();

  const table = document.getElementById("table");

  table.innerHTML = "";

  data.table.forEach(d => {

    table.innerHTML += `
      <tr>
        <td>${d.rank}</td>
        <td>${d.name}</td>
        <td>${d.price.toFixed(2)}</td>
        <td>${(d.momentum * 100).toFixed(2)}%</td>
        <td>${d.price > d.sma150 ? "✅" : "❌"}</td>
        <td>${d.smaCheck ? "✅" : "❌"}</td>
        <td>${d.valid ? "VALID" : "OUT"}</td>
      </tr>
    `;
  });

}

load();
