'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){const i=html.indexOf('function '+name+'(');assert(i>=0,name);const e=html.indexOf('\n}',i);assert(e>i,name);return html.slice(i,e+2);}
assert.match(html,/id="weeklyMonthFilter"[^>]*onchange="setPersonnelStatisticsMonth\(this\.value\)"/);
assert.match(html,/id="p79prExportExcel"[^>]*onclick="exportPersonnelStatisticsExcel\(\)"/);
const nodes=new Map(),cloud=[],year={value:'2026'};
function el(id){if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',dataset:{},tagName:id==='weeklyMonthFilter'?'SELECT':'INPUT',selectedOptions:[],removeAttribute(){}});return nodes.get(id);}
let updates=0;
const c={document:{getElementById:el},window:{},getPort79Year:()=>year.value,
  isoTodayLocal:()=> '2026-11-18',gcToken:'auth',Date,
  records:[{workDate:'2026-11-01',source:'working-report',name:'NOV'},{workDate:'2026-10-20',source:'working-report',name:'OCT'}, {workDate:'2024-02-28',source:'working-report',name:'FEB28'},{workDate:'2024-02-29',source:'working-report',name:'FEB29'},{workDate:'2024-03-01',source:'working-report',name:'MAR'}],
  canonicalOperationalRecords:a=>a,renderWeeklyEfficiency:()=>{updates++},renderMonthlyRanking(){},updateWeeklyDateRangeSummary(){},
  loadEfficiencyCloudScope:params=>{cloud.push(params);return Promise.resolve(true)},
  console:{warn(){}},Array,String,Number};
vm.createContext(c);
vm.runInContext('globalThis.Port79CalendarRange={syncAll(){}}',c);
for(const name of ['personnelStatisticsMonthRange','syncPersonnelStatisticsMonthFilter','personnelStatisticsPeriod','setPersonnelStatisticsMonth','weeklyFilteredRecords','clearWeeklyRange'])
 vm.runInContext(fn(name),c);
c.syncPersonnelStatisticsMonthFilter();
assert.equal(el('weeklyMonthFilter').value,'2026-11');
assert.equal(el('weeklyStart').value,'','no date selected by default');
assert.equal(el('weeklyEnd').value,'');
assert.equal(c.weeklyFilteredRecords().length,1,'default is full selected month');
c.setPersonnelStatisticsMonth('2026-10');
assert.equal(c.weeklyFilteredRecords()[0].name,'OCT');
assert.equal(el('weeklyStart').value,'');
assert.equal(el('rankingMonth').value,'2026-10');
assert.equal(cloud[0].month,'2026-10');
el('weeklyStart').value='2026-10-20';el('weeklyEnd').value='2026-10-20';
assert.equal(c.personnelStatisticsPeriod().start,'2026-10-20');
assert.equal(c.weeklyFilteredRecords().length,1,'selected day has priority over month');
el('weeklyStart').value='2026-10-21';el('weeklyEnd').value='2026-10-21';
assert.equal(c.weeklyFilteredRecords().length,0,'a day with no records is not replaced by whole month');
c.clearWeeklyRange();
assert.equal(el('weeklyStart').value,'');
assert.equal(c.weeklyFilteredRecords().length,1,'clearing day returns to full selected month');
year.value='2024';c.syncPersonnelStatisticsMonthFilter();c.setPersonnelStatisticsMonth('2024-02');
assert.equal(c.personnelStatisticsPeriod().end,'2024-02-29');
assert.deepEqual(Array.from(c.weeklyFilteredRecords(),r=>r.name),['FEB28','FEB29']);
assert(el('weeklyMonthFilter').innerHTML.includes('2024年12月'));
assert(updates>=3);
console.log('PASS default whole month, explicit day override, cleared day, leap year and ranking month sync');
