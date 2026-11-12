// Regressions: newly imported ships must appear first and never inherit stale cloud completion dates.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){
  const start=html.indexOf('function '+name+'(');
  assert(start>=0,'missing '+name);
  const finish=html.indexOf('\n}',start);
  assert(finish>start,'function end '+name);
  return html.slice(start,finish+2);
}
const fields={
  filterMonth:{value:'2026-11',options:[{value:'2026-11'},{value:'2026-10'}]},
  dashboardSortField:{value:'importedAt'},dashboardSortDir:{value:'desc'},
  dashboardStartDate:{value:''},dashboardEndDate:{value:''},
  dashboardFilterVessel:{value:''},dashboardFilterWharf:{value:''},dashboardEfficiencyFilter:{value:''}
};
const old={workingNo:'5260218',vessel:'WAN HAI 175',firstDate:'2026-11-10',lastDate:'2026-11-11',workingSheetImportedAt:'2026-11-11T01:00:00Z'};
const fresh={workingNo:'5260219',vessel:'WAN HAI 105',firstDate:'2026-10-29',lastDate:'2026-10-31',workingSheetImportedAt:'2026-11-12T02:01:00Z',
  workingSheetSource:{importedAt:'2026-11-12T02:01:00Z',totalContainers:816,hatches:26,totalMoves:816,shiftMoves:0,ruleVersion:'SHIFT_X2'}};
const FixedDate=class extends Date {
  constructor(...args){super(...(args.length?args:[Date.parse('2026-11-12T02:02:00Z')]));}
  static now(){return Date.parse('2026-11-12T02:02:00Z');}
};
const ctx={
  console,Date:FixedDate,Math,Number,String,Set,Array,
  document:{getElementById:id=>fields[id]},
  shipMasters:[old,fresh],shipManualOverrideCache:{},summaryCurrentPage:2,summaryLastFilterMonth:'prior',
  p79DashboardMonthSelectionExplicit:false,
  dashboardFilterText:()=>'',workingNoNumber:x=>Number(String(x).replace(/\D/g,''))||0,
  dashboardJobDateValue:x=>x.lastDate||'',dashboardCompareStatus:()=>'',num:x=>Number(x)||0,
  dashboardDateRange:()=>({active:false}),updateDashboardRangeState:()=>{},
  shipCompletionMonth:x=>x.lastDate.slice(0,7),shipOverrideKey:()=>'',applyShipManualOverrides:x=>x,records:[]
};
vm.createContext(ctx);
vm.runInContext([
  fn('vesselSummaryImportTime'),fn('latestVesselMasterForSummary'),fn('workingNoSortParts'),
  fn('compareWorkingNoDesc'),fn('filterAndSortDashboardJobs'),fn('p79FocusLatestImportedVessel'),
  fn('mergeShipMasterOne'),fn('shipMasterDateMatchesMonth')
].join('\n'),ctx);
const jobs=[old,fresh];
assert.equal(ctx.filterAndSortDashboardJobs(jobs)[0].workingNo,'5260219','latest import first even when its completion date is older');
fields.dashboardSortField.value='date';
assert.equal(ctx.filterAndSortDashboardJobs(jobs)[0].workingNo,'5260218','manual completion date sort remains usable');
fields.dashboardSortField.value='importedAt';
assert.equal(ctx.p79FocusLatestImportedVessel(true),true,'confirmed import focuses newest job');
assert.equal(fields.filterMonth.value,'2026-10','import chooses actual completion month, not upload month');
assert.equal(fields.dashboardSortField.value,'workingNo','new import restores descending NO. order');
assert.equal(ctx.summaryCurrentPage,1);
fields.filterMonth.value='2026-11';
ctx.p79DashboardMonthSelectionExplicit=true;
assert.equal(ctx.p79FocusLatestImportedVessel(false),false,'user selected month cannot be overridden by cloud sync');
assert.equal(fields.filterMonth.value,'2026-11');
ctx.p79DashboardMonthSelectionExplicit=false;
assert.equal(ctx.p79FocusLatestImportedVessel(false),true,'fresh cloud import is auto-focused when no user month selection');
assert.equal(fields.filterMonth.value,'2026-10');
const stale={...fresh,lastDate:'2026-11-03',firstDate:'2026-11-02',workingSheetImportedAt:'2026-11-08T02:00:00Z',_cloudLastDate:'2026-11-03',
  totalContainers:500,workingSheetSource:{importedAt:'2026-11-08T02:00:00Z',totalContainers:500,hatches:0,totalMoves:500,ruleVersion:'SHIFT_X2'}};
const merged=ctx.mergeShipMasterOne(fresh,stale);
assert.equal(merged.lastDate,'2026-10-31','newer local completion date wins');
assert.equal(merged._cloudLastDate,'2026-10-31','old cloud filter authority must be removed');
assert.equal(merged.totalContainers,816,'new working sheet total must remain');
assert.equal(ctx.shipMasterDateMatchesMonth(merged,'2026-10'),true,'new ship visible in its completion month');
assert.equal(ctx.shipMasterDateMatchesMonth(merged,'2026-11'),false,'old cloud dates cannot move ship to November');
const remoteNewer={...fresh,lastDate:'2026-11-12',workingSheetImportedAt:'2026-11-13T02:01:00Z',
  workingSheetSource:{...fresh.workingSheetSource,importedAt:'2026-11-13T02:01:00Z',totalContainers:900}};
const newer=ctx.mergeShipMasterOne(fresh,remoteNewer);
assert.equal(newer.lastDate,'2026-11-12','genuinely newer cloud dates still win');
assert.equal(newer.totalContainers,900,'genuinely newer cloud source still wins');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(/\bsrc=|application\/ld\+json/i.test(m[1])||!m[2].trim())continue;
 new vm.Script(m[2]);
}
console.log('PASS vessel latest import ordering, automatic completion-month focus, manual month selection, stale cloud protection, and updated metrics');
