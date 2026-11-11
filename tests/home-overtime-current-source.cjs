'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('assets/port79-monthly-dashboard.js','utf8');
const uiSrc=fs.readFileSync('assets/port79-reference-dashboard.js','utf8');
const home=fs.readFileSync('index.html','utf8');
const api=require('../assets/port79-monthly-dashboard.js');
const report={id:'OT-A',declaredHours:4};
const json=JSON.stringify({__personnel:{jobTitle:'指揮手',name:'員工甲'},
 __meta:{'1':{overtimeReport:report},'2026/11/02':{overtimeReport:{id:'OT-B',declaredHours:2,planned:true}},
 '2026-11-03':{overtimeReport:{id:'OT-C',declaredHours:8,revoked:true}}}});
const result=api.analyzeOvertime({schedules:[{empId:'E1',scheduleJson:json}]},'2026-11');
assert.equal(result.hours,6);
assert.equal(result.count,2);
assert.equal(result.rows.find(r=>r.title==='指揮手').hours,6);
assert.deepEqual(result.details.map(r=>r.date),['2026-11-02','2026-11-01']);
assert.deepEqual(result.details.map(r=>r.status),['預排／待核對','已申報']);
const mixed=api.analyzeOvertime({
 employees:[{empId:'E1',jobTitle:'AQC',name:'員工甲'}],
 schedules:[{empId:'E1',schedule:JSON.parse(json)}]
},'2026-11');
assert.equal(mixed.rows.find(r=>r.title==='AQC').hours,6,'official HR role wins over old shift role');
const undated=api.analyzeOvertime({schedules:[{scheduleJson:JSON.stringify({__meta:{'31':{overtimeReport:{id:'X',declaredHours:8}}}})}]},'2026-11');
assert.equal(undated.count,0,'invalid November 31 must not be counted');
const start=src.indexOf('async function requestHomeCurrentSchedule(');
const end=src.indexOf('// 每月 1 日的下班卡可能對應上月最後一天的夜班上班卡。',start);
assert(start>0&&end>start);
const code=src.slice(start,end);
async function readCurrent(reader,archive,ym='2026-11'){
 const actions=[];
 const sessionStorage={getItem:k=>k==='port79_gas_url'?'https://script.google.com/macros/s/FAKEAPP/exec':''};
 const root={sessionStorage,setTimeout,clearTimeout,fetch:async url=>{
  actions.push(new URL(url).searchParams.get('action'));
  return reader(url);
 }};
 const load=new Function('root','AbortController','request','taipeiDay','URL',
  code+';return requestHomeOvertimeSchedule')(
  root,AbortController,async (...args)=>{actions.push('historyGetMonthData');return archive(...args);},()=>'2026-11-11',URL);
 const data=await load(ym,'TOKEN',true);
 return {data,actions};
}
(async()=>{
 const live=await readCurrent(async url=>{
  const u=new URL(url);
  assert.equal(u.searchParams.get('action'),'getScheduleDataSecure');
  assert.equal(u.searchParams.get('month'),'2026-11');
  assert.equal(u.searchParams.get('gcToken'),'TOKEN');
  return {ok:true,json:async()=>({ok:true,month:'2026-11',schedules:[{empId:'E1',scheduleJson:json}]})};
 },async()=>{throw Error('history should not be read on successful live GET')});
 assert.equal(live.data.p79HomeScheduleSource,'live');
 assert.deepEqual(live.actions,['getScheduleDataSecure']);
 assert.equal(api.analyzeOvertime(live.data,'2026-11').count,2);
 const past=await readCurrent(async()=>{throw Error('past month must not call live API')},
  async()=>({month:'2026-10',schedules:[]}), '2026-10');
 assert.deepEqual(past.actions,['historyGetMonthData']);
 const fallback=await readCurrent(async()=>{throw Error('live unavailable')},
  async()=>({month:'2026-11',schedules:[]}));
 assert.equal(fallback.data.p79HomeScheduleSource,'history-fallback');
 assert.match(fallback.data.p79HomeLiveWarning,/live unavailable/);
 assert.deepEqual(fallback.actions,['getScheduleDataSecure','historyGetMonthData']);
 const nodes=new Map();
 function node(id){
  if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',value:id==='p79DashMonth'?'2026-11':'',
   classList:{add(){}},style:{setProperty(){}}});
  return nodes.get(id);
 }
 const document={readyState:'loading',getElementById:id=>nodes.get(id)||null,addEventListener(){}};
 for(const id of ['p79DashMonth','p79DashAttendanceBars','p79DashAttendanceChartTitle','p79DashChartPage','p79DashChartPrevious','p79DashChartNext'])node(id);
 const window={document};
 vm.runInNewContext(uiSrc,{window});
 window.P79ReferenceDashboard.reset();
 window.P79ReferenceDashboard.setOvertimeReport({month:'2026-11',count:2,hours:6,rows:[{title:'未設定職稱',count:2,hours:6}]});
 assert.match(node('p79DashAttendanceBars').innerHTML,/已讀取 2 筆加班申報/,'known reports must not be labeled missing');
 window.P79ReferenceDashboard.setOvertimeReport({month:'2026-11',count:0,hours:0,rows:[],sourceWarning:'live unavailable'});
 assert.match(node('p79DashAttendanceBars').innerHTML,/即時加班來源尚未核對完成/);
 window.P79ReferenceDashboard.setOvertimeReport({month:'2026-11',count:2,hours:6,rows:[{title:'指揮手',count:2,hours:6}]});
 assert.match(node('p79DashAttendanceBars').innerHTML,/指揮手/);
 assert.match(node('p79DashAttendanceBars').innerHTML,/6 小時/);
 assert(home.includes('20261111-overtime-live-and-json-v1'));
 assert(home.includes('20261111-overtime-no-false-empty-v1'));
 console.log('PASS home overtime: live current source, history fallback warning, JSON metadata, HR title, date keys, no false empty state');
})().catch(error=>{console.error(error);process.exitCode=1});
