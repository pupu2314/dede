import { renderChargeModule, setupChargeModuleEvents } from "./modules/chargeModule.js";

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupTheme();
  showToast('系統載入完成 🚀');
});

function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadTab(btn.dataset.tab);
  }));
}

function loadTab(tabName) {
  const main = document.getElementById('tab-content');
  main.innerHTML = `<div class='loading'>載入中...</div>`;

  setTimeout(() => {
    switch (tabName) {
      case 'dashboard':
        main.innerHTML = renderDashboard();
        break;
      case 'charge':
        main.innerHTML = renderChargeModule();
        setupChargeModuleEvents();
        break;
      case 'maintenance':
        main.innerHTML = `<div class='placeholder'>🧰 保養紀錄模組</div>`;
        break;
      case 'expense':
        main.innerHTML = `<div class='placeholder'>💰 費用紀錄模組</div>`;
        break;
      case 'statistics':
        main.innerHTML = `<div class='placeholder'>📊 統計分析模組</div>`;
        break;
      case 'settings':
        main.innerHTML = `<div class='placeholder'>⚙️ 系統設定模組</div>`;
        break;
    }
  }, 200);
}

function renderDashboard() {
  return `
  <section id='dashboardTab'>
    <div class='dashboard'>
      <div class='stat-card'><h3>總里程</h3><div class='value' id='totalMileage'>0</div><div class='unit'>km</div></div>
      <div class='stat-card'><h3>總花費</h3><div class='value' id='totalExpense'>0</div><div class='unit'>NT$</div></div>
      <div class='stat-card'><h3>上次充電</h3><div class='value' id='lastChargeDays'>-</div><div class='unit' id='lastChargeDate'>尚未記錄</div></div>
      <div class='stat-card'><h3>下次保養</h3><div class='value' id='nextServiceKm'>-</div><div class='unit' id='nextServiceDate'>請先記錄保養</div></div>
    </div>
  </section>`;
}

function showToast(msg, type='info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.background = type === 'error' ? 'var(--danger)' : 'var(--accent)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function setupTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (prefersDark) document.documentElement.classList.add('dark');
}
