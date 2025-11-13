// === modules/settingsModule.js ===
export function renderSettingsModule() {
  const settings = JSON.parse(localStorage.getItem("settings") || "{}");
  return `
  <section id="settingsTab" class="tab-section">
    <h2>⚙️ 系統設定</h2>
    <form id="settingsForm" class="form-card">
      <label>車輛名稱<input type="text" name="vehicle" value="${settings.vehicle || ""}" placeholder="例如：Gogoro VIVA"></label>
      <label>每度電價格 (NT$)<input type="number" name="price" step="0.01" value="${settings.price || 3.0}"></label>
      <button type="submit" class="primary-btn">💾 儲存設定</button>
    </form>

    <div class="form-card">
      <h3>資料匯出 / 匯入</h3>
      <button id="exportBtn" class="primary-btn">📤 匯出資料</button>
      <input type="file" id="importFile" accept=".json" hidden>
      <button id="importBtn" class="primary-btn">📥 匯入資料</button>
    </div>
  </section>`;
}

export function setupSettingsModuleEvents() {
  const form = document.getElementById("settingsForm");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");

  if (!form) return;

  form.addEventListener("submit", e => {
    e.preventDefault();
    const settings = Object.fromEntries(new FormData(form).entries());
    localStorage.setItem("settings", JSON.stringify(settings));
    showToast("⚙️ 設定已儲存");
  });

  exportBtn.addEventListener("click", () => {
    const allData = {
      chargeRecords: JSON.parse(localStorage.getItem("chargeRecords") || "[]"),
      expenseRecords: JSON.parse(localStorage.getItem("expenseRecords") || "[]"),
      settings: JSON.parse(localStorage.getItem("settings") || "{}"),
    };
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "motorcycle_backup.json";
    a.click();
  });

  importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);

      // --- 新增：舊版相容轉換 ---
      if (data.chargeLog || data.expenseLog) {
        const newData = {};

        if (Array.isArray(data.chargeLog)) {
          newData.chargeRecords = data.chargeLog.map(item => ({
            date: item.date,
            kwh: item.kwh || 0,
            cost: item.cost ?? 0,
            location: item.station || item.stationType || "",
            note: item.notes || "",
          }));
        }

        if (Array.isArray(data.expenseLog)) {
          newData.expenseRecords = data.expenseLog.map(item => ({
            date: item.date,
            category: item.category || "其他",
            amount: item.amount ?? 0,
            note: item.description || "",
          }));
        }

        // 其餘資料暫存
        if (Array.isArray(data.maintenanceLog))
          newData.maintenanceRecords = data.maintenanceLog;
        if (Array.isArray(data.statusLog))
          newData.statusRecords = data.statusLog;

        // 匯入時間戳（非必要）
        newData.importedFrom = data.version ? `v${data.version}` : "unknown";

        // 儲存
        for (const key in newData)
          localStorage.setItem(key, JSON.stringify(newData[key]));

        showToast("✅ 舊版資料已成功轉換並匯入");
      }
      // --- 若為新版備份 ---
      else {
        for (const key in data)
          localStorage.setItem(key, JSON.stringify(data[key]));
        showToast("✅ 匯入成功（新版格式）");
      }
    } catch (err) {
      console.error(err);
      showToast("❌ 匯入失敗，檔案格式錯誤", "error");
    }
  };
  reader.readAsText(file);
});
}
