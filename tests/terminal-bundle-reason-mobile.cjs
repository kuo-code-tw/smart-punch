'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const js=fs.readFileSync('aqc-efficiency/terminal-ops.js','utf8');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
assert(html.includes('<th>Bundle 扣除</th>'));
assert(html.includes('<th>待核差額</th>'));
assert(html.includes('<th>原因分類（點選修改）</th>'));
assert(html.includes('@container (max-width:900px)'),'small tables switch into responsive cards');
assert(html.includes('overflow-x:hidden!important'),'mobile tables do not horizontally scroll');
assert(html.includes('@media (min-width:1051px)'),'desktop panels have a dedicated two-column layout');
assert(html.includes('#view-terminal .p79-ter-columns{grid-template-columns:repeat(2,minmax(0,1fr))}'),'daily and shift panels display left and right');
assert(html.includes('#view-terminal .p79-ter-table-wrap{container-type:normal;overflow-x:hidden;overflow-y:auto}'),'desktop tables retain compact rows without horizontal scrolling');
assert(html.includes('#view-terminal .p79-ter-columns .p79-ter-table{font-size:10.8px}'),'side-by-side tables use tighter cell typography');
assert(!html.includes('#view-terminal .p79-ter-columns{grid-template-columns:1fr}\n#view-terminal .p79-ter-table-wrap'),'remove the global forced stacked panels');
const store=new Map();
const localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
const ship=(no,day,disc,load,bill,bundle)=>({
 workingNo:no,wharf:'79R',vessel:no,lastDate:day,totalContainers:bill,totalMoves:bill+10,
 workingSheetSource:{disc,load,...(bundle===undefined?{}:{bundleDeduct:bundle})}
});
const ships=[
 ship('001','2026-11-08',861,797,1654,4),
 ship('002','2026-11-08',40,60,100),
 ship('003','2026-11-07',41,59,94),
 ship('004','2026-11-06',70,30,96,4),
 ship('005','2026-11-06',100,100,202,0)
];
const records=[{id:'wr1',source:'working-report',workingNo:'001',workDate:'2026-11-08',
 number:'7902',startTime:'03:00',endTime:'04:00',note:'0331-0348 AQC故障跳電'}];
function app(){
 const cell={dataset:{},attrs:{},hasAttribute:()=>false,setAttribute(k,v){this.attrs[k]=v}};
 const fakeTable={querySelectorAll:q=>q==='thead th'?[{textContent:'完工日期'}]:q==='tbody tr'?[{querySelectorAll:()=>[cell]}]:[]};
 const els=Object.fromEntries([
  'terminalDashboardRoot','terminalMonth','terminalKpi','terminalWharfBody',
  'terminalDayBody','terminalShiftBody','terminalStopBody','terminalStopCategoryKpis',
  'terminalStopDetailBody','terminalStopDetailCaption','terminalDataStatus',
  'terminalWarnings','terminalMonthCaption'
 ].map(id=>[id,{value:id==='terminalMonth'?'2026-11':'',dataset:{},innerHTML:'',textContent:''}]));
 els.terminalMonth.dataset.p79Year='2026';
 els.terminalDashboardRoot.querySelectorAll=q=>q==='.p79-ter-table'?[fakeTable]:[];
 const ctx={window:{},document:{getElementById:id=>els[id]},console:{warn(){}},
  shipMasters:ships,records,getPort79Year:()=>2026,
  shipMasterDateMatchesMonth:(s,m)=>String(s.lastDate||'').startsWith(m),
  GC_FULL_READ_TIMEOUT_MS:90000,localStorage,apiGetQuick:async()=>({ok:true,shipMasters:ships,records})};
 vm.createContext(ctx);vm.runInContext(js,ctx);
 return {api:ctx.window.P79TerminalOps,els,cell};
}
let {api,els,cell}=app();
const stats=api.build('2026-11',ships,records);
assert.equal(stats.vesselTotals.bundle,8,'sum known Bundle 4+4');
assert.equal(stats.vesselTotals.bundleUnknown,1,'unexplained raw-to-billed discrepancy without a Bundle source');
assert.equal(stats.vesselTotals.bundleMismatch,1,'known zero Bundle cannot cover negative raw diff');
assert.equal(stats.byDay[0].day,'2026-11-08','newest first');
assert.equal(stats.byDay[0].bundle,4);
assert.equal(stats.byDay[0].bundleMismatch,0,'11/08: 861+797-4=1654');
assert.equal(stats.byDay[1].bundleUnknown,1,'11/07 must not claim missing 6 as Bundle');
assert.equal(stats.byDay[2].bundleMismatch,1,'11/06 +2 mismatch is flagged');
api.render();
assert(els.terminalDayBody.innerHTML.includes('861'));
assert(els.terminalDayBody.innerHTML.includes('p79-ter-bundle'));
assert(els.terminalDayBody.innerHTML.includes('p79-ter-bundle-value'),'Bundle number has hover target');
assert(els.terminalDayBody.innerHTML.includes('title="001：扣 4"'),'hover shows original per-ship Bundle deduction');
assert(!els.terminalDayBody.innerHTML.includes('查看 Bundle 明細'),'no second-line click or expandable detail');
assert(!els.terminalDayBody.innerHTML.includes('<details'),'Bundle detail must not take additional row height');
assert(els.terminalDayBody.innerHTML.includes('待核對'),'unknown Bundle marked review');
assert(els.terminalStopDetailBody.innerHTML.includes('setReasonCategory'));
assert(els.terminalStopDetailBody.innerHTML.includes('自動：設備故障'));
assert.equal(cell.attrs['data-label'],'完工日期','responsive cells receive visible label');
const key=stats.stopDetails[0].eventKey;
assert(api.setReasonCategory(encodeURIComponent(key),'鎖具問題'));
assert.equal(api.build('2026-11',ships,records).byStop[0].reason,'鎖具問題');
assert(els.terminalStopDetailBody.innerHTML.includes('已手動分類'));
({api,els}=app());
assert.equal(api.build('2026-11',ships,records).byStop[0].reason,'鎖具問題','override survives new app instance');
assert(api.setReasonCategory(encodeURIComponent(key),''));
assert.equal(api.build('2026-11',ships,records).byStop[0].reason,'設備故障','clear manual returns to automatic');
console.log('PASS terminal Bundle, unknown gap, mismatches, date ordering, edit reason, local persistence, compact labels');
