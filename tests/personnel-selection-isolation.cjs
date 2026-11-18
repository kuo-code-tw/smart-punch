'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const rankMonth=require('../assets/port79-personnel-ranking.js').rankMonth;
function fn(name){const i=html.indexOf('function '+name+'(');assert(i>=0,'missing '+name);const end=html.indexOf('\n}',i);assert(end>i,name);return html.slice(i,end+2);}
const nodes=new Map(),entries=[
  {empId:'A',name:'王甲',group:'A組',workDate:'2026-11-05',workingNo:'S1',source:'working-report',hours:2,disc:20,load:1,hc:1},
  {empId:'B',name:'林乙',group:'B組',workDate:'2026-11-06',workingNo:'S2',source:'working-report',hours:3,disc:30,load:1,hc:1},
  {empId:'A',name:'王甲',group:'A組',workDate:'2026-11-06',workingNo:'S3',source:'working-report',hours:1,disc:5,load:1,hc:1},
  {empId:'C',name:'陳丙',group:'C組',workDate:'2026-10-31',workingNo:'S4',source:'working-report',hours:1,disc:90,load:1,hc:1}
];
function el(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',dataset:{},options:[],selectedOptions:[{textContent:'王甲'}]});return nodes.get(id);}
el('rankingMonth').value='2026-11';el('weeklyMonthFilter').value='2026-11';el('personStatPerson').value='EMP:A';
const c={
 document:{getElementById:el},window:{P79PersonnelRanking:{rankMonth}},
 getPort79Year:()=> '2026',isoTodayLocal:()=> '2026-11-18',
 gcToken:'',records:entries,shipMasters:[],p79AqcHeadcountVerified:true,
 p79VerifiedAqcReportView:rows=>({verified:true,source:'hr',rows}),
 p79ScheduledAqcReportView:()=>({verified:false,rows:[]}),
 people:()=>[{empId:'A',name:'王甲'},{empId:'B',name:'林乙'},{empId:'C',name:'陳丙'}],
 canonicalOperationalRecords:a=>a,workloadRecordMatchesPerson:(r,key)=>'EMP:'+r.empId===key,
 operationGroupForRecord:r=>r.group||'A組',workloadRecordMetrics:r=>r,
 personnelStatisticsMonthRange:()=>({}),personnelStatisticsPeriod:()=>({month:'2026-11',start:el('weeklyStart').value||'2026-11-01',end:el('weeklyEnd').value||'2026-11-30',custom:!!el('weeklyStart').value}),
 currentOperationScheduleStore:()=>({has:()=>true}),ensureOperationScheduleGroups(){},
 normalizePersonName:s=>s,compareDriverNames:(a,b)=>a.localeCompare(b,'zh-Hant'),displayPersonName:s=>s,
 esc:s=>String(s).replaceAll('<','&lt;'),monthlyRankingReads:new Map(),p79QueueVisibleMonthlyRanking(){},
 Array,String,Date,Number,Map,Set,console
};
vm.createContext(c);
for(const name of ['weeklyFilteredRecords','renderMonthlyRanking'])vm.runInContext(fn(name),c);
c.renderMonthlyRanking();
assert(el('rankingBody').innerHTML.includes('王甲'));
assert(!el('rankingBody').innerHTML.includes('林乙'));
assert(!el('rankingBody').innerHTML.includes('陳丙'));
el('weeklyStart').value='2026-11-06';el('weeklyEnd').value='2026-11-06';
c.renderMonthlyRanking();
assert(el('rankingBody').innerHTML.includes('王甲'));
assert(!el('rankingBody').innerHTML.includes('林乙'));
assert.match(el('rankingCount').textContent,/2026-11-06/);
el('weeklyStart').value='2026-11-07';el('weeklyEnd').value='2026-11-07';
c.renderMonthlyRanking();
assert(!el('rankingBody').innerHTML.includes('林乙'));
assert.match(el('rankingBody').innerHTML,/沒有作業資料/);
el('personStatPerson').value='';
el('weeklyStart').value='2026-11-06';el('weeklyEnd').value='2026-11-06';
c.renderMonthlyRanking();
assert(el('rankingBody').innerHTML.includes('王甲')&&el('rankingBody').innerHTML.includes('林乙'));
assert(!el('rankingBody').innerHTML.includes('陳丙'));
el('weeklyStart').value='';el('weeklyEnd').value='';
c.renderMonthlyRanking();
assert(el('rankingBody').innerHTML.includes('陳丙'),'the full-month roster may include zero-work staff');
assert.match(html,/id="weeklyGroupFilter"[^>]*onchange="renderPersonnelAndRanking\(\)"/);
assert.match(html,/id="personStatPerson"[^>]*onchange="renderPersonnelAndRanking\(\)"/);
assert.match(fn('applyWeeklyDateRange'),/renderPersonnelAndRanking\(\)/);
assert.match(fn('clearWeeklyRange'),/renderPersonnelAndRanking\(\)/);
assert.match(fn('populatePersonStatPeople'),/此日期無作業/);
assert.match(fn('refreshWeeklyGroupFilter'),/此日期無作業/);
console.log('PASS date/person intersection, no full-person fallback, empty day and shared refresh wiring');
