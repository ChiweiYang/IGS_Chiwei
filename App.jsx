import React, { useState, useEffect, useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Label
} from 'recharts';
import { Upload, Download, TrendingUp, DollarSign, Activity, AlertCircle, Calendar, Filter, CheckSquare, BarChart2, Settings, Lock } from 'lucide-react';

// 產生覆蓋全範圍的月份：已依據需求移除 2024，從 2025 開始至 2028
const generateAllMonths = () => {
  const months = [];
  for (let y = 2025; y <= 2028; y++) {
    for (let m = 1; m <= 12; m++) {
      months.push(`${y}/${m.toString().padStart(2, '0')}`);
    }
  }
  return months;
};

const allMonths = generateAllMonths();

// 固定雜湊產生顏色
const getCohortColor = (cohortStr) => {
  const colors = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', 
    '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', 
    '#808000', '#ffd8b1', '#000075', '#808080'
  ];
  let hash = 0;
  for (let i = 0; i < cohortStr.length; i++) hash += cohortStr.charCodeAt(i);
  return colors[hash % colors.length];
};

export default function App() {
  // 系統權限與登入狀態
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState(false);

  const [activeTab, setActiveTab] = useState('cohort'); 
  const [isXlsxLoaded, setIsXlsxLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // 核心資料庫
  const [roiMap, setRoiMap] = useState({});       // 儲存累積 ROI (來自 ROI.xlsx)
  const [costMap, setCostMap] = useState({});     // 儲存實際成本 (來自 ROI.xlsx)
  const [retMap, setRetMap] = useState({});       // 儲存留存率 (來自 留存.xlsx)
  
  // 未來預估行銷成本 (預設 5千萬)
  const [defaultFutureCost, setDefaultFutureCost] = useState(50000000);
  
  // 篩選器狀態與截止日
  const [cutoffDate, setCutoffDate] = useState('');
  const [filterYear, setFilterYear] = useState('All'); 
  const [selectedCohorts, setSelectedCohorts] = useState([]);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 6000);
  };

  useEffect(() => {
    if (filterYear === 'All') {
      const defaultView = allMonths.filter(m => m >= '2025/01' && m <= '2026/12');
      setSelectedCohorts(defaultView);
    } else {
      setSelectedCohorts(allMonths.filter(m => m.startsWith(filterYear)));
    }
  }, [filterYear]);

  // 動態加載 SheetJS
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.async = true;
    script.onload = () => setIsXlsxLoaded(true);
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  // --------------------------------------------------------
  // 核心預測引擎：結合歷史留存率與歷史 ROI 推導未來走勢
  // --------------------------------------------------------
  const projectedData = useMemo(() => {
    // 1. 計算歷史平均留存率與平均新增 ROI
    const avgRet = [];
    const avgInc = [];
    
    for (let i = 0; i <= 60; i++) {
      let sumRet = 0, countRet = 0;
      let sumInc = 0, countInc = 0;
      
      allMonths.forEach(m => {
        if (retMap[m] && retMap[m][i] !== undefined) {
          sumRet += retMap[m][i];
          countRet++;
        }
        if (roiMap[m] && i < roiMap[m].length) {
          let inc = i === 0 ? roiMap[m][0] : (roiMap[m][i] - roiMap[m][i-1]);
          sumInc += inc;
          countInc++;
        }
      });
      
      avgRet[i] = countRet > 0 ? sumRet / countRet : (i === 0 ? 100 : (avgRet[i-1] * 0.8 || 0));
      avgInc[i] = countInc > 0 ? sumInc / countInc : (i === 0 ? 30 : (avgInc[i-1] * 0.8 || 0));
    }

    // 2. 為每個月份建構完整的 0~36 個月生命週期
    const fullCohorts = {};
    const maxMonths = 36;

    allMonths.forEach(month => {
      const actualCum = roiMap[month] || [];
      const cohortCost = costMap[month] !== undefined ? costMap[month] : defaultFutureCost;

      const predCum = [];
      const predInc = [];
      let currentCum = 0;
      let lastInc = 0;

      for (let i = 0; i <= maxMonths; i++) {
        if (i < actualCum.length) {
          // 實際發生過的值
          currentCum = actualCum[i];
          lastInc = i === 0 ? currentCum : (actualCum[i] - actualCum[i-1]);
          predCum[i] = currentCum;
          predInc[i] = lastInc;
        } else {
          // 預估未來的值
          let nextInc = 0;
          if (actualCum.length === 0 && i === 0) {
            nextInc = avgInc[0] || 40; 
          } else {
            let decay = 0.8; 
            if (avgRet[i] && avgRet[i-1] && avgRet[i-1] > 0) {
              decay = avgRet[i] / avgRet[i-1];
            } else if (avgInc[i] && avgInc[i-1] && avgInc[i-1] > 0) {
              decay = avgInc[i] / avgInc[i-1];
            }
            decay = Math.max(0.05, Math.min(1.2, decay));
            nextInc = Math.max(0, lastInc * decay);
          }
          currentCum += nextInc;
          lastInc = nextInc;
          predCum[i] = currentCum;
          predInc[i] = lastInc;
        }
      }

      fullCohorts[month] = {
        cost: cohortCost,
        actualLen: actualCum.length,
        cum: predCum,
        inc: predInc
      };
    });

    return fullCohorts;
  }, [roiMap, costMap, retMap, defaultFutureCost]);

  // --------------------------------------------------------
  // 準備圖表與報表資料
  // --------------------------------------------------------
  const cumulativeChartData = useMemo(() => {
    const data = [];
    for (let i = 0; i <= 36; i++) {
      let row = { name: `M${i}`, age: i };
      selectedCohorts.forEach(month => {
        const cData = projectedData[month];
        if (!cData) return;
        
        if (i < cData.actualLen) {
          row[`${month}_act`] = parseFloat(cData.cum[i].toFixed(2));
          // 接合虛線
          if (i === cData.actualLen - 1) {
            row[`${month}_pred`] = parseFloat(cData.cum[i].toFixed(2));
          }
        } else {
          row[`${month}_pred`] = parseFloat(cData.cum[i].toFixed(2));
        }
      });
      data.push(row);
    }
    return data;
  }, [projectedData, selectedCohorts]);

  const projections = useMemo(() => {
    const targetMonths = allMonths;
    return targetMonths.map(targetMonth => {
      const targetIdx = allMonths.indexOf(targetMonth);
      let newRev = 0, retRev = 0;
      const budget = projectedData[targetMonth]?.cost || defaultFutureCost;

      allMonths.forEach(cohort => {
        const cohortIdx = allMonths.indexOf(cohort);
        if (cohortIdx > targetIdx) return;
        const age = targetIdx - cohortIdx;
        if (age > 36) return; 

        const cData = projectedData[cohort];
        const rev = cData.cost * ((cData.inc[age] || 0) / 100.0);
        
        if (age === 0) newRev += rev;
        else retRev += rev;
      });

      return {
        month: targetMonth,
        newRev: parseFloat(newRev.toFixed(2)),
        retRev: parseFloat(retRev.toFixed(2)),
        totalRev: parseFloat((newRev + retRev).toFixed(2)),
        budget: parseFloat(budget.toFixed(2)),
        roas: budget > 0 ? parseFloat((((newRev + retRev) / budget) * 100).toFixed(1)) : 0
      };
    });
  }, [projectedData, defaultFutureCost]);

  const totalSummary = useMemo(() => {
    return projections.reduce((acc, curr) => {
      acc.totalRev += curr.totalRev; acc.totalBudget += curr.budget; return acc;
    }, { totalRev: 0, totalBudget: 0 });
  }, [projections]);

  // --------------------------------------------------------
  // XLSX 解析工具
  // --------------------------------------------------------
  const normalizeMonthString = (rawStr) => {
    if (rawStr === undefined || rawStr === null) return null;
    let s = String(rawStr).trim();
    if (s === '') return null;
    if (!isNaN(s) && Number(s) > 30000 && Number(s) < 60000) {
      const date = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
      return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    s = s.replace(/[-_年\.]/g, '/').replace(/月/g, '');
    const matchYm = s.match(/^(\d{2,4})\/(\d{1,2})/);
    if (matchYm) {
      let yy = matchYm[1];
      if (yy.length === 2) yy = '20' + yy;
      return `${yy}/${String(matchYm[2]).padStart(2, '0')}`;
    }
    return s;
  };

  const parseNumber = (valStr) => {
    if (valStr === null || valStr === undefined) return NaN;
    let s = String(valStr).replace(/[%$ ,，％'"]/g, '').trim();
    if (s === '' || s === '-') return NaN;
    return parseFloat(s);
  };

  // 上傳 1：ROI 與成本
  const handleRoiAndCostUpload = (e) => {
    setErrorMsg(''); setSuccessMsg('');
    const file = e.target.files[0];
    if (!file || !window.XLSX) return;

    let scaleFactor = 1;
    let cutoffY, cutoffM, cutoffD;
    if (cutoffDate) {
      const d = new Date(cutoffDate);
      cutoffY = d.getFullYear();
      cutoffM = d.getMonth() + 1;
      cutoffD = d.getDate();
      const daysInMonth = new Date(cutoffY, cutoffM, 0).getDate();
      scaleFactor = daysInMonth / cutoffD;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataArray = new Uint8Array(evt.target.result);
        const wb = window.XLSX.read(dataArray, { type: 'array' });
        const data = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: null });
        let updatedCount = 0;
        let scaledNotice = false;

        const newRoiMap = { ...roiMap };
        const newCostMap = { ...costMap };

        data.forEach(row => {
          const keys = Object.keys(row);
          
          const itemKey = keys.find(k => ['項目', '類別'].includes(k));
          if (itemKey && row[itemKey]) {
            const itemStr = String(row[itemKey]);
            if (itemStr.includes('留存') || itemStr.includes('新進') || itemStr.includes('老玩家')) return; 
          }

          const monthKey = keys.find(k => ['month', '年/月', '年月', '月份', '日期'].includes(k.replace(/[\n\r\s]/g, '').toLowerCase()));
          const month = normalizeMonthString(monthKey ? row[monthKey] : null);
          if (!month) return;

          const costKey = keys.find(k => k.includes('cost') || k.includes('成本') || k.includes('花費') || k.includes('預算') || k.includes('人數或花費'));
          let costVal = parseNumber(row[costKey]);
          if (!isNaN(costVal)) {
            newCostMap[month] = costVal;
          }

          let maxIndex = -1;
          const tempRoiMap = {};
          keys.forEach(k => {
            const cleanK = k.replace(/[\n\r\s\u200B]/g, '').toLowerCase();
            let matchedIndex = -1;
            if (['當月', 'm0', '0月', '+0月'].includes(cleanK)) matchedIndex = 0;
            else {
              const match = cleanK.match(/^(\+|＋)?(m)?0*(\d+)(月)?$/i);
              if (match) matchedIndex = parseInt(match[3], 10);
            }

            if (matchedIndex >= 0 && matchedIndex <= 60) {
              const num = parseNumber(row[k]);
              if (!isNaN(num)) {
                if (matchedIndex === 0 && num > 1000) {
                  // do nothing
                } else {
                  tempRoiMap[matchedIndex] = num;
                  maxIndex = Math.max(maxIndex, matchedIndex);
                }
              }
            }
          });

          if (maxIndex >= 0) {
            updatedCount++;
            const cumArr = [];
            let prevCum = 0;
            const [cYear, cMo] = month.split('/').map(Number);

            for (let i = 0; i <= maxIndex; i++) {
              let currentCum = tempRoiMap[i] !== undefined ? tempRoiMap[i] : prevCum;
              let inc = currentCum - prevCum;

              if (cutoffDate) {
                const targetD = new Date(cYear, cMo - 1 + i, 1);
                if (targetD.getFullYear() === cutoffY && (targetD.getMonth() + 1) === cutoffM) {
                  inc = inc * scaleFactor;
                  currentCum = prevCum + inc;
                  scaledNotice = true;
                }
              }

              cumArr.push(currentCum);
              prevCum = currentCum;
            }
            newRoiMap[month] = cumArr;
          }
        });

        setRoiMap(newRoiMap);
        setCostMap(newCostMap);

        if (updatedCount > 0) {
            let msg = `✅ 成功載入 ${updatedCount} 筆「累積 ROI」與「花費」！`;
            if (scaledNotice) msg += ` (已依據截止日等比例放大當月增量)`;
            showSuccess(msg);
        } else {
            setErrorMsg('找不到有效資料。請確認檔案具備「年/月」、「人數或花費」與「當月, +1月」欄位。');
        }
      } catch (err) { setErrorMsg('解析發生錯誤：' + err.message); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null;
  };

  // 上傳 2：留存率
  const handleRetentionUpload = (e) => {
    setErrorMsg(''); setSuccessMsg('');
    const file = e.target.files[0];
    if (!file || !window.XLSX) return;

    let scaleFactor = 1;
    let cutoffY, cutoffM, cutoffD;
    if (cutoffDate) {
      const d = new Date(cutoffDate);
      cutoffY = d.getFullYear();
      cutoffM = d.getMonth() + 1;
      cutoffD = d.getDate();
      const daysInMonth = new Date(cutoffY, cutoffM, 0).getDate();
      scaleFactor = daysInMonth / cutoffD;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataArray = new Uint8Array(evt.target.result);
        const wb = window.XLSX.read(dataArray, { type: 'array' });
        const data = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: null });
        let updatedCount = 0;
        let scaledNotice = false;
        const newRetMap = { ...retMap };

        data.forEach(row => {
          const keys = Object.keys(row);
          
          const itemKey = keys.find(k => ['項目', '類別'].includes(k));
          if (itemKey && row[itemKey]) {
            const itemStr = String(row[itemKey]);
            if (!itemStr.includes('新進') && !itemStr.includes('留存')) return; 
          }

          const monthKey = keys.find(k => ['month', '年/月', '年月', '月份', '日期'].includes(k.replace(/[\n\r\s]/g, '').toLowerCase()));
          const month = normalizeMonthString(monthKey ? row[monthKey] : null);
          if (!month) return;

          let maxIndex = -1;
          const tempRetMap = {};
          keys.forEach(k => {
            const cleanK = k.replace(/[\n\r\s\u200B]/g, '').toLowerCase();
            let matchedIndex = -1;
            if (['當月', 'm0', '0月', '+0月'].includes(cleanK)) matchedIndex = 0;
            else {
              const match = cleanK.match(/^(\+|＋)?(m)?0*(\d+)(月)?$/i);
              if (match) matchedIndex = parseInt(match[3], 10);
            }

            if (matchedIndex >= 0 && matchedIndex <= 60) {
              const num = parseNumber(row[k]);
              if (!isNaN(num)) {
                if (matchedIndex === 0 && num > 1000) {
                  // Do nothing
                } else {
                  tempRetMap[matchedIndex] = num;
                  maxIndex = Math.max(maxIndex, matchedIndex);
                }
              }
            }
          });

          if (maxIndex >= 0) {
            updatedCount++;
            const retArr = [];
            const [cYear, cMo] = month.split('/').map(Number);

            for (let i = 0; i <= maxIndex; i++) {
              let retVal = tempRetMap[i] !== undefined ? tempRetMap[i] : (i === 0 ? 100 : (retArr[i-1] || 0));
              
              if (cutoffDate) {
                const targetD = new Date(cYear, cMo - 1 + i, 1);
                if (targetD.getFullYear() === cutoffY && (targetD.getMonth() + 1) === cutoffM) {
                  retVal = retVal * scaleFactor;
                  scaledNotice = true;
                }
              }
              
              retArr.push(retVal);
            }
            newRetMap[month] = retArr;
          }
        });

        setRetMap(newRetMap);

        if (updatedCount > 0) {
            let msg = `✅ 成功載入 ${updatedCount} 筆「留存率」！預測模型已切換為動態參照模式。`;
            if (scaledNotice) msg += ` (已依據截止日放大當月留存)`;
            showSuccess(msg);
        } else {
            setErrorMsg('找不到有效留存率資料。請確認檔案含有「新進數」列。');
        }

      } catch (err) { setErrorMsg('解析發生錯誤：' + err.message); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null;
  };

  // 登入處理
  const handleLogin = () => {
    // 預設通行密碼
    if (passwordInput === '3293') {
      setIsAuthenticated(true);
      setLoginError(false);
    } else {
      setLoginError(true);
    }
  };

  const CustomCohortTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const cohortMap = {};
      payload.forEach(p => {
        const cohort = p.dataKey.split('_')[0];
        const type = p.dataKey.split('_')[1];
        if (!cohortMap[cohort]) cohortMap[cohort] = { name: cohort, color: p.color };
        cohortMap[cohort][type] = p.value;
      });

      return (
        <div className="bg-white/95 backdrop-blur-sm p-4 border border-slate-200 rounded-xl shadow-2xl text-sm z-50 relative pointer-events-none">
          <p className="font-bold text-slate-800 mb-3 border-b pb-2">生命週期 (月): {label}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
            {Object.values(cohortMap).sort((a,b) => {
              const valA = a.act ?? a.pred;
              const valB = b.act ?? b.pred;
              return valB - valA;
            }).map(c => {
              const val = c.act ?? c.pred;
              const isAct = c.act !== undefined;
              return (
                <div key={c.name} className="flex justify-between items-center gap-4">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor: c.color}}></span>
                    <span className="font-medium text-slate-700">{c.name}</span>
                    <span className="text-[10px] text-slate-400">{isAct ? '(實際)' : '(預估)'}</span>
                  </div>
                  <span className="font-bold" style={{color: c.color}}>{val.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  // 登入畫面
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 max-w-sm w-full">
          <div className="flex justify-center mb-6">
            <div className="bg-indigo-100 p-4 rounded-full">
              <Lock className="w-8 h-8 text-indigo-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">ROI 預測儀表板</h2>
          <p className="text-sm text-slate-500 mb-8 text-center">受保護的應用程式，請輸入通行密碼</p>
          
          <div className="space-y-4">
            <div>
              <input 
                type="password" 
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setLoginError(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className={`w-full px-4 py-3 border ${loginError ? 'border-red-300 focus:ring-red-500' : 'border-slate-300 focus:ring-indigo-500'} rounded-xl focus:outline-none focus:ring-2 bg-slate-50 text-slate-800 font-medium`}
                placeholder="輸入密碼 (預設: 3293)"
              />
              {loginError && <p className="text-red-500 text-xs mt-2 ml-1">密碼錯誤，請再試一次</p>}
            </div>
            <button 
              onClick={handleLogin}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-sm active:scale-[0.98]"
            >
              進入系統
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 系統主畫面
  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header & Controls */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white p-6 rounded-xl shadow-sm border border-slate-100 gap-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center text-slate-800">
              <Activity className="w-6 h-6 mr-2 text-indigo-600" />
              營收與 ROI 動態預測儀表板
            </h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            
            {/* 實際資料截止日 (Cutoff) */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 hover:border-indigo-300 transition-colors">
              <Calendar className="w-4 h-4 text-indigo-600 mr-2" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">設定實際資料截止日</span>
                <input 
                  type="date" 
                  value={cutoffDate} 
                  onChange={(e) => setCutoffDate(e.target.value)}
                  className="bg-transparent text-sm font-bold outline-none text-slate-800 cursor-pointer"
                  title="選擇當前未完整月份的日期，系統將自動按比例推演當月完整數值"
                />
              </div>
            </div>

            {/* 未來行銷成本設定 */}
            <div className="flex items-center bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 hover:border-amber-300 transition-colors">
              <Settings className="w-4 h-4 text-amber-600 mr-2" />
              <div className="flex flex-col">
                <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wide">設定未來每月行銷成本</span>
                <input 
                  type="number" 
                  value={defaultFutureCost} 
                  onChange={(e) => setDefaultFutureCost(Number(e.target.value))}
                  className="bg-transparent text-sm font-bold outline-none text-slate-800 w-24"
                />
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

            {/* 匯入按鈕 1：ROI */}
            <div className="relative">
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleRoiAndCostUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
              <button className="flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium pointer-events-none transition-colors shadow-sm">
                <Upload className="w-4 h-4 mr-2" /> 1. 匯入實際 ROI & 成本
              </button>
            </div>
            
            {/* 匯入按鈕 2：留存率 */}
            <div className="relative">
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleRetentionUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
              <button className="flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium pointer-events-none transition-colors shadow-sm">
                <Upload className="w-4 h-4 mr-2" /> 2. 匯入各族群留存率
              </button>
            </div>

          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl flex items-start shadow-sm text-sm">
            <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-5 py-4 rounded-xl flex items-center shadow-sm text-sm font-medium">
            <TrendingUp className="w-5 h-5 mr-3 flex-shrink-0" />
            {successMsg}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-white p-1 rounded-xl shadow-sm border border-slate-100 w-fit">
          <button 
            onClick={() => setActiveTab('revenue')}
            className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'revenue' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <BarChart2 className="w-4 h-4 mr-2" /> 總體營收預測分析
          </button>
          <button 
            onClick={() => setActiveTab('cohort')}
            className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'cohort' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <TrendingUp className="w-4 h-4 mr-2" /> 各月份 ROI 累積曲線 (LTV)
          </button>
        </div>

        {/* ================= TAB 1: 營收預測 ================= */}
        {activeTab === 'revenue' && (
          <div className="space-y-6 animation-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center">
                <div className="bg-indigo-100 p-3 rounded-lg mr-4"><DollarSign className="w-6 h-6 text-indigo-600" /></div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">預測總營收區間</p>
                  <p className="text-2xl font-bold text-slate-800">{totalSummary.totalRev.toLocaleString(undefined, {minimumFractionDigits: 1})}</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center">
                <div className="bg-emerald-100 p-3 rounded-lg mr-4"><TrendingUp className="w-6 h-6 text-emerald-600" /></div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">總體平均 ROAS</p>
                  <p className="text-2xl font-bold text-slate-800">{totalSummary.totalBudget > 0 ? ((totalSummary.totalRev / totalSummary.totalBudget) * 100).toFixed(1) : 0}%</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center">
                <div className="bg-blue-100 p-3 rounded-lg mr-4"><Activity className="w-6 h-6 text-blue-600" /></div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">資料覆蓋月份數量</p>
                  <p className="text-2xl font-bold text-slate-800">{Object.keys(projectedData).length} 組</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 mb-6">營收預測趨勢 (新客 vs 舊客留存)</h2>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projections} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1}/>
                      </linearGradient>
                      <linearGradient id="colorRet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} minTickGap={20} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(value) => (value / 1000000).toFixed(0) + 'M'} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value) => parseFloat(value).toLocaleString()} />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }}/>
                    <Area type="monotone" dataKey="retRev" name="留存舊客營收 (Retained)" stackId="1" stroke="#10b981" fill="url(#colorRet)" />
                    <Area type="monotone" dataKey="newRev" name="首月新客營收 (New)" stackId="1" stroke="#6366f1" fill="url(#colorNew)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: 累積 ROI 曲線 ================= */}
        {activeTab === 'cohort' && (
          <div className="space-y-4 animation-fade-in">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-4">
              <div className="flex items-center gap-4 border-b pb-4">
                <Filter className="w-5 h-5 text-slate-400" />
                <span className="font-bold text-slate-700">年度快篩：</span>
                {['All', '2025', '2026', '2027', '2028'].map(year => (
                  <button 
                    key={year}
                    onClick={() => setFilterYear(year)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filterYear === year ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {year === 'All' ? '全部' : `${year} 年`}
                  </button>
                ))}
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="font-bold text-slate-700 flex items-center"><CheckSquare className="w-4 h-4 mr-2" /> 個別月份選擇 (可複選)</span>
                  <div className="space-x-3 text-sm">
                    <button onClick={() => setSelectedCohorts(allMonths.filter(m => filterYear==='All' || m.startsWith(filterYear)))} className="text-indigo-600 hover:underline">全選</button>
                    <button onClick={() => setSelectedCohorts([])} className="text-slate-500 hover:underline">全不選</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allMonths.filter(m => filterYear === 'All' || m.startsWith(filterYear)).map(m => {
                    const isSelected = selectedCohorts.includes(m);
                    const isPredictedOnly = !projectedData[m] || projectedData[m].actualLen === 0;
                    return (
                      <label key={m} className={`flex items-center space-x-2 px-3 py-1.5 rounded-md border text-sm cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                        <input 
                          type="checkbox" checked={isSelected} 
                          className="accent-indigo-600"
                          onChange={(e) => {
                            if(e.target.checked) setSelectedCohorts(prev => [...prev, m].sort());
                            else setSelectedCohorts(prev => prev.filter(x => x !== m));
                          }} 
                        />
                        <div className="w-3 h-3 rounded-full shadow-sm" style={{backgroundColor: getCohortColor(m)}}></div>
                        <span className="font-medium text-slate-700">
                          {m} {isPredictedOnly && <span className="text-[10px] text-slate-400 font-normal ml-1">(純預估)</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">各月份 ROI 累積曲線</h2>
                </div>
              </div>
              <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumulativeChartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tick={{ fill: '#64748b' }} tickMargin={10} />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={12} 
                      tickFormatter={(val) => `${Math.round(val)}%`}
                      domain={[0, 'dataMax + 20']} 
                    />
                    <RechartsTooltip content={<CustomCohortTooltip />} />
                    
                    <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="6 6" strokeWidth={2}>
                      <Label value="100% 損益兩平基準線" position="insideTopLeft" fill="#ef4444" fontSize={12} fontWeight="bold" />
                    </ReferenceLine>

                    {selectedCohorts.map(cohort => {
                      const color = getCohortColor(cohort);
                      return (
                        <React.Fragment key={cohort}>
                          <Line 
                            type="monotone" 
                            dataKey={`${cohort}_act`} 
                            name={`${cohort} (實際)`} 
                            stroke={color} 
                            strokeWidth={3} 
                            dot={{r: 4, strokeWidth: 2}} 
                            activeDot={{r: 6}} 
                            isAnimationActive={false} 
                          />
                          <Line 
                            type="monotone" 
                            dataKey={`${cohort}_pred`} 
                            name={`${cohort} (預估)`} 
                            stroke={color} 
                            strokeWidth={2.5} 
                            strokeDasharray="6 4" 
                            dot={false} 
                            activeDot={{r: 4}} 
                            isAnimationActive={false} 
                          />
                        </React.Fragment>
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
