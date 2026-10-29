'use strict';
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');
const date='2026-10-28',next='2026-10-29',at=(d,t)=>Date.parse(d+'T'+t+':00+08:00');
const employee={empId:'AP1030037',name:'測試人員'};
const input={id:'IN1',empId:employee.empId,at:at(date,'23:35'),timeStr:date+' 23:35:00'};
const output={id:'OUT1',empId:employee.empId,at:at(next,'07:48'),timeStr:next+' 07:48:00'};
const stale={...output,at:at(next,'07:30'),timeStr:next+' 07:30:00'};
const rule=['國','國24-08',8,8,'','','24','08','full'];
function setup({out=output,complete=true}={}){
 const notices=[],shown=[],writes=[],cloud={ok:true,revision:'R1',schedules:[{empId:employee.empId,schedule:{[date]:'晚',__meta:{}}}],records:complete?[input,out]:[input]};
 const c={Date,Intl,Map,Set,JSON,URLSearchParams,AbortController,setTimeout,clearTimeout,console,sysConfig:{},getActiveGasUrl:()=> 'https://test.invalid',getAttendanceEmployeeMasterToken:()=> 'T',p79CanReportOvertime:()=>true,p79CanManageOvertime:()=>true,getAdminVisibleEmployees:()=>[employee],saveConfig(){},getAttendanceTimestamp:r=>r.at,buildDailyAttendanceRows:()=>complete?[{clockIn:input,clockOut:out}]:[{clockIn:input,clockOut:null}],P79SpecialOvertime:{forShift:()=>[]},showToast:m=>notices.push(m),p79AttendanceOvertimeMonths:new Map(),localStorage:{setItem(){}},renderAdminRecordsTable(){},document:{getElementById:()=>null},
 fetch:async(url,opts)=>{
  const body=opts?.body?JSON.parse(opts.body):null,action=body?.action||new URL(url).searchParams.get('action');
  if(action==='getOvertimeConfig')return{ok:true,json:async()=>({ok:true,config:{overtimeConversionRowsV1:[rule]}})};
  if(action==='getOvertimeReportContext')return{ok:true,json:async()=>cloud};
  if(action==='saveOvertimeReportDirect'){writes.push(body);return{ok:true,json:async()=>({ok:true,directOvertimeSaved:true,id:body.id,report:{...c.P79Overtime.report(rule),id:body.id}})};}
  throw Error('unexpected '+action);
 }};
 c.window=c;vm.createContext(c);
 for(const path of ['assets/port79-rest-attendance.js','assets/port79-overtime-report.js','assets/port79-attendance-overtime.js'])vm.runInContext(fs.readFileSync(path,'utf8'),c);
 c.P79Overtime.showReportLoading=()=>({close(){},remove(){}});
 c.P79Overtime.openReport=async x=>shown.push(x);
 return {c,shown,notices,writes};
}
(async()=>{
 const t=setup();
 await t.c.P79AttendanceOvertime.open({row:{clockIn:input,clockOut:stale},employee,date});
 a.equal(t.shown.length,1);
 a.equal(t.shown[0].attendance.start,input.at);
 a.equal(t.shown[0].attendance.end,output.at,'stale 07:30 display must resolve to authoritative 07:48');
 a.equal(t.c.P79Overtime.ruleAttendanceIssue(input.at,output.at,date,rule,{[date]:'晚'}),'','07:48 allows 24–08');
 a.match(t.c.P79Overtime.ruleAttendanceIssue(input.at,stale.at,date,rule,{[date]:'晚'}),/45/);
 const draft={id:'REPORT',empId:employee.empId,date,rule:t.c.P79Overtime.report(rule)};
 await t.c.P79AttendanceOvertime.save(draft);
 a.equal(t.writes[0].attendanceInId,'IN1');a.equal(t.writes[0].attendanceOutId,'OUT1');
 const incomplete=setup({complete:false});
 await incomplete.c.P79AttendanceOvertime.open({row:{clockIn:input,clockOut:stale},employee,date});
 a.equal(incomplete.shown.length,0,'incomplete official punches must block even if table showed OUT');
 a.match(incomplete.notices.join(' '),/完整的正式上下班打卡/);
 const short=setup({out:{...output,at:at(next,'07:44'),timeStr:next+' 07:44:00'}});
 await short.c.P79AttendanceOvertime.open({row:{clockIn:input,clockOut:stale},employee,date});
 a.equal(short.shown[0].attendance.end,at(next,'07:44'));
 a.match(short.c.P79Overtime.ruleAttendanceIssue(input.at,short.shown[0].attendance.end,date,rule,{[date]:'晚'}),/45/);
 console.log('PASS official cross-midnight 10/28 24–08 07:48 vs stale 07:30; 07:44 and missing OUT blocked');
})().catch(e=>{console.error(e);process.exitCode=1});
