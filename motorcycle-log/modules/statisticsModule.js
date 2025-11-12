// === modules/statisticsModule.js ===
export function renderStatisticsModule() {
  return `
  <section id="statisticsTab" class="tab-section">
    <h2>📈 統計分析</h2>
    <canvas id="expenseChart"></canvas>
    <canvas id="chargeChart"></canvas>
  </section>`;
}

export function setupStatisticsModuleEvents() {
  const ctx1 = document.getElementById("expenseChart");
  const ctx2 = document.getElementById("chargeChart");
  if (!ctx1 || !ctx2) return;

  const expenses = JSON.parse(localStorage.getItem("expenseRecords") || "[]");
  const charges = JSON.parse(localStorage.getItem("chargeRecords") || "[]");

  const expenseSummary = summarizeByMonth(expenses, "amount");
  const chargeSummary = summarizeByMonth(charges, "cost");

  new Chart(ctx1, {
    type: "bar",
    data: {
      labels: Object.keys(expenseSummary),
      datasets: [{
        label: "每月費用 (NT$)",
        data: Object.values(expenseSummary)
      }]
    }
  });

  new Chart(ctx2, {
    type: "line",
    data: {
      labels: Object.keys(chargeSummary),
      datasets: [{
        label: "每月充電花費 (NT$)",
        data: Object.values(chargeSummary),
        fill: true,
      }]
    }
  });
}

function summarizeByMonth(data, field) {
  const result = {};
  data.forEach(r => {
    const month = r.date?.slice(0, 7) || "未知";
    result[month] = (result[month] || 0) + Number(r[field] || 0);
  });
  return result;
}
