'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/route-management-dashboard.css'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/route-management-dashboard.js'),'utf8');
assert.match(html,/data-tab="compare"[^>]*>🧭 航線資料管理<\/button>/,'original navigation renamed');
assert.match(html,/<h2>航線資料管理<\/h2>/,'route management headline');
assert.match(html,/id="routeManagerTotalRoutes"/);
assert.match(html,/id="routeManagerImportCalls"/);
assert.match(html,/id="routeManagerExportCalls"/);
assert.match(html,/id="routeManagerDisc"/);
assert.match(html,/id="routeManagerLoad"/);
assert.match(html,/id="routeManagerTotal"/);
assert.match(html,/id="routeManagerTableBody"/);
assert.match(html,/id="routeManagerDetailPanel"/);
assert.match(html,/id="routeManagerDetailBody"/);
assert.match(html,/id="routeManagerSyncBtn"/);
assert.match(html,/id="routeManagerExportBtn"/);
assert.match(html,/id="routeTopMonthFilter"/);
assert.match(html,/id="routeSearch"/);
assert.match(html,/id="routeTypeFilter"/);
assert.match(html,/id="routeSortFilter"/);
assert.match(html,/id="routeCardsGrid"/);
assert.match(html,/id="routeDetailBody"/,'original detail source kept for backwards compatibility');
assert.equal((html.match(/id="routeCardsGrid"/g)||[]).length,1,'single card grid instance');
assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/,'reference screenshot shows six header metrics');
assert.match(css,/grid-template-columns:minmax\(0,2\.82fr\) minmax\(340px,1fr\)/,'desktop has left table and right detail columns');
assert.match(css,/p79-rm-chart-panel/);
assert.match(css,/body:has\(#view-compare:not\(\.hidden\)\) #efficiencyHeader/,'screenshot nav replaces old header only on route view');
assert(!css.includes('background-image:url('),'screen must be functional HTML, not a pasted screenshot');
assert(html.includes('route-management-dashboard.css?v=20261110-reference-v1'));
assert(html.includes('route-management-dashboard.js?v=20261110-reference-v1'));
assert(html.includes('WORKING NO.')&&html.includes('SERVICE'),'live working-sheet data still drives statistics');
const node=()=>({dataset:{},innerHTML:'',textContent:'',hidden:false,style:{},options:[],value:'',
  setAttribute(name,value){this[name]=value;},querySelector(){return null;},querySelectorAll(){return []},
  addEventListener(){}});
const ids=['routeMonthFilter','routeTopMonthFilter','routeManagerTotalRoutes','routeManagerImportCalls',
 'routeManagerExportCalls','routeManagerDisc','routeManagerLoad','routeManagerTotal','routeManagerTableBody',
 'routeManagerTableFoot','routeManagerDetailPanel','routeManagerDetailCode','routeManagerDetailName',
 'routeManagerDetailBody','routeManagerDetailCollapse','routeManagerStatus','routeManagerTableSection','routeManagerGridShell',
 'routeMonthStatus'];
const nodes=Object.fromEntries(ids.map(id=>[id,node()]));
nodes.routeMonthFilter.options=[{value:'2026-11'}];
nodes.routeMonthFilter.dataset.p79Year='2026';
nodes.routeMonthFilter.value='2026-11';
nodes.routeMonthStatus.textContent='✓ 已讀取當月雲端資料';
nodes.routeMonthStatus.dataset.state='cloud';
const doc={
 getElementById:id=>nodes[id]||null,
 readyState:'loading',
 addEventListener(){},
 querySelectorAll(){return[];}
};
const root={document:doc,console,setTimeout(){},Date};
vm.createContext(root);vm.runInContext(script,root);
const api=root.P79RouteManager;
assert(api,'manager API must load');
assert.deepEqual(JSON.parse(JSON.stringify(api.monthsEnding('2026-11'))),['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']);
const rows=[
 {route:'CIX',importCalls:1,exportCalls:1,disc:996,load:819,total:1815,
  missingDisc:0,missingLoad:0,details:[{vessel:'SEASPAN BRISBANE',date:'2026-11-07',direction:'進口',quantity:996}]},
 {route:'CL1',importCalls:1,exportCalls:1,disc:508,load:162,total:670,
  missingDisc:0,missingLoad:0,details:[{vessel:'SHIP',date:'2026-11-08',direction:'出口',quantity:162}]}
];
const model={month:'2026-11',rows,all:rows,selected:null,historyMasters:[]};
api.render(model);
assert.equal(nodes.routeManagerTotalRoutes.textContent,'2');
assert.equal(nodes.routeManagerImportCalls.textContent,'2');
assert.equal(nodes.routeManagerDisc.textContent,'1,504');
assert.equal(nodes.routeManagerLoad.textContent,'981');
assert.equal(nodes.routeManagerTotal.textContent,'2,485');
assert(nodes.routeManagerTableBody.innerHTML.includes('CIX'));
assert(nodes.routeManagerTableBody.innerHTML.includes('中國－印度快線'));
assert(nodes.routeManagerTableBody.innerHTML.includes('⌕ 查看明細'));
assert(nodes.routeManagerTableFoot.innerHTML.includes('當月合計'));
assert(nodes.routeManagerDetailCode.textContent==='CIX','first route selected by default like reference');
assert(nodes.routeManagerDetailBody.innerHTML.includes('近 6 個月櫃數趨勢'));
assert(nodes.routeManagerDetailBody.innerHTML.includes('未載入的歷史月份以空白顯示'),'never invent historical bars');
assert(nodes.routeManagerTableSection.hidden===false&&nodes.routeManagerGridShell.hidden===true);
api.setView('grid');
assert(nodes.routeManagerTableSection.hidden===true&&nodes.routeManagerGridShell.hidden===false);
api.setView('table');
api.setSort('total');
assert(nodes.routeManagerTableBody.innerHTML.indexOf('CIX')<nodes.routeManagerTableBody.innerHTML.indexOf('CL1'));
api.select('CL1');
assert.equal(nodes.routeManagerDetailCode.textContent,'CL1');
api.setTab('vessels');
assert(nodes.routeManagerDetailBody.innerHTML.includes('船名'),'vessel tab is functional');
api.setTab('history');
assert(nodes.routeManagerDetailBody.innerHTML.includes('2026-06'),'history spans six months');
api.setType('import');
assert(nodes.routeManagerTableBody.innerHTML.includes('CL1'));
assert(!html.includes('<img src="./route-management-dashboard'),'rendered page must not be a flat mock image');
new vm.Script(script);
console.log('PASS route management reference layout: six KPIs, one-table + right detail, month, search/source guard, trend/no fabricated data, 4 tabs, sorting, grid toggle and one-time selected route');
