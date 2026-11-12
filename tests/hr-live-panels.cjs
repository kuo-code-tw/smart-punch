const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const M=require('../hr/port79-hr-verified-metrics.js'),E=require('../attendance/v6-engine.js');
const staff=[{empId:'A',attNo:'001',name:'<甲>',unit:'倉庫組',jobTitle:'指揮手'},{empId:'B',attNo:'2',name:'乙',unit:'行政室',jobTitle:'行政'}];
const leaves=[{id:'L',empId:'B',status:'已核准',startDate:'2026-11-01',endDate:'2026-11-01',days:1,leaveType:'事假'}];
const shifts=E.buildShifts([{id:'IN',empId:'A',timeStr:'2026/10/31 23:00:00',status:'上班簽到'},{id:'OUT',empId:'A',timeStr:'2026/11/01 07:00:00',status:'下班簽退'}]);
const date=M.date(shifts[0].accountingDateKey||shifts[0].dateKey);assert(date==='2026-10-31');
const d=M.attendanceDetails({employees:staff,shifts,day:date,schedules:[{empId:'A',schedule:{[date]:'休'}}]});assert.equal(d.find(r=>r.empId==='A').state,'休假日有出勤');assert(d.find(r=>r.empId==='A').clockOut[0].includes('11/01'));
assert.equal(M.attendanceDetails({employees:staff,shifts:[],day:'2026-11-01',leaveRecords:leaves}).find(r=>r.empId==='B').state,'已核准請假');
const rows=[{empId:'A',schedule:{'2026-10-31':'早'}},{empId:'B',schedule:{'2026-10-31':'休'}},{empId:'A',schedule:{'2026-11-01':'晚'}}];
assert.equal(M.attendanceRate({employees:staff,schedules:rows,day:'2026-10-31'}).expected,1);
assert.equal(M.attendanceRate({employees:staff,schedules:rows,day:'2026-11-02'}).ready,false);
assert.equal(M.approvedLeaveCount([],'2026-11',['A','B']).count,0);
const multi=M.attendanceDetails({employees:staff,day:'2026-11-01',shifts:[{empId:'A',dateKey:'2026/11/01',clockIn:{timeStr:'08:00'},clockOut:{timeStr:'12:00'}},{empId:'A',dateKey:'2026/11/01',clockIn:{timeStr:'16:00'}}]});assert(multi.find(r=>r.empId==='A').state.includes('待簽退'));

const src=fs.readFileSync('hr/port79-hr-live-statistics.js','utf8');
async function run({denied=false,failed=false,stale=false,day='2026-11-01'}={}){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='p79rWorkDate'?day:'',innerHTML:'',textContent:'',style:{},closest:()=>({style:{}})});return nodes.get(id)};
 const session=denied?{empId:'viewer',adminRole:'admin',systemPermissions:{hr:'view'}}:{empId:'admin',adminRole:'superadmin'};
 const requests=[],doc={getElementById:node,addEventListener(){}},window={P79HrVerifiedMetrics:M,P79AttendanceV6:E};
 const box={window,document:doc,employees:staff,p79HrCloudDataReady:true,token:'TEST',Date,Intl,URL,AbortController,setTimeout,clearTimeout,console,sessionStorage:{getItem:k=>k==='port79_user_token'?'TEST':k==='port79_user_session'?JSON.stringify(session):k==='port79_gas_url'?'https://script.google.com/macros/s/TEST/exec':null},fetch:async url=>{const u=new URL(url),action=u.searchParams.get('action'),month=u.searchParams.get('month');requests.push([action,month]);if(stale)box.token='OTHER';let data;
  if(action==='getLeaveData'){if(failed)throw Error('network');data={ok:true,employees:staff,leaveRecords:leaves}}
  if(action==='getScheduleDataSecure')data={ok:true,month,schedules:staff.map(e=>({empId:e.empId,schedule:{[month+'-01']:'早',__meta:{[month+'-01']:{overtimeReport:{id:month+e.empId+'OT',declaredHours:2,category:'延',planned:false}}}}}))};
  if(action==='getAttendanceMonthData')data={ok:true,month,records:[{id:month+'I',empId:'A',timeStr:month+'/01 08:00:00',status:'上班簽到'},{id:month+'O',empId:'A',timeStr:month+'/01 16:00:00',status:'下班簽退'},{empId:'OUTSIDER',timeStr:month+'/01 08:00',status:'上班簽到'}]};
  return{ok:true,text:async()=>JSON.stringify(data)};
 }};
 vm.createContext(box);vm.runInContext(src,box);await window.P79HrStatistics.refresh();return{node,requests};
}
(async()=>{
 let x=await run();assert(x.node('p79rAttendanceDetails').innerHTML.includes('&lt;甲&gt;'));assert(!x.node('p79rAttendanceDetails').innerHTML.includes('OUTSIDER'));assert(x.node('p79rLeaveSummary').innerHTML.includes('事假'));assert(x.node('p79rOvertimeSummary').innerHTML.includes('4.0'));assert.equal((x.node('p79rAttendanceTrend').innerHTML.match(/p79r-trend-row/g)||[]).length,7);
 assert(x.requests.some(([a,m])=>a==='getAttendanceMonthData'&&m==='2026-10'));assert(x.requests.some(([a,m])=>a==='getScheduleDataSecure'&&m==='2026-12'));
 x=await run({failed:true});assert(x.node('p79rLeaveSummary').innerHTML.includes('連線'));assert(!x.node('p79rLeaveSummary').innerHTML.includes('0 人次'));assert(x.node('p79rAttendanceDetails').innerHTML.includes('&lt;甲&gt;'));
 x=await run({denied:true});assert.equal(x.requests.length,0);assert(x.node('p79rAttendanceDetails').innerHTML.includes('權限'));assert(!x.node('p79rAttendanceDetails').innerHTML.includes('&lt;甲&gt;'));
 x=await run({stale:true});assert(!x.node('p79rAttendanceDetails').innerHTML.includes('&lt;甲&gt;'));assert(!x.node('p79rLeaveSummary').innerHTML.includes('事假'));
 console.log('PASS HR panels: cross-month reads, paired night shift, roster denominator, empty ledger, classifications, escaping, scope filtering, partial outage and denied access');
})().catch(e=>{console.error(e);process.exitCode=1});
