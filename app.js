async function load() {
  const res = await fetch("signals.json");
  const data = await res.json();

  const table = document.getElementById("table");
  table.innerHTML = "";

  data.forEach(d => {
    table.innerHTML += `
      <tr>
        <td>${d.name}</td>
        <td>${d.price.toFixed(2)}</td>
        <td>${(d.momentum*100).toFixed(2)}%</td>
        <td>${d.sma150.toFixed(2)}</td>
        <td>${d.smaCheck ? "✅" : "❌"}</td>
        <td>${d.valid ? "VALID" : "OUT"}</td>
        <td>${d.rank}</td>
      </tr>
    `;
  });
}

load();
