// === modules/chargeModule.js ===
export function renderChargeModule() {
  const chargeData = JSON.parse(localStorage.getItem("chargeRecords") || "[]");
  return `
  <section id="chargeTab" class="tab-section">
    <div class="form-card">
      <h2>新增充電紀錄</h2>
      <form id="chargeForm">
        <div class="form-grid">
          <label>日期<input type="date" name="date" required></label>
          <label>充電電量 (kWh)<input type="number" name="kwh" step="0.01" required></label>
          <label>金額 (NT$)<input type="number" name="cost" step="0.01" required></label>
          <label>地點<input type="text" name="location" placeholder="例如：家裡 / 公司 / 快充站"></label>
          <label>備註<textarea name="note" rows="2" placeholder="選填"></textarea></label>
        </div>
        <button type="submit" class="primary-btn">➕ 新增紀錄</button>
      </form>
    </div>

    <div id="chargeListContainer">
      ${renderChargeTable(chargeData)}
    </div>
  </section>`;
}

function renderChargeTable(data) {
  if (data.length === 0) {
    return `<p class="empty">尚無充電紀錄</p>`;
  }

  const rows = data.map(
    (r, i) => `
      <tr>
        <td>${r.date}</td>
        <td>${r.kwh}</td>
        <td>${r.cost}</td>
        <td>${r.location || "-"}</td>
        <td>${r.note || "-"}</td>
        <td><button class="delete-btn" data-index="${i}">刪除</button></td>
      </tr>`
  ).join("");

  const cards = data.map(
    (r, i) => `
      <div class="record-card">
        <div class="title">📅 ${r.date}</div>
        <div class="meta">⚡ ${r.kwh} kWh ｜ 💰 ${r.cost} 元</div>
        <div class="meta">📍 ${r.location || "未填"}</div>
        ${r.note ? `<div class="note">${r.note}</div>` : ""}
        <button class="delete-btn" data-index="${i}">刪除</button>
      </div>`
  ).join("");

  return `
  <div class="table-container">
    <table>
      <thead>
        <tr><th>日期</th><th>電量 (kWh)</th><th>金額</th><th>地點</th><th>備註</th><th>操作</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="mobile-cards">${cards}</div>`;
}

export function setupChargeModuleEvents() {
  const form = document.getElementById("chargeForm");
  if (!form) return;

  form.addEventListener("submit", e => {
    e.preventDefault();
    const formData = new FormData(form);
    const newRecord = Object.fromEntries(formData.entries());
    const records = JSON.parse(localStorage.getItem("chargeRecords") || "[]");
    records.push(newRecord);
    localStorage.setItem("chargeRecords", JSON.stringify(records));
    showToast("✅ 充電紀錄已新增");
    loadTab("charge");
  });

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = btn.dataset.index;
      const records = JSON.parse(localStorage.getItem("chargeRecords") || "[]");
      records.splice(i, 1);
      localStorage.setItem("chargeRecords", JSON.stringify(records));
      showToast("🗑️ 紀錄已刪除");
      loadTab("charge");
    });
  });
}
