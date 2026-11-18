'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){
  const begin=html.indexOf('function '+name+'(');
  assert(begin>=0,'missing '+name);
  const end=html.indexOf('\n}',begin);
  assert(end>begin,'incomplete '+name);
  return html.slice(begin,end+2);
}
const weekly=html.slice(html.indexOf('<section id="view-weekly"'),html.indexOf('<dialog id="vesselMonthlyExportDialog"'));
assert.match(weekly,/<label for="weeklyMonthFilter"[^>]*>月份<\/label>/);
assert.match(weekly,/id="weeklyMonthFilter"[^>]*onchange="setPersonnelStatisticsMonth\(this\.value\)"/);
assert.equal((html.match(/id="weeklyMonthFilter"/g)||[]).length,1);
assert.match(fn('renderWeeklyEfficiency'),/syncPersonnelStatisticsMonthFilter\(\)/);

let year='2026',renders=0,rankingRenders=0,syncs=0;
const fetches=[],nodes=new Map();
function el(id){
  if(!nodes.has(id))nodes.set(id,{
    value:'',textContent:'',innerHTML:'',dataset:{},tagName:'INPUT',
    removeAttribute(){},classList:{toggle(){}}
  });
  return nodes.get(id);
}
el('weeklyMonthFilter').tagName='SELECT';
const rows=[
  {workDate:'2026-11-01',source:'working-report',name:'A'},
  {workDate:'2026-10-20',source:'working-report',name:'B'},
  {workDate:'2024-02-28',source:'working-report',name:'C'},
  {workDate:'2024-02-29',source:'working-report',name:'D'},
  {workDate:'2024-03-01',source:'working-report',name:'E'},
  {workDate:'2024-02-11',source:'manual',name:'F'}
];
const c={
  document:{getElementById:el},window:{},
  records:rows,gcToken:'signed-in',getPort79Year:()=>year,
  isoTodayLocal:()=> '2026-11-18',
  renderWeeklyEfficiency:()=>{renders++},
  renderMonthlyRanking:()=>{rankingRenders++},
  updateWeeklyDateRangeSummary:()=>{},
  loadEfficiencyCloudScope:(scope)=>{fetches.push(scope);return Promise.resolve(true)},
  canonicalOperationalRecords:a=>a,workloadRecordMatchesPerson:()=>true,
  operationGroupForRecord:()=>'',Date,Array,String,Number,
  console:{warn(){}}
};
vm.createContext(c);
vm.runInContext('globalThis.Port79CalendarRange={syncAll:()=>{globalThis.p79CalendarSyncCount=(globalThis.p79CalendarSyncCount||0)+1}}',c);
for(const name of ['personnelStatisticsMonthRange','syncPersonnelStatisticsMonthFilter','setPersonnelStatisticsMonth','weeklyFilteredRecords'])
  vm.runInContext(fn(name),c);
c.syncPersonnelStatisticsMonthFilter();
assert.equal(el('weeklyMonthFilter').value,'2026-11','first entry defaults to the current month');
assert.equal(el('weeklyStart').value,'2026-11-01');
assert.equal(el('weeklyEnd').value,'2026-11-30');
assert.equal(c.weeklyFilteredRecords(true).length,1);
assert(el('weeklyMonthFilter').innerHTML.includes('2026年12月'),'all 12 calendar months are selectable');
c.setPersonnelStatisticsMonth('2026-10');
assert.equal(el('weeklyStart').value,'2026-10-01');
assert.equal(el('weeklyEnd').value,'2026-10-31');
assert.equal(c.weeklyFilteredRecords(true).length,1);
assert.equal(el('rankingMonth').value,'2026-10','monthly performance rank stays in sync');
assert.equal(fetches[0].month,'2026-10','older period requests official cloud data');
assert.equal(rankingRenders,1);
year='2024';c.syncPersonnelStatisticsMonthFilter();
assert.equal(el('weeklyMonthFilter').value,'2024-10','year change keeps month in the selected year');
c.setPersonnelStatisticsMonth('2024-02');
assert.equal(el('weeklyStart').value,'2024-02-01');
assert.equal(el('weeklyEnd').value,'2024-02-29','leap-year month includes all dates');
assert.deepEqual(Array.from(c.weeklyFilteredRecords(true),r=>r.name),['C','D'],'month filters only official WORKING REPORT date rows');
el('weeklyStart').value='2024-03-02';el('weeklyEnd').value='2024-03-06';
c.syncPersonnelStatisticsMonthFilter();
assert.equal(el('weeklyMonthFilter').value,'','custom date ranges do not mislabel the selected month');
c.setPersonnelStatisticsMonth('');
assert.equal(el('weeklyStart').value,'');
assert.equal(el('weeklyEnd').value,'');
assert.equal(c.weeklyFilteredRecords(true).length,3,'all-month choice still respects system-selected year');
assert(fetches.some(x=>x.year==='2024'),'all-month choice fetches the selected year');
assert(renders>=3&&c.p79CalendarSyncCount>=3);
console.log('PASS personnel monthly picker, full-month filter, leap day, year change, custom dates, rank sync and cloud reads');
