/* HR visual panels: show only authenticated existing-system figures and explicit source failures. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('hr/port79-hr-reference-dashboard.js','utf8');
const live=fs.readFileSync('hr/port79-hr-live-statistics.js','utf8');
const M=require('../hr/port79-hr-verified-metrics.js');
for(const s of [html,live])new Function(s);
for(const id of ['p79rWeekAttendance','p79rDayAttendanceDetail','p79rMonthlyLeavePanel','p79rMonthlyOvertimePanel','p79rDonutLabel','p79rDonutNote'])
 assert(html.includes('id="'+id+'"'),'real source panel '+id);
assert(!html.includes('薪資作業')&&!html.includes('教育訓練'),'no unrelated modules');
const nodes={};function element(id){return nodes[id]||(nodes[id]={id,textContent:'',innerHTML:'',value:id==='p79rWorkDate'?'2026-11-12':'',className:'',style:{},
 closest:()=>({style:{}}),addEventListener(){}})}
let actor={empId:'A_ADMIN',adminRole:'superadmin'};
const sessionStorage={getItem(key){
 if(key==='port79_user_session')return JSON.stringify(actor);
 if(key==='port79_user_token')return 'fixture-token';
 if(key==='port79_gas_url')return 'https://script.google.com/macros/s/FIXTURE/exec';
 return null}};
const employees=[{empId:'A',employmentStatus:'active',name:'員工甲'},{empId:'B',employmentStatus:'active',name:'員工乙'}];
const schedules=[
 {empId:'A',schedule:{'2026-11-12':'早',__meta:{'2026-11-12':{overtimeReport:{id:'O1',declaredHours:3,status:'已申報'}}}}},
 {empId:'B',schedule:{'2026-11-12':'早',__meta:{}}}
];
const leaveRecords=[{id:'L1',empId:'B',status:'已核准',startDate:'2026-11-12',endDate:'2026-11-12',approvedDays:1,leaveType:'年假'}];
let failLeave=false,unauthorizedRequests=0;
const document={getElementById:element,addEventListener(){}};
const window={P79HrVerifiedMetrics:M,p79HrDashRender(){}};
const fetch=async (address)=>{
 const url=new URL(address),action=url.searchParams.get('action');
 assert.equal(url.searchParams.get('token'),'fixture-token');
 if(actor.adminRole!=='superadmin'){unauthorizedRequests++;throw Error('forbidden read')}
 if(action==='getLeaveData')assert.equal(url.searchParams.has('gcToken'),false,'match original leave API');
 if(action==='getLeaveData'&&failLeave)return{ok:true,text:async()=>JSON.stringify({ok:false,error:'雲端忙碌',retryable:true})};
 const data=action==='getLeaveData'?{ok:true,employees,leaveRecords}:
  action==='getScheduleDataSecure'?{ok:true,schedules}:
  action==='getAttendanceMainDirect'?{ok:true,records:[{empId:'A',type:'上班打卡',timeStr:'2026-11-12 07:50:00'}]}:null;
 assert(data,'unexpected action '+action);
 return{ok:true,text:async()=>JSON.stringify(data)}
};
const ctx={window,document,sessionStorage,employees,p79HrCloudDataReady:true,token:'fixture-token',
 Date,Intl,URL,fetch,console,AbortController,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(live,ctx);
(async()=>{
 await window.P79HrStatistics.refresh();
 assert.equal(element('p79rLeaves').textContent,'1');
 assert.equal(element('p79rAttendance').textContent,'100.0%');
 assert.equal(element('p79rOvertime').textContent,'3.0 小時');
 assert.match(element('p79rUpdated').textContent,/人資主檔已同步｜考勤已讀／排班已讀／請假已讀/);
 assert.match(element('p79rMonthlyLeavePanel').innerHTML,/1 人次/);
 assert.match(element('p79rMonthlyOvertimePanel').innerHTML,/3.0 小時/);
 assert.match(element('p79rDayAttendanceDetail').innerHTML,/員工甲/);
 assert.match(element('p79rDayAttendanceDetail').innerHTML,/07:50/);
 assert.match(element('p79rDayAttendanceDetail').innerHTML,/只列當日有實際打卡/);
 assert.match(element('p79rWeekAttendance').innerHTML,/11-12/);
 assert.equal(element('p79rDonutLabel').textContent,'已打卡／應到');
 assert.equal(element('p79rActiveDonut').textContent,'1 / 1');
 console.log('PASS verified official sources populate all four summary panels');
 failLeave=true;await window.P79HrStatistics.refresh();
 assert.equal(element('p79rLeaves').textContent,'—');
 assert.match(element('p79rUpdated').textContent,/請假待核/);
 assert.equal(element('p79rAttendance').textContent,'—','incomplete official leave must not invent an attendance rate');
 assert.equal(element('p79rOvertime').textContent,'3.0 小時','leave timeout must not erase verified overtime');
 assert.match(element('p79rDayAttendanceDetail').innerHTML,/員工甲/,'official punched rows remain visible even when attendance denominator is unknown');
 assert.match(element('p79rMonthlyLeavePanel').innerHTML,/雲端服務忙碌/);
 assert.match(element('p79rWeekAttendance').innerHTML,/請假：雲端服務忙碌/);
 assert.equal(element('p79rDonutLabel').textContent,'在職人數');
 assert.equal(element('p79rActiveDonut').textContent,'—');
 console.log('PASS source failure is explained, no fake zero and other verified data retained');
 actor={empId:'VIEWER',adminRole:'admin',systemPermissions:{hr:'view',attendance:'none',leave:'none',schedule:'none',workhours:'none'}};
 await window.P79HrStatistics.refresh();
 assert.equal(unauthorizedRequests,0,'forbidden account cannot query raw data');
 assert.match(element('p79rUpdated').textContent,/考勤無權限／排班無權限／請假無權限/);
 assert.equal(element('p79rAttendance').textContent,'—');
 assert.match(element('p79rMonthlyLeavePanel').innerHTML,/沒有請假檢視權限/);
 assert.doesNotMatch(element('p79rDayAttendanceDetail').innerHTML,/員工甲/,'restricted account cannot reuse prior identity rows');
 assert.match(element('p79rWeekAttendance').innerHTML,/考勤：此帳號無檢視權限/);
 console.log('PASS account switching hides restricted statistics without cloud reads');
})().catch(error=>{console.error(error);process.exitCode=1});
