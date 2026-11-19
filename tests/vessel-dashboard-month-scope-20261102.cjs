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
  // Verified replacement filtering has its own source-backed regression test.
  p79VerifiedCorrectedVesselAliases:()=>new Map(),
  p79IsSupersededCorrectedVesselRow:()=>false,
  normalizeShipText:v=>String(v||'').trim().replace(/\s+/g,' ').toUpperCase(),
  dashboardDateRange:()=>({active:false}),
  shipMasterMatchesDashboardRange:()=>true,dateWithinDashboardRange:()=>true,
  num:v=>Number(v)||0,compareWorkingNoDesc:(a,b)=>String(b.workingNo).localeCompare(String(a.workingNo)),
  mergeShipMasterOne:(a,b)=>({...a,...b})
};
vm.createContext(c);
for(const name of [
  'shipMasterKey','shipCompletionMonth','shipCompletionIndex','recordCompletionMonth','recordIsCurrentShipDetail',
  'shipMasterDateMatchesMonth','shipMasterDateMatchesYear','vesselJobRows',
  'vesselImportCallNumber','p79IsSupersededOrphanWorkingReportRow',
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

// Regression for the reported ghost: old 5290042 exists ONLY in legacy
// WORKING REPORT rows, while new 5260042 is the sole real ship master.
// Prior recordMap fallback recreated the old row, whose audit button then
// failed with "找不到這艘船的主檔資料".
const savedMasters=c.shipMasters,savedRecords=c.records;
const corrected={
 workingNo:'5260042',sourceWorkingNo:'5290042',vessel:'WAN HAI 290',
 voyageI:'N085',voyageE:'N085',wharf:'79R',
 firstDate:'2026-06-10',lastDate:'2026-06-10',compareDate:'2026-06-10',
 totalContainers:471,totalMoves:473,hatches:6,shiftMoves:2,
 workingSheetImportedAt:'2026-11-19T05:27:00Z',
 workingSheetSource:{sourceWorkingNo:'5290042',importedAt:'2026-11-19T05:27:00Z',
  totalMoves:473,totalContainers:471}
};
const oldRow={
 id:'old1',source:'working-report',workingNo:'5290042',sourceWorkingNo:'5290042',
 shipName:'WAN HAI 290',vessel:'WAN HAI 290',voyageI:'N085',voyageE:'N085',
 wharf:'79R',workDate:'2026-06-10',disc:185,load:0,hatches:0,
 sheetTotalContainers:471,sheetTotalMoves:473,sheetHatches:6,sheetShiftMoves:2,
 workingSheetImportedAt:'2026-11-19T04:00:00Z',manualOverrides:{}
};
c.shipMasters=[corrected];c.records=[oldRow];
doc.filterMonth.value='2026-06';
assert.equal(c.p79IsSupersededOrphanWorkingReportRow(oldRow,c.shipMasters),true);
let june=c.vesselJobRows();
assert.deepEqual(Array.from(june,x=>x.workingNo),['5260042'],
  'orphan 5290042 must not regenerate a clickable ship with missing master');
assert.equal(june.reduce((n,x)=>n+x.totalMoves,0),473);
for(const bad of [
 {...oldRow,sourceFileName:'WAN HAI 290 第二靠.xlsx'},
 {...oldRow,wharf:'80R'},
 {...oldRow,voyageI:'N086',voyageE:'N086'},
 {...oldRow,workDate:'2026-06-11'},
 {...oldRow,workingSheetImportedAt:'2026-11-19T06:00:00Z'},
 {...oldRow,manualEditedAt:'2026-11-19T05:50:00Z'},
 {...oldRow,sourceWorkingNo:'5299999'}
])assert.equal(c.p79IsSupersededOrphanWorkingReportRow(bad,c.shipMasters),false,
  'different or manual operation remains untouched');
const sourceOnly={...oldRow,workingNo:'5260999',sourceWorkingNo:'5260999'};
assert.equal(c.p79IsSupersededOrphanWorkingReportRow(sourceOnly,c.shipMasters),false,
  'unrelated source-only WORKING REPORT is not accidentally removed');
c.shipMasters=savedMasters;c.records=savedRecords;
assert(html.includes('.filter(x=>!activeDashboardMonth||String(x.accountingMonth||\'\')===activeDashboardMonth)'),'dashboard table and KPI share final month guard');
console.log('PASS 2026-09/10/11 completion-month roster, 09/30 and 10/31 rollover, visible date, KPI and list scope');
