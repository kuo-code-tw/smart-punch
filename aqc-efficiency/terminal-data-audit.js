/* Monthly 79/80 terminal source reconciliation. No writes to cloud data. */
(function(root){
'use strict';
const fmt=n=>Number(n).toLocaleString('zh-TW',{maximumFractionDigits:2});
const differs=(a,b)=>Math.abs(Number(a)-Number(b))>0.01;
const signed=n=>(n>0?'+':'')+fmt(n);
function audit(stats,scope){
 const alerts=[],notes=[],totals=stats.vesselTotals||{};
 const ports=root.P79TerminalRodOverview?.calculate(stats)?.ports||{};
 const add=(code,level,message)=>alerts.push({code,level,message});
 const portFor=wharf=>{
  const v=String(wharf||'').trim().toUpperCase().replace(/\s+/g,'');
  return /^(79|80)[LR]?$/.exec(v)?.[1]||'';
 };
 if(scope?.excludedShips)notes.push('本月未歸入 79／80 碼頭 '+fmt(scope.excludedShips)+' 艘船舶（含其他碼頭或碼頭未標示）');
 if(scope?.unassignedShips)add('scope-no-wharf','review',fmt(scope.unassignedShips)+' 艘船舶未標示碼頭，未列入本頁船數與櫃數');
 if(scope?.excludedRecords)notes.push('本月已排除其他碼頭 '+fmt(scope.excludedRecords)+' 筆作業明細');
 if(scope?.unassignedRecords)add('scope-unassigned','review',fmt(scope.unassignedRecords)+' 筆作業明細沒有可確認的碼頭或 AQC，未列入統計');
 if(scope?.conflictingRecords)add('scope-conflict','review',fmt(scope.conflictingRecords)+' 筆作業明細的碼頭與吊桿編號衝突，未列入統計');
 if(!stats.ships?.length&&!stats.records?.length){
  return {alerts,notes,verdict:'尚無本月 79／80 碼頭正式資料，無法核對'};
 }
 if(!stats.ships?.length)add('no-vessel','review','尚無 79／80 碼頭的完工船舶主檔，無法完成正式總量核對');
 if(!stats.records?.length)add('no-working-report','review','尚無 79／80 碼頭 WORKING REPORT 明細，無法核對逐桿與班別');
 if(totals.missing)add('master-missing','review',fmt(totals.missing)+' 艘船的主要數量欄位缺漏，部分加總可能偏低');
 if(totals.undated)add('completion-date','review',fmt(totals.undated)+' 艘船缺少完工日期，可能未列入每日統計');
 if(totals.bundleUnknown)add('bundle-unknown','review',fmt(totals.bundleUnknown)+' 艘船的作業量差異沒有已知 Bundle 數，請核對 WORKING SHEET');
 if(totals.bundleMismatch)add('bundle-mismatch','review',fmt(totals.bundleMismatch)+' 艘船扣除已知 Bundle 後仍有差額，請核對來源欄位');
 const byPort={};
 for(const wharf of stats.byWharf||[]){
  const code=portFor(wharf.wharf);if(!code)continue;
  if(!byPort[code])byPort[code]={ships:0,disc:0,load:0,billed:0,moves:0,shift:0};
  for(const key of ['ships','disc','load','billed','moves','shift'])byPort[code][key]+=Number(wharf[key]||0);
 }
 for(const code of ['79','80']){
  const master=byPort[code],rod=ports[code];
  if(!master)continue;
  if(differs(master.moves,master.billed+master.shift))
    add('move-'+code,'review',code+'碼頭總 Moves '+fmt(master.moves)+'，與作業量＋SHIFT（'+fmt(master.billed+master.shift)+'）差 '+signed(master.moves-master.billed-master.shift)+'；需核對移櫃等欄位');
  if(!rod||!rod.hasRodData){
    add('rod-missing-'+code,'review',code+'碼頭沒有可核對的逐桿卸裝回報');
    continue;
  }
  if(rod.incomplete){
    add('rod-incomplete-'+code,'review',code+'碼頭有逐桿 DISC／LOAD 欄位缺漏，暫不做完整櫃數對帳');
    continue;
  }
  if(rod.noRecords)notes.push(code+'碼頭有 '+fmt(rod.noRecords)+' 支吊桿本月無逐桿紀錄，請確認是否待命或來源未同步');
  const raw=master.disc+master.load;
  if(differs(rod.rodQuantity,raw))
    add('raw-'+code,'review',code+'碼頭 WORKING REPORT 逐桿合計 '+fmt(rod.rodQuantity)+'，WORKING SHEET 原始卸＋裝 '+fmt(raw)+'，差 '+signed(rod.rodQuantity-raw)+' 櫃');
  const billDiff=rod.rodQuantity-master.billed;
  if(differs(rod.rodQuantity,master.billed)){
    if(!differs(billDiff,master.shift))
      notes.push(code+'碼頭逐桿合計比正式作業量多 '+fmt(billDiff)+' 櫃，與 SHIFT '+fmt(master.shift)+' 相同；此為可能的統計口徑差異，仍以正式來源為準');
    else if(!differs(rod.rodQuantity,master.moves))
      notes.push(code+'碼頭逐桿櫃數與總 Moves 相同、但與正式作業量不同，需注意統計口徑');
    else
      add('billed-'+code,'review',code+'碼頭逐桿合計 '+fmt(rod.rodQuantity)+'，正式作業量 '+fmt(master.billed)+'，差 '+signed(billDiff)+' 櫃');
  }
 }
 return {alerts,notes,verdict:alerts.length?fmt(alerts.length)+' 項資料需核對':'目前未發現可判定的來源差異（僅限已有的資料欄位）'};
}
function render(stats,scope){
 const mount=document.getElementById('terminalReconciliationMount');
 if(!mount)return;
 const result=audit(stats,scope);
 const item=a=>'<li class="p79-audit-item"><span class="p79-audit-symbol">!</span><span>'+a.message+'</span></li>';
 const infos=result.notes.length?'<div class="p79-audit-notes">'+result.notes.map(v=>'<div>• '+v+'</div>').join('')+'</div>':'';
 mount.innerHTML='<section class="p79-audit-panel" aria-label="碼頭資料差異核對">'+
  '<div class="p79-audit-head"><div><span class="p79-audit-eyebrow">SOURCE RECONCILIATION</span><h3>🔎 資料差異自動核對</h3></div>'+
  '<strong class="p79-audit-count">'+result.verdict+'</strong></div>'+
  (result.alerts.length?'<ul class="p79-audit-list">'+result.alerts.map(item).join('')+'</ul>':
   '<p class="p79-audit-clear">'+(stats.ships.length||stats.records.length?'已檢查現有資料；下列範圍與口徑說明仍需留意':'尚無正式資料可核對')+'</p>')+
  infos+'<p class="p79-audit-foot">只比對所選月份、79／80 碼頭；異常代表來源差異或資料不足，不會自動更改 WORKING SHEET、WORKING REPORT、船舶主檔或人工分類。</p></section>';
}
root.P79TerminalDataAudit={audit,render};
})(window);
