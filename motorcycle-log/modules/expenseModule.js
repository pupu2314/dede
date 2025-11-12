// === modules/expenseModule.js ===
export function renderExpenseModule() {
  const data = JSON.parse(localStorage.getItem("expenseRecords") || "[]");

  return `
  <section id="expenseTab" class="tab-section">
    <div class="form-card">
      <h2>新增費用紀錄</h2>
      <form id="expenseForm">
        <div class="form-grid">
          <label>日期<input type="date" name="date" required></label>
          <label>類別
            <select name="category" required>
              <option value="電費">電費</option>
              <option value="保養">保養</option>
              <option value="零件">零件</option>
              <option value="停車">停車</option>
              <option value="其他">其他</option>
            </select>
          </label>
          <label>金額 (NT$)<input type="number" name="amount" step="0.01" required></label>
          <label>備註<textarea name="note" rows="2" placeholder="選填"></textarea></label>
        </div>
        <button type="submit" class="primary-btn">💾 新增紀錄</button>
      </form>
    </div>

    <div id="expenseListContainer">
      ${renderExpenseTable(data)}
    </div>
  </section>`;
}

function renderExpenseTable(data) {
  if (data.length === 0) return `<p class="empty">尚無費用紀錄</p>`;

  const rows = data.map(
    (r, i) => `
    <tr>
      <td>${r.date}</td>
      <td>${r.category}</td>
      <td>${r.amount}</td>
      <td>${r.note || "-"}</td>
      <td><button class="delete-btn" data-index="${i}">刪除</button></td>
    </tr>`
  ).join("");

  const cards = data.map(
    (r, i) => `
    <div class="record-card">
      <div class="title">📅 ${r.date}</div>
      <div class="meta">${r.category} ｜ 💰 ${r.amount} 元</div>
      ${r.note ? `<div class="note">${r.note}</div>` : ""}
      <button class="delete-btn" data-index="${i}">刪除</button>
    </div>`
  ).join("");

  return `
  <div class="table-container">
    <table>
      <thead><tr><th>日期</th><th>類別</th><th>金額</th><th>備註</th><th>操作</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="mobile-cards">${cards}</div>`;
}

export function setupExpenseModuleEvents() {
  const form = document.getElementById("expenseForm");
  if (!form) return;

  form.addEventListener("submit", e => {
    e.preventDefault();
    const data = JSON.parse(localStorage.getItem("expenseRecords") || "[]");
    const newRecord = Object.fromEntries(new FormData(form).entries());
    data.push(newRecord);
    localStorage.setItem("expenseRecords", JSON.stringify(data));
    showToast("✅ 費用紀錄已新增");
    loadTab("expense");
  });

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = btn.dataset.index;
      const data = JSON.parse(localStorage.getItem("expenseRecords") || "[]");
      data.splice(idx, 1);
      localStorage.setItem("expenseRecords", JSON.stringify(data));
      showToast("🗑️ 已刪除費用紀錄");
      loadTab("expense");
    });
  });
}
