/* 航線資料管理：照片版型 UI；所有櫃量來自 WORKING SHEET SERVICE(I/E) 正式摘要。 */
(function(root){
'use strict';
if(!root||!root.document)return;
const $=id=>root.document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('zh-TW',{maximumFractionDigits:2});
const state={model:null,sort:'code',type:'all',view:'table',tab:'basic',collapsed:false,expanded:new Set(),selected:''};
const names={CIX:'中國－印度快線',CL1:'中國－呂宋一線',FOC:'福州－廈門－台灣航線',HPH:'台灣－海防航線',JST:'日本關西－泰國航線',JSV:'日本關西－越南航線',JTT:'日本關東－泰國航線',MHT:'民答那峨－香港－台灣航線',TPI:'台灣－中國大陸－印尼航線'};
const name=code=>typeof root.p79RouteChineseName==='function'?root.p79RouteChineseName(code):names[code]||'中文名稱待補';
const num=v=>Number(v)||0;
const sums=(list,key)=>list.reduce((n,row)=>n+num(row[key]),0);
const keyMonth=v=>/^\d{4}-\d{2}$/.test(String(v||''))?String(v):'';
function monthsEnding(last,count=6){
 const parts=String(last||'').match(/^(\d{4})-(\d{2})$/);
 if(!parts)return [];
 const value=Number(parts[1])*12+Number(parts[2])-1;
 return Array.from({length:count},(_,i)=>{
  const m=value-count+1+i;
  return Math.floor(m/12)+'-'+String(m%12+1).padStart(2,'0');
 });
}
function trendRows(model,code){
 const months=monthsEnding(model.month);
 return months.map(m=>{
  let found=null;
  if(m===model.month)found=model.all.find(row=>row.route===code);
  else{
   const ships=(model.historyMasters||[]).filter(s=>{
    const d=String(s.compareMonth||s.compareDate||s._cloudLastDate||s.lastDate||s.firstDate||s.workingSheetSource?.compareDate||'');
    return d.slice(0,7)===m;
   });
   if(ships.length&&typeof root.routeStatsForShips==='function')
     found=root.routeStatsForShips(ships).find(row=>row.route===code);
  }
  return {month:m,disc:found?num(found.disc):null,load:found?num(found.load):null};
 });
}
function sparkBars(summary,month){
 const monthDays=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()||30;
 const buckets=Array(8).fill(0);
 let count=0;
 for(const d of summary.details||[]){
  const date=String(d.date||'');
  if(!date.startsWith(month+'-'))continue;
  const day=Number(date.slice(8,10)),quantity=Number(d.quantity);
  if(!Number.isFinite(day)||day<1||!Number.isFinite(quantity))continue;
  buckets[Math.min(7,Math.floor((day-1)*8/monthDays))]+=quantity;count++;
 }
 if(!count)return '<span class="p79-rm-unknown-trend" title="缺少當月作業日期">—</span>';
 const highest=Math.max(1,...buckets);
 return buckets.map(x=>'<span style="height:'+Math.max(2,Math.round(30*x/highest))+'px" title="'+fmt(x)+' 櫃"></span>').join('');
}
function setStat(id,value){const n=$(id);if(n)n.textContent=fmt(value);}
function matchTopMonth(month){
 const base=$('routeMonthFilter'),top=$('routeTopMonthFilter');
 if(!base||!top)return;
 if(top.dataset.monthYear!==String(base.dataset.p79Year||'')||top.options.length!==base.options.length){
  top.innerHTML=Array.from(base.options||[]).map(option=>
    '<option value="'+esc(option.value)+'">'+esc(String(option.value||'').replace('-','/'))+'</option>'
  ).join('');
  top.dataset.monthYear=String(base.dataset.p79Year||'');
 }
 top.value=month;
}
function selectedRoute(list){
 const matched=list.find(r=>r.route===state.selected)||list.find(r=>r.route===state.model?.selected?.route);
 return matched||list[0]||null;
}
function actualRows(){
 if(!state.model)return [];
 const rows=state.model.rows.filter(r=>state.type==='all'||state.type==='import'&&r.importCalls>0||state.type==='export'&&r.exportCalls>0).slice();
 if(state.sort==='total')rows.sort((a,b)=>b.total-a.total||a.route.localeCompare(b.route,'en'));
 else if(state.sort==='import')rows.sort((a,b)=>b.importCalls-a.importCalls||a.route.localeCompare(b.route,'en'));
 else if(state.sort==='export')rows.sort((a,b)=>b.exportCalls-a.exportCalls||a.route.localeCompare(b.route,'en'));
 else rows.sort((a,b)=>a.route==='未分類'?1:b.route==='未分類'?-1:a.route.localeCompare(b.route,'en',{numeric:true}));
 return rows;
}
function renderTable(rows,month,selected){
 const body=$('routeManagerTableBody'),foot=$('routeManagerTableFoot');if(!body||!foot)return;
 body.innerHTML=rows.length?rows.map(row=>{
  const k=esc(row.route),chosen=selected?.route===row.route,expanded=state.expanded.has(row.route);
  const summary=(row.details||[]).slice(0,8).map(d=>esc(d.vessel||d.workingNo||'—')+'（'+esc(d.direction)+' '+fmt(d.quantity)+' 櫃）').join('　•　');
  return '<tr class="'+(chosen?'p79-rm-selected':'')+'">'+
   '<td><button type="button" class="p79-rm-row-arrow" data-expand-route="'+k+'" aria-label="'+(expanded?'收合':'展開')+' '+k+' 船舶明細">'+(expanded?'⌄':'›')+'</button></td>'+
   '<td class="p79-rm-route-code">'+k+'</td><td class="p79-rm-name">'+esc(name(row.route))+'</td>'+
   '<td>'+fmt(row.importCalls)+'</td><td>'+fmt(row.exportCalls)+'</td>'+
   '<td>'+fmt(row.disc)+(row.missingDisc?' *':'')+'</td><td>'+fmt(row.load)+(row.missingLoad?' *':'')+'</td>'+
   '<td class="p79-rm-total">'+fmt(row.total)+(row.missingDisc+row.missingLoad?' *':'')+'</td>'+
   '<td><div class="p79-rm-spark" aria-label="當月作業分布" title="當月作業分布">'+sparkBars(row,month)+'</div></td>'+
   '<td><button type="button" class="p79-rm-row-detail" data-select-route="'+k+'">⌕ 查看明細</button></td></tr>'+
   (expanded?'<tr class="p79-rm-expanded-row"><td colspan="10"><div class="p79-rm-inline-detail">'+(summary||'目前沒有可顯示的船舶明細')+'</div></td></tr>':'');
 }).join(''):'<tr><td colspan="10" class="p79-rm-empty">目前沒有符合的航線資料</td></tr>';
 foot.innerHTML='<tr><td colspan="3">當月合計</td><td>'+fmt(sums(rows,'importCalls'))+'</td><td>'+
 fmt(sums(rows,'exportCalls'))+'</td><td>'+fmt(sums(rows,'disc'))+'</td><td>'+fmt(sums(rows,'load'))+
 '</td><td>'+fmt(sums(rows,'total'))+'</td><td>—</td><td>—</td></tr>';
}
function fact(label,value,symbol){
 return '<div class="p79-rm-fact"><span class="p79-rm-fact-label">'+symbol+'　'+esc(label)+'</span><span class="p79-rm-fact-value">'+esc(value)+'</span></div>';
}
function chart(code,model){
 const data=trendRows(model,code),peak=Math.max(1,...data.map(d=>Math.max(d.disc||0,d.load||0)));
 const upper=Math.max(100,Math.ceil(peak/500)*500),ticks=[upper,upper*.75,upper*.5,upper*.25,0];
 const note=data.some(d=>d.disc===null)?'未載入的歷史月份以空白顯示，不用假數據補齊。':'依已載入的正式船舶作業量統計。';
 return '<div class="p79-rm-chart-panel">'+
  '<div class="p79-rm-chart-heading">近 6 個月櫃數趨勢 <span class="p79-rm-legend"><span><b style="background:#247ef2"></b>卸船櫃數</span><span><b style="background:#ff902d"></b>裝船櫃數</span></span></div>'+
  '<div class="p79-rm-chart"><div class="p79-rm-axis">'+ticks.map(v=>'<span>'+fmt(v)+'</span>').join('')+'</div>'+
  '<div><div class="p79-rm-plot">'+data.map(d=>'<div class="p79-rm-month-pair">'+
   '<span class="p79-rm-bar" title="'+esc(d.month)+' 卸船 '+(d.disc===null?'未載入':fmt(d.disc))+'" style="height:'+(d.disc===null?0:Math.max(0,Math.round(d.disc/upper*100)))+'%"></span>'+
   '<span class="p79-rm-bar load" title="'+esc(d.month)+' 裝船 '+(d.load===null?'未載入':fmt(d.load))+'" style="height:'+(d.load===null?0:Math.max(0,Math.round(d.load/upper*100)))+'%"></span></div>').join('')+'</div>'+
  '<div class="p79-rm-chart-months">'+data.map(d=>'<span>'+esc(d.month.replace('-','/'))+'</span>').join('')+'</div></div></div>'+
  '<p class="p79-rm-note">'+esc(note)+'</p></div>';
}
function tabMarkup(route,model){
 if(state.tab==='vessels'){
  return '<div class="p79-rm-detail-rows"><table><thead><tr><th>作業日期</th><th>船名</th><th>I/E</th><th>航次</th><th>櫃數</th></tr></thead><tbody>'+
   [...route.details].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map(d=>'<tr>'+
    [d.date,d.vessel,d.direction,d.voyage,d.quantity===null?'—':fmt(d.quantity)].map(v=>'<td>'+esc(v||'—')+'</td>').join('')+
   '</tr>').join('')+'</tbody></table></div>'+chart(route.route,model);
 }
 if(state.tab==='trend')return chart(route.route,model);
 if(state.tab==='history'){
  const data=trendRows(model,route.route);
  return '<div class="p79-rm-detail-rows"><table><thead><tr><th>月份</th><th>卸船櫃數</th><th>裝船櫃數</th><th>總櫃數</th></tr></thead><tbody>'+
  data.map(d=>'<tr><td>'+esc(d.month)+'</td><td>'+(d.disc===null?'未載入':fmt(d.disc))+'</td><td>'+
  (d.load===null?'未載入':fmt(d.load))+'</td><td>'+(d.load===null||d.disc===null?'—':fmt(d.load+d.disc))+'</td></tr>').join('')+
  '</tbody></table></div>'+chart(route.route,model);
 }
 return '<div class="p79-rm-facts">'+
 fact('航線代碼',route.route,'⚓')+fact('中文名稱',name(route.route),'◇')+
 fact('統計月份',model.month.replace('-','/'),'▦')+
 fact('進口艘次',fmt(route.importCalls)+' 次','⛴')+
 fact('出口艘次',fmt(route.exportCalls)+' 次','⛴')+'</div>'+
 '<div class="p79-rm-small-kpis"><div class="p79-rm-small-kpi"><span>▥ 卸船櫃數</span><strong>'+fmt(route.disc)+' <small>櫃</small></strong></div>'+
 '<div class="p79-rm-small-kpi"><span>◇ 裝船櫃數</span><strong>'+fmt(route.load)+' <small>櫃</small></strong></div>'+
 '<div class="p79-rm-small-kpi"><span>▱ 總櫃數</span><strong>'+fmt(route.total)+' <small>櫃</small></strong></div></div>'+chart(route.route,model);
}
function renderPanel(selected){
 const panel=$('routeManagerDetailPanel'),code=$('routeManagerDetailCode'),nameEl=$('routeManagerDetailName'),body=$('routeManagerDetailBody');
 if(!panel||!body)return;
 const tabs=panel.querySelector('.p79-rm-side-tabs'),collapse=$('routeManagerDetailCollapse');
 if(tabs)tabs.hidden=state.collapsed;
 body.hidden=state.collapsed;
 if(collapse){collapse.setAttribute('aria-expanded',String(!state.collapsed));collapse.textContent=state.collapsed?'+':'−';}
 if(state.collapsed)return;
 if(code)code.textContent=selected?.route||'—';
 if(nameEl)nameEl.textContent=selected?name(selected.route):'選取航線後查看明細';
 for(const button of panel.querySelectorAll('[data-rm-tab]')){
  const active=button.dataset.rmTab===state.tab;
  button.setAttribute('aria-selected',String(active));
 }
 body.innerHTML=selected?tabMarkup(selected,state.model):'<div class="p79-rm-empty">沒有可顯示的航線，請調整搜尋條件。</div>';
}
function render(model){
 if(!model)return;
 state.model=model;
 matchTopMonth(model.month);
 for(const [id,key] of [['routeManagerTotalRoutes','route'],['routeManagerImportCalls','importCalls'],['routeManagerExportCalls','exportCalls'],['routeManagerDisc','disc'],['routeManagerLoad','load'],['routeManagerTotal','total']]){
  setStat(id,key==='route'?model.all.length:sums(model.all,key));
 }
 const rows=actualRows(),chosen=selectedRoute(rows);
 if(chosen&&!state.selected)state.selected=chosen.route;
 renderTable(rows,model.month,chosen);
 renderPanel(chosen);
 const status=$('routeManagerStatus');if(status){
  const current=$('routeMonthStatus');
  status.textContent=current?.textContent||'正在讀取船舶資料';
  status.dataset.state=current?.dataset?.state||'loading';
 }
 const table=$('routeManagerTableSection'),grid=$('routeManagerGridShell');
 if(table)table.hidden=state.view!=='table';
 if(grid)grid.hidden=state.view!=='grid';
 for(const btn of root.document.querySelectorAll('[data-rm-view]'))
  btn.setAttribute('aria-pressed',String(btn.dataset.rmView===state.view));
}
function select(route){
 if(!state.model)return;
 state.selected=String(route||'');state.collapsed=false;state.tab='basic';
 const i=state.model.rows.findIndex(row=>row.route===state.selected);
 if(i>=0&&typeof root.p79SelectRoute==='function')root.p79SelectRoute(i);
 else render(state.model);
}
function toggleExpand(route){
 if(state.expanded.has(route))state.expanded.delete(route);else state.expanded.add(route);
 render(state.model);
}
function setTab(which){
 if(!['basic','vessels','trend','history'].includes(which))return;
 state.tab=which;render(state.model);
}
function setView(which){
 if(!['table','grid'].includes(which))return;
 state.view=which;render(state.model);
}
function setType(which){state.type=['all','import','export'].includes(which)?which:'all';render(state.model);}
function setSort(which){state.sort=['code','total','import','export'].includes(which)?which:'code';render(state.model);}
function monthChanged(value){
 const m=keyMonth(value),select=$('routeMonthFilter');
 if(!m||!select)return;
 select.value=m;
 state.selected='';state.expanded.clear();
 if(typeof root.p79LoadRouteMonth==='function')void root.p79LoadRouteMonth(true);
}
async function sync(){
 const btn=$('routeManagerSyncBtn');
 if(btn){btn.disabled=true;btn.textContent='⟳ 同步中…';}
 try{
  // Keep the existing production upload/readback workflow; never fake success.
  if(typeof root.manualCloudSync==='function')await root.manualCloudSync();
  if(typeof root.p79LoadRouteMonth==='function')await root.p79LoadRouteMonth(true);
 }finally{
  if(btn){btn.disabled=false;btn.textContent='⟳ 同步船舶資料';}
 }
}
function exportCsv(){
 if(!state.model)return;
 const lines=[['航線代碼','中文航線名稱','進口艘次','出口艘次','卸船櫃數','裝船櫃數','總櫃數']];
 for(const r of actualRows())lines.push([r.route,name(r.route),r.importCalls,r.exportCalls,r.disc,r.load,r.total]);
 const csv='\ufeff'+lines.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=root.document.createElement('a');
 a.href=url;a.download='航線資料管理_'+state.model.month+'.csv';root.document.body.appendChild(a);a.click();a.remove();
 root.setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function bind(){
 const tbody=$('routeManagerTableBody');
 if(tbody)tbody.addEventListener('click',e=>{
  const target=e.target.closest('button[data-expand-route],button[data-select-route]');
  if(!target)return;
  if(target.dataset.expandRoute!==undefined)toggleExpand(target.dataset.expandRoute);
  else if(target.dataset.selectRoute!==undefined)select(target.dataset.selectRoute);
 });
 const filter=$('routeTypeFilter'),sort=$('routeSortFilter');
 if(filter)filter.addEventListener('change',()=>setType(filter.value));
 if(sort)sort.addEventListener('change',()=>setSort(sort.value));
 for(const button of root.document.querySelectorAll('[data-rm-view]'))
  button.addEventListener('click',()=>setView(button.dataset.rmView));
 for(const button of root.document.querySelectorAll('[data-rm-tab]'))
  button.addEventListener('click',()=>setTab(button.dataset.rmTab));
 const collapse=$('routeManagerDetailCollapse');
 if(collapse)collapse.addEventListener('click',()=>{
  state.collapsed=!state.collapsed;render(state.model);
 });
 const top=$('routeTopMonthFilter');if(top)top.addEventListener('change',()=>monthChanged(top.value));
 const syncBtn=$('routeManagerSyncBtn');if(syncBtn)syncBtn.addEventListener('click',()=>void sync());
 const exportBtn=$('routeManagerExportBtn');if(exportBtn)exportBtn.addEventListener('click',exportCsv);
 const compare=$('routeManagerCompareNav');if(compare)compare.addEventListener('click',()=>$('routeManagerTableSection')?.scrollIntoView({behavior:'smooth',block:'start'}));
}
if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
root.P79RouteManager={render,select,toggleExpand,setView,setTab,setType,setSort,monthChanged,sync,exportCsv,monthsEnding};
})(typeof window!=='undefined'?window:null);
