import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, Calendar, Activity, Settings, Plus, RotateCcw, 
  Trash2, RefreshCw, CheckCircle, AlertCircle, ChevronRight, 
  BarChart3, Home, Save
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [records, setRecords] = useState([]);
  const [apiUrl, setApiUrl] = useState('');
  const [syncStatus, setSyncStatus] = useState('idle'); // idle, syncing, success, error
  const [customDate, setCustomDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // 初始化載入
  useEffect(() => {
    const savedUrl = localStorage.getItem('tracker_api_url');
    const savedRecords = localStorage.getItem('tracker_records');
    
    if (savedUrl) setApiUrl(savedUrl);
    if (savedRecords) {
      try {
        setRecords(JSON.parse(savedRecords));
      } catch (e) {
        console.error('Failed to parse local records', e);
      }
    }
    setIsLoading(false);
  }, []);

  // 當 API URL 改變時自動拉取最新資料
  useEffect(() => {
    if (apiUrl && apiUrl.startsWith('http')) {
      fetchDataFromCloud();
    }
  }, [apiUrl]);

  // 同步資料到 Google Sheets
  const syncToCloud = async (currentRecords) => {
    if (!apiUrl) return;
    setSyncStatus('syncing');
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: JSON.stringify(currentRecords),
        // 使用 text/plain 避免 CORS preflight 錯誤
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
      });
      const result = await response.json();
      if (result.status === 'success') {
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 3000);
      } else {
        throw new Error('API 回傳失敗');
      }
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 5000);
    }
  };

  // 從 Google Sheets 拉取資料
  const fetchDataFromCloud = async () => {
    if (!apiUrl) return;
    setSyncStatus('syncing');
    try {
      const response = await fetch(apiUrl);
      const data = await response.json();
      if (Array.isArray(data)) {
        // 合併並去重
        const localIds = new Set(records.map(r => r.id));
        const newRecords = [...records];
        let hasChanges = false;
        
        data.forEach(cloudRecord => {
          if (!localIds.has(cloudRecord.id)) {
            newRecords.push(cloudRecord);
            hasChanges = true;
          }
        });

        // 雲端資料有時可能因為被清空而少於本地，這裡我們採用覆寫模式，以防萬一
        // 為了簡單穩定，直接採用雲端的資料如果雲端有資料的話
        if (data.length > 0) {
           setRecords(data);
           localStorage.setItem('tracker_records', JSON.stringify(data));
        }
        
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 5000);
    }
  };

  // 新增紀錄
  const addRecord = (timeMs) => {
    const newRecord = {
      id: crypto.randomUUID(),
      timestamp: timeMs
    };
    const updatedRecords = [...records, newRecord].sort((a, b) => b.timestamp - a.timestamp);
    setRecords(updatedRecords);
    localStorage.setItem('tracker_records', JSON.stringify(updatedRecords));
    syncToCloud(updatedRecords);
  };

  // 刪除紀錄
  const deleteRecord = (id) => {
    if (!window.confirm('確定要刪除這筆紀錄嗎？')) return;
    const updatedRecords = records.filter(r => r.id !== id);
    setRecords(updatedRecords);
    localStorage.setItem('tracker_records', JSON.stringify(updatedRecords));
    syncToCloud(updatedRecords);
  };

  // 儲存 API 設定
  const saveApiSetting = () => {
    localStorage.setItem('tracker_api_url', apiUrl);
    alert('設定已儲存！將開始嘗試連線。');
    fetchDataFromCloud();
  };

  // --- 統計數據計算邏輯 ---
  const stats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const startOfYear = new Date(currentYear, 0, 1);
    
    // 本年度已過天數
    const daysPassedThisYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24)) + 1;
    
    const sortedDesc = [...records].sort((a, b) => b.timestamp - a.timestamp);
    const sortedAsc = [...records].sort((a, b) => a.timestamp - b.timestamp);
    
    let thisYearCount = 0;
    let lastYearCount = 0;
    let thisMonthCount = 0;
    let lastMonthCount = 0;
    let maxGapMs = 0;

    sortedAsc.forEach((r, i) => {
      const date = new Date(r.timestamp);
      if (date.getFullYear() === currentYear) thisYearCount++;
      if (date.getFullYear() === currentYear - 1) lastYearCount++;
      if (date.getFullYear() === currentYear && date.getMonth() === currentMonth) thisMonthCount++;
      
      const lastMonthDate = new Date(now);
      lastMonthDate.setMonth(now.getMonth() - 1);
      if (date.getFullYear() === lastMonthDate.getFullYear() && date.getMonth() === lastMonthDate.getMonth()) {
        lastMonthCount++;
      }

      // 計算最長間隔
      if (i > 0) {
        const gap = r.timestamp - sortedAsc[i-1].timestamp;
        if (gap > maxGapMs) maxGapMs = gap;
      }
    });

    // 距離上次經過時間
    const timeSinceLast = sortedDesc.length > 0 ? now.getTime() - sortedDesc[0].timestamp : null;
    
    // 計算平均間隔 (總時間 / 次數)
    let avgIntervalDays = 0;
    if (sortedAsc.length > 1) {
      const totalSpan = sortedAsc[sortedAsc.length - 1].timestamp - sortedAsc[0].timestamp;
      avgIntervalDays = (totalSpan / (sortedAsc.length - 1)) / (1000 * 60 * 60 * 24);
    }

    // 當前堅持天數 (Current Streak)
    const currentStreakDays = timeSinceLast !== null ? timeSinceLast / (1000 * 60 * 60 * 24) : 0;

    return {
      total: records.length,
      daysPassedThisYear,
      thisYearCount,
      lastYearCount,
      thisMonthCount,
      lastMonthCount,
      currentStreakDays: currentStreakDays.toFixed(1),
      maxGapDays: (maxGapMs / (1000 * 60 * 60 * 24)).toFixed(1),
      avgIntervalDays: avgIntervalDays.toFixed(1),
      latestRecord: sortedDesc[0]
    };
  }, [records]);

  // --- 畫面渲染組件 ---
  
  const renderHome = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 快捷紀錄區 */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
          <Clock className="w-5 h-5 mr-2 text-indigo-500" />
          新增紀錄
        </h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button 
            onClick={() => addRecord(Date.now())}
            className="bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-semibold shadow-md shadow-indigo-200 transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
          >
            <Plus className="w-6 h-6" />
            現在 (Now)
          </button>
          <button 
            onClick={() => addRecord(Date.now() - 5 * 60 * 1000)}
            className="bg-sky-500 hover:bg-sky-600 text-white py-4 rounded-2xl font-semibold shadow-md shadow-sky-200 transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
          >
            <RotateCcw className="w-6 h-6" />
            5分鐘前
          </button>
        </div>
        
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          <input 
            type="datetime-local" 
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-slate-700 outline-none focus:border-indigo-500"
          />
          <button 
            onClick={() => {
              if(!customDate) return alert('請先選擇時間');
              addRecord(new Date(customDate).getTime());
              setCustomDate('');
            }}
            className="bg-slate-800 text-white px-5 py-2 rounded-xl font-medium hover:bg-slate-700 transition-colors"
          >
            補登
          </button>
        </div>
      </div>

      {/* 狀態簡報 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-5 rounded-3xl text-white shadow-md">
          <p className="text-indigo-100 text-sm font-medium mb-1">距離上次</p>
          <div className="text-3xl font-bold">
            {stats.currentStreakDays} <span className="text-lg font-normal">天</span>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-slate-500 text-sm font-medium mb-1">本月累計</p>
          <div className="text-3xl font-bold text-slate-800">
            {stats.thisMonthCount} <span className="text-lg font-normal text-slate-400">次</span>
          </div>
        </div>
      </div>

      {/* 最近紀錄 */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-20">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
          <Activity className="w-5 h-5 mr-2 text-teal-500" />
          最近紀錄
        </h2>
        {records.length === 0 ? (
          <p className="text-slate-400 text-center py-6">尚無任何紀錄，開始你的第一筆吧！</p>
        ) : (
          <div className="space-y-3">
            {[...records].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5).map((record) => (
              <div key={record.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-teal-400"></div>
                  <div>
                    <p className="text-slate-800 font-medium">
                      {new Date(record.timestamp).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' })}
                    </p>
                    <p className="text-slate-500 text-sm">
                      {new Date(record.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => deleteRecord(record.id)}
                  className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderStats = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
          <BarChart3 className="w-6 h-6 mr-2 text-indigo-500" />
          數據分析中心
        </h2>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-slate-50 rounded-2xl">
            <p className="text-slate-500 text-xs font-semibold mb-1">今年度總計</p>
            <p className="text-2xl font-bold text-indigo-600">{stats.thisYearCount} <span className="text-sm font-normal text-slate-400">次</span></p>
            <p className="text-xs text-slate-400 mt-1">已過 {stats.daysPassedThisYear} 天</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-2xl">
            <p className="text-slate-500 text-xs font-semibold mb-1">歷史總計</p>
            <p className="text-2xl font-bold text-slate-800">{stats.total} <span className="text-sm font-normal text-slate-400">次</span></p>
          </div>
          <div className="p-4 bg-slate-50 rounded-2xl">
            <p className="text-slate-500 text-xs font-semibold mb-1">平均間隔</p>
            <p className="text-2xl font-bold text-teal-600">{stats.avgIntervalDays} <span className="text-sm font-normal text-slate-400">天</span></p>
          </div>
          <div className="p-4 bg-slate-50 rounded-2xl">
            <p className="text-slate-500 text-xs font-semibold mb-1">最長禁慾 (Max)</p>
            <p className="text-2xl font-bold text-amber-500">{stats.maxGapDays} <span className="text-sm font-normal text-slate-400">天</span></p>
          </div>
        </div>

        <h3 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">近期趨勢比較</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-600">本月 vs 上月</span>
              <span className="font-medium text-slate-800">{stats.thisMonthCount} / {stats.lastMonthCount}</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-indigo-500" 
                style={{ width: `${Math.min(100, (stats.thisMonthCount / (Math.max(stats.thisMonthCount, stats.lastMonthCount, 1))) * 100)}%` }}
              ></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-600">今年 vs 去年</span>
              <span className="font-medium text-slate-800">{stats.thisYearCount} / {stats.lastYearCount}</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-teal-500" 
                style={{ width: `${Math.min(100, (stats.thisYearCount / (Math.max(stats.thisYearCount, stats.lastYearCount, 1))) * 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center">
          <Settings className="w-6 h-6 mr-2 text-slate-700" />
          雲端同步設定
        </h2>
        <p className="text-slate-500 text-sm mb-6">綁定你專屬的 Google Sheets，達成免費跨裝置無縫同步。</p>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Google Apps Script Web App URL</label>
          <textarea 
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/..."
            className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
          />
          <button 
            onClick={saveApiSetting}
            className="mt-3 w-full bg-slate-800 hover:bg-slate-900 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Save className="w-5 h-5" />
            儲存並連線
          </button>
        </div>

        {/* Sync Status Indicator */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl mb-8">
          <span className="text-sm font-medium text-slate-600">目前同步狀態</span>
          {syncStatus === 'idle' && <span className="text-slate-400 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1"/>已就緒</span>}
          {syncStatus === 'syncing' && <span className="text-indigo-500 text-sm flex items-center animate-pulse"><RefreshCw className="w-4 h-4 mr-1 animate-spin"/>同步中...</span>}
          {syncStatus === 'success' && <span className="text-emerald-500 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1"/>同步成功</span>}
          {syncStatus === 'error' && <span className="text-red-500 text-sm flex items-center"><AlertCircle className="w-4 h-4 mr-1"/>同步失敗</span>}
        </div>

        <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100">
          <h3 className="text-indigo-800 font-bold mb-3">🛠️ 如何建立你的專屬資料庫？</h3>
          <ol className="list-decimal list-inside space-y-3 text-sm text-indigo-900/80 leading-relaxed">
            <li>開啟 <a href="https://sheets.google.com" target="_blank" rel="noreferrer" className="text-indigo-600 font-semibold underline">Google 試算表</a>，建立一個新的空白表單。</li>
            <li>點擊上方選單的 <strong>「擴充功能」</strong> &gt; <strong>「Apps Script」</strong>。</li>
            <li>將編輯器內的程式碼清空，並貼上以下程式碼：</li>
          </ol>
          <div className="mt-3 relative">
            <pre className="bg-slate-800 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto">
{`function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  try {
    var data = JSON.parse(e.postData.contents);
    sheet.clear();
    sheet.appendRow(["ID", "Timestamp", "DateString"]);
    for (var i = 0; i < data.length; i++) {
      sheet.appendRow([
        data[i].id, 
        data[i].timestamp, 
        new Date(data[i].timestamp).toLocaleString('zh-TW')
      ]);
    }
    return ContentService.createTextOutput(JSON.stringify({"status": "success"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({"error": err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][1]) {
      records.push({ id: data[i][0], timestamp: data[i][1] });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(records))
    .setMimeType(ContentService.MimeType.JSON);
}`}
            </pre>
          </div>
          <ol className="list-decimal list-inside space-y-3 text-sm text-indigo-900/80 leading-relaxed mt-4" start="4">
            <li>點擊右上角 <strong>「部署」</strong> &gt; <strong>「新增部署作業」</strong>。</li>
            <li>選擇類型為 <strong>「網頁應用程式 (Web App)」</strong>。</li>
            <li>將「誰可以存取」設定為 <strong>「所有人 (Anyone)」</strong>，然後點擊部署。（過程中需授權帳號存取權限）</li>
            <li>複製部署成功後顯示的 <strong>網頁應用程式網址</strong>，貼回上方的設定框中即可！</li>
          </ol>
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">載入中...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 max-w-md mx-auto relative shadow-2xl">
      {/* Header */}
      <header className="bg-white px-6 py-5 sticky top-0 z-10 border-b border-slate-100 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight">個人紀錄小幫手</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">專注於你的個人成長與節律</p>
        </div>
        {syncStatus === 'syncing' ? (
          <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
        ) : syncStatus === 'success' ? (
          <CheckCircle className="w-5 h-5 text-emerald-400" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-slate-200"></div>
        )}
      </header>

      {/* Main Content */}
      <main className="p-4">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'stats' && renderStats()}
        {activeTab === 'settings' && renderSettings()}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-slate-100 flex justify-around items-center pb-safe pt-2 px-2 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
        <button 
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center p-3 w-20 rounded-2xl transition-all ${activeTab === 'home' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Home className={`w-6 h-6 mb-1 ${activeTab === 'home' ? 'fill-indigo-50' : ''}`} />
          <span className="text-[10px]">首頁</span>
        </button>
        <button 
          onClick={() => setActiveTab('stats')}
          className={`flex flex-col items-center p-3 w-20 rounded-2xl transition-all ${activeTab === 'stats' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <BarChart3 className={`w-6 h-6 mb-1 ${activeTab === 'stats' ? 'fill-indigo-50' : ''}`} />
          <span className="text-[10px]">數據</span>
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center p-3 w-20 rounded-2xl transition-all ${activeTab === 'settings' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Settings className={`w-6 h-6 mb-1 ${activeTab === 'settings' ? 'fill-indigo-50' : ''}`} />
          <span className="text-[10px]">設定</span>
        </button>
      </nav>
      
      <style dangerouslySetInnerHTML={{__html: `
        .pb-safe { padding-bottom: env(safe-area-inset-bottom, 1rem); }
      `}} />
    </div>
  );
}
