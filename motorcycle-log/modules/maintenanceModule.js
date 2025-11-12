// === modules/maintenanceModule.js ===
export function renderMaintenanceModule() {
  const records = JSON.parse(localStorage.getItem("maintenanceRecords") || "[]");
  return `
  <section id="maintenanceTab" class="tab-section">
    <div class="form-card">
      <h2>🧰 新增保養紀錄</h2>
      <form id="maintenanceForm">
        <div class="form-grid">
          <label>日期<input type="date" name="date" required></label>
          <label>里程數 (km)<input type="number" name="odo" step="1" required></label>
          <label>保養項目<input type="text" name="item" placeholder="例如：更換煞車皮" required></label>
          <label>備註<textarea name="note" rows="2" placeholder="選填"></textarea></label>
        </div>
        <button type="submit" class="primary-btn">➕ 新增保養紀錄</button>
      </form>
    </div>

    <div id="maintenanceListContainer">
      ${renderMaintenanceTable(records)}
    </div>
  </section>`;
}

function renderMaintenanceTable(data) {
  if (data.length === 0) return `<p class="empty">尚無保養紀錄</p>`;

  const rows = data.map((r, i) => `
    <tr>
      <td>${r.date}</td>
      <td>${r.odo}</td>
      <td>${r.item}</td>
      <td>${r.note || "-"}</td>
      <td><button class="delete-btn" data-index="${i}">刪除</button></td>
    </tr>`).join("");

  const cards = data.map((r, i) => `
    <div class="record-card">
      <div class="title">📅 ${r.date}</div>
      <div class="meta">🏍️ ${r.odo} km ｜ 🔧 ${r.item}</div>
      ${r.note ? `<div class="note">${r.note}</div>` : ""}
      <button class="delete-btn" data-index="${i}">刪除</button>
    </div>`).join("");

  return `
  <div class="table-container">
    <table>
      <thead><tr><th>日期</th><th>里程</th><th>項目</th><th>備註</th><th>操作</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="mobile-cards">${cards}</div>`;
}

export function setupMaintenanceEvents() {
  const form = document.getElementById("maintenanceForm");
  if (!form) return;

  form.addEventListener("submit", e => {
    e.preventDefault();
    const formData = new FormData(form);
    const newRecord = Object.fromEntries(formData.entries());
    const records = JSON.parse(localStorage.getItem("maintenanceRecords") || "[]");
    records.push(newRecord);
    localStorage.setItem("maintenanceRecords", JSON.stringify(records));
    showToast("🧰 保養紀錄已新增");
    loadTab("maintenance");
  });

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = btn.dataset.index;
      const records = JSON.parse(localStorage.getItem("maintenanceRecords") || "[]");
      records.splice(i, 1);
      localStorage.setItem("maintenanceRecords", JSON.stringify(records));
      showToast("🗑️ 保養紀錄已刪除");
      loadTab("maintenance");
    });
  });
}
