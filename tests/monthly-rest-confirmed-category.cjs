'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const month='2026-10',day=n=>month+'-'+String(n).padStart(2,'0');
const html=fs.readFileSync('schedule/index.html','utf8');
const start=html.indexOf('    function p79ScheduleRestCountCells(');
const end=html.indexOf('    function p79RefreshScheduleRestCounts(',start);
assert(start>=0&&end>start,'production rest summary renderer exists');
const c={window:null,Set,Map,JSON,Number,String,
 p79RestQuota:()=>({counts:{例:4,休:5,國:2}}),
 p79DailyRestCount:()=>({dates:{例:[],休:[],國:[]}}),
 p79ScheduleRestBalance:()=>({quota:{例:4,休:5,國:2},remaining:{例:4,休:2,國:2},reported:{例:0,休:0,國:0},reserved:{例:0,休:0,國:0},ledger:[]}),
 p79ScheduleTyphoonDays:()=>[],scheduleEscapeHtml:x=>String(x||'')};
c.window=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/port79-schedule-rest-summary.js','utf8'),c);
vm.runInContext(html.slice(start,end),c);
const selected={例:[],休:[day(5),day(11),day(22)],國:[day(6),day(24)]};
const spans=(s,category)=>s.match(new RegExp('data-rest-category="'+category+'"[^>]*><span>([^<]+)</span>'))?.[1];
const render=(id='E1',typhoon=[])=>c.p79ScheduleRestCountCells({id,name:'測試'},month,null,typhoon,[],selected);
const makeRow=(id='E1',options={})=>{
 const schedule=Object.fromEntries(Array.from({length:31},(_,i)=>[day(i+1),'早']));
 schedule[day(5)]='休';schedule[day(11)]='休';schedule[day(22)]='早';schedule[day(28)]='中';
 schedule.__meta={
  [day(22)]:{overtimeReport:{id:id+'-22',category:'休',code:'休08-16'}},
  [day(28)]:{overtimeReport:{id:id+'-28',category:'休',code:'休16-24'}},
 };
 if(options.revoked)schedule.__meta[day(28)].overtimeRevocations=[{confirmed:true,reportId:id+'-28'}];
 if(options.excluded)schedule.__meta[day(28)].overtimeExcluded=true;
 return {empId:id,schedule};
};
// Without a cloud-confirmed 28th declaration, 3 visible dates legitimately count as 3.
assert.equal(spans(render(),'休'),'3/2');
const source=makeRow();
c.P79ScheduleRestSummary.acceptRows([source],month);
assert.deepEqual(Array.from(c.P79ScheduleRestSummary.confirmedDates('E1',month,'休')),[day(22),day(28)]);
let shown=render();
assert.equal(spans(shown,'休'),'4/1','a saved 休16-24 report that is not visible still occupies one rest quota');
assert.equal(spans(shown,'國'),'2/0','national holidays are unchanged');
assert.match(shown,/雲端已確認休加班/,'show which saved date supplements the visible cells');
assert.equal(spans(render('OTHER'),'休'),'3/2','one employee never receives another employee report');
assert.equal(spans(render('E1',[day(28)]),'休'),'3/2','typhoon exemption is not counted twice');
for(let i=0;i<83;i++){
 const id='FIX'+i;
 assert.equal(spans(render(id),'休'),'3/2','no fabricated report for employee '+id);
}
c.P79ScheduleRestSummary.acceptRows([makeRow('E1',{revoked:true})],month);
assert.equal(spans(render(),'休'),'3/2','revoked official report cannot resurrect as a rest credit');
c.P79ScheduleRestSummary.acceptRows([makeRow('E1',{excluded:true})],month);
assert.equal(spans(render(),'休'),'3/2','excluded official report cannot count');
c.P79ScheduleRestSummary.acceptRows([makeRow()],month);
assert.equal(spans(render(),'休'),'4/1','restores original count on renewed official confirmation');
const original=JSON.stringify(source);
render();assert.equal(JSON.stringify(source),original,'read-only accounting must not mutate cloud roster');
c.P79ScheduleRestSummary.clear();
assert.equal(spans(render(),'休'),'3/2','auth reset never preserves report dates from prior account');
console.log('PASS confirmed overtime-inclusive 例休國 count: visible 3 plus cloud report 1 = 休4/1, deduplication, revoke/exclusion, typhoon, 83-person identity isolation, immutable schedule');
