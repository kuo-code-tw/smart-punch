'use strict';
// Regression: the completed-vessel roster defaults to descending WORKING NO.,
// not cloud import timestamps or completion dates.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
function fn(name){
  const start=html.indexOf('function '+name+'(');
  assert(start>=0,'missing function '+name);
  const end=html.indexOf('\n}',start);
  assert(end>start,'missing function end '+name);
  return html.slice(start,end+2);
}
assert.match(html,/<input type="hidden" id="dashboardSortField" value="workingNo">/);
assert.match(html,/<input type="hidden" id="dashboardSortDir" value="desc">/);

const fields={
  filterMonth:{value:'2026-11',options:[{value:'2026-11'}]},
  dashboardSortField:{value:'workingNo'},dashboardSortDir:{value:'desc'},
  dashboardStartDate:{value:''},dashboardEndDate:{value:''},
  dashboardFilterVessel:{value:''},dashboardFilterWharf:{value:''},dashboardEfficiencyFilter:{value:''}
};
const FixedDate=class extends Date{
  constructor(...args){super(...(args.length?args:[Date.parse('2026-11-12T08:00:00Z')]));}
  static now(){return Date.parse('2026-11-12T08:00:00Z');}
};
const fresh={workingNo:'5260219',lastDate:'2026-11-12',importTime:FixedDate.now()-60000};
const c={
  Date:FixedDate,Number,String,Array,Set,Math,
  document:{getElementById:id=>fields[id]||null},
  dashboardFilterText:()=>'',dashboardJobDateValue:x=>x.lastDate||'',
  dashboardCompareStatus:()=>'',num:v=>Number(v)||0,
  workingNoNumber:v=>Number(String(v||'').match(/^\d+/)?.[0]||0),
  vesselSummaryImportTime:x=>x.importTime||0,
  latestVesselMasterForSummary:()=>fresh,shipCompletionMonth:()=> '2026-11',
  shipMasters:[fresh],p79DashboardMonthSelectionExplicit:false,
  dashboardDateRange:()=>({active:false}),updateDashboardRangeState:()=>{},
  summaryCurrentPage:3,summaryLastFilterMonth:'previous',
  renderAll:()=>{c.renderCount=(c.renderCount||0)+1;}
};
vm.createContext(c);
for(const name of ['filterAndSortDashboardJobs','p79FocusLatestImportedVessel','setDashboardSort','clearDashboardFilter'])
  vm.runInContext(fn(name),c);
const scrambled=['5260219','5260217','5260218','5260210','5260216','5260215','5260214']
  .map((workingNo,i)=>({workingNo,lastDate:'2026-11-'+String(12-i).padStart(2,'0'),importTime:i+1}));
const expected=['5260219','5260218','5260217','5260216','5260215','5260214','5260210'];
const nos=()=>Array.from(c.filterAndSortDashboardJobs(scrambled),x=>x.workingNo);
assert.deepEqual(nos(),expected,'November ships ordered by descending NO., regardless of import date');
fields.dashboardSortDir.value='asc';
assert.deepEqual(nos(),[...expected].reverse(),'NO. heading still supports ascending sorting');
fields.dashboardSortDir.value='desc';
c.setDashboardSort('date');
assert.equal(fields.dashboardSortField.value,'date','user can manually sort by completion date');
assert.equal(c.p79FocusLatestImportedVessel(false),true,'fresh cloud import may focus its month');
assert.equal(fields.dashboardSortField.value,'date','background cloud sync must keep manual date sort');
assert.equal(c.p79FocusLatestImportedVessel(true),true,'manual import focuses its completion month');
assert.equal(fields.dashboardSortField.value,'workingNo','new import restores NO. sorting');
assert.equal(fields.dashboardSortDir.value,'desc');
fields.dashboardSortField.value='date';
c.clearDashboardFilter();
assert.equal(fields.dashboardSortField.value,'workingNo','clear filters restores NO. sorting');
assert.equal(fields.dashboardSortDir.value,'desc');
console.log('PASS vessel NO. descending default, ascending toggle, date sorting, import, background sync, and reset');
