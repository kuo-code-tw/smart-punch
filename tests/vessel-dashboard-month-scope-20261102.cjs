'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const versionView=require('../assets/port79-vessel-versions.js');
function fn(name){
  const p=html.indexOf('function '+name+'(');
  assert(p>=0,'function exists: '+name);
  const end=html.indexOf('\n}',p);assert(end>p,name);
  return html.slice(p,end+2);
}
const source=[
  {workingNo:'5260099',vessel:'SEPTEMBER',firstDate:'2026-09-29',lastDate:'2026-09-30',totalContainers:11,totalMoves:11},
  {workingNo:'5260100',vessel:'SEPTEMBER START',firstDate:'2026-09-30',lastDate:'2026-10-01',compareDate:'2026-09-30',totalContainers:50,totalMoves:50},
  {workingNo:'5260101',vessel:'OCTOBER',firstDate:'2026-10-30',lastDate:'2026-10-31',totalContainers:100,totalMoves:100},
  {workingNo:'5260102',vessel:'OCTOBER START',firstDate:'2026-10-31',lastDate:'2026-11-01',compareDate:'2026-10-31',totalContainers:200,totalMoves:200}
];
const doc={filterMonth:{value:'2026-10'},dashboardTableFilterState:{textContent:''}};
const c={
  Date,Set,Map,Number,String,Array,records:[],
  document:{getElementById:id=>doc[id]||null},
  shipMasters:source,window:{P79VesselVersionView:versionView},getPort79Year:()=> '2026',
  canonicalShipMasters:x=>x,applyShipManualOverrides:x=>x,
  dashboardDateRange:()=>({active:false}),
  shipMasterMatchesDashboardRange:()=>true,dateWithinDashboardRange:()=>true,
  num:v=>Number(v)||0,compareWorkingNoDesc:(a,b)=>String(b.workingNo).localeCompare(String(a.workingNo)),
  mergeShipMasterOne:(a,b)=>({...a,...b})
};
vm.createContext(c);
for(const name of [
  'shipMasterKey','shipCompletionMonth','shipCompletionIndex','recordCompletionMonth','recordIsCurrentShipDetail',
  'shipMasterDateMatchesMonth','shipMasterDateMatchesYear','vesselJobRows',
  'normalizeIsoDateOnly','dashboardJobDateValue','updateDashboardTableFilterState'
])vm.runInContext(fn(name),c);

function check(month,names,qty){
  doc.filterMonth.value=month;
  const got=c.vesselJobRows();
  assert.deepEqual(Array.from(got,x=>x.vessel).sort(),names.sort(),month+' completed vessels only');
  assert.equal(got.reduce((s,x)=>s+x.totalContainers,0),qty,month+' KPI scope');
  assert(got.every(x=>!month||x.accountingMonth===month));
  return got;
}
const october=check('2026-10',['SEPTEMBER START','OCTOBER'],150);
assert.equal(c.dashboardJobDateValue(october.find(x=>x.workingNo==='5260100')),'2026-10-01','cross-month job displays October completion, not September start');
c.updateDashboardTableFilterState(october.length,october.length);
assert.match(doc.dashboardTableFilterState.textContent,/2026年10月完工船舶.*2 \/ 2 艘/);
check('2026-09',['SEPTEMBER'],11);
check('2026-11',['OCTOBER START'],200);
check('2026-10',['SEPTEMBER START','OCTOBER'],150);
const yearly=check('',source.map(x=>x.vessel),361);
assert.equal(yearly.length,4,'all month selection is year-scoped only');
assert(html.includes('.filter(x=>!activeDashboardMonth||String(x.accountingMonth||\'\')===activeDashboardMonth)'),'dashboard table and KPI share final month guard');
console.log('PASS 2026-09/10/11 completion-month roster, 09/30 and 10/31 rollover, visible date, KPI and list scope');
