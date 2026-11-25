'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const backend=fs.readFileSync('backend/night-cover-dual-date-v108-core.gs','utf8');
const page=fs.readFileSync('work-hours/index.html','utf8');
new vm.Script(backend);
const ctx={normalizeEmpId_:v=>String(v||'').trim().toUpperCase(),p79AssertOvertimeReportNotRevoked_:()=>{}};
vm.createContext(ctx);vm.runInContext(backend,ctx);
const coverDay='2026-11-21',nextDay='2026-11-22';
const early=['延','延16-20',4,6.02,'08','16','16','20','after','平日延時加班'];
const night=['延','延20-08',4,6.02,'24','08','20','24','before','平日延時加班'];
const coverRule=['延','延04-08',4,6.02,'08','16','04','08','before','平日延時加班'];
function fixture(kind='linked'){
 const date=kind==='linked'?nextDay:coverDay,shift=kind==='night'?'晚':'早',rule=kind==='linked'?coverRule:kind==='night'?night:early;
 const old={id:'ORIGINAL',planned:true,leaveId:'L1',coverDate:coverDay,workDate:date,overtimeDate:coverDay,code:'old',category:'延'};
 const rows=[{empId:'L',schedule:{[coverDay]:'年',__meta:{[coverDay]:{leaveOriginalShift:'晚'}}}},
  {empId:'W',schedule:{[date]:shift,__meta:{[date]:{forEmpId:'L',reportOriginalShift:'中',overtimeReport:old}}}}];
 const request={id:'ORIGINAL',replaceReportId:'ORIGINAL',empId:'W',date,workDate:date,coverDate:coverDay,overtimeDate:coverDay,month:date.slice(0,7),forEmpId:'L',leaveHandoffId:'L1',planned:false,attendanceInId:'I',attendanceOutId:'O'};
 const attendance={start:Date.parse(date+(kind==='linked'?'T03:45:00+08:00':kind==='night'?'T19:38:00+08:00':'T07:31:00+08:00')),
  end:Date.parse(kind==='night'?nextDay+'T07:48:00+08:00':date+(kind==='linked'?'T15:48:00+08:00':'T19:45:00+08:00')),inId:'I',outId:'O'};
 return {rows,request,rule,attendance,covers:[{leaveId:'L1',leaveEmpId:'L',startDate:coverDay,endDate:coverDay,mode:'two',workerIds:['W','OTHER']}],
  leaves:[{id:'L1',empId:'L',startDate:coverDay,endDate:coverDay,status:'已核准'}],old};
}
const plan=f=>ctx.p79PlanDirectReport_(f.rows,f.request,f.rule,f.attendance,f.covers,f.leaves,[]);
const own=f=>{f.request={...f.request,adjustedIndependentReview:true,sourceLeaveHandoffId:'L1',sourceForEmpId:'L',forEmpId:'',leaveHandoffId:''};return f};
let f=fixture(),r=plan(f);assert.equal(r.report.id,'ORIGINAL');assert.equal(r.report.planned,false);
assert.equal(r.report.overtimeDate,coverDay);assert.equal(r.report.workDate,nextDay);assert.equal(r.report.adjustedCoverReview,true);
assert.equal(r.rows[1].schedule[nextDay],'早');assert.equal(f.old.planned,true,'input source unchanged');
f.rows=r.rows;f.attendance=null;assert.equal(plan(f).duplicate,true,'verified exact retry is idempotent');
for(const kind of ['early','night']){
 f=fixture(kind);assert.throws(()=>plan(f),/不屬於原請假班別/);
 own(f);r=plan(f);assert.equal(r.report.id,'ORIGINAL');assert.equal(r.report.planned,false);assert.equal(r.report.leaveId,'');
 assert.equal(r.report.adjustedIndependentFrom.leaveId,'L1');assert.equal(r.report.adjustedIndependentFrom.forEmpId,'L');
 assert.equal(r.rows[1].schedule[coverDay],kind==='night'?'晚':'早');assert.equal(r.rows[1].schedule.__meta[coverDay].forEmpId,'');
 assert.equal(r.report.workDate,coverDay);assert.equal(r.report.overtimeDate,coverDay);
 f.rows=r.rows;f.attendance=null;assert.equal(plan(f).duplicate,true);
}
f=own(fixture('early'));f.request.sourceLeaveHandoffId='WRONG';assert.throws(()=>plan(f),/原代班申報關聯/);
f=own(fixture('early'));f.request.replaceReportId='OTHER';assert.throws(()=>plan(f),/原代班申報關聯/);
f=own(fixture('early'));f.old.approvedBy='manager';assert.throws(()=>plan(f),/原代班申報關聯/);
f=own(fixture('early'));f.attendance.end-=3*3600000;assert.throws(()=>plan(f),/實際上下班/);
f=own(fixture('early'));f.rows[1].schedule[coverDay]='中';assert.throws(()=>plan(f),/最新正式正常班/);
f=fixture();f.request.overtimeDate=nextDay;assert.throws(()=>plan(f),/歸屬日/);
f=fixture();f.request.planned=true;assert.throws(()=>plan(f),/代班工作日期/);
f=fixture();f.old.approvedBy='manager';assert.throws(()=>plan(f),/代班工作日期/);
f=fixture();f.leaves[0].status='已取消';assert.throws(()=>plan(f),/對應請假或代班安排/);
f=fixture();f.rows.push({empId:'OTHER',schedule:{[nextDay]:'早',__meta:{[nextDay]:{overtimeReport:{...f.old,planned:false,id:'OTHER-ID',category:'延',code:'延04-08',declaredHours:4,normalStart:'08',normalEnd:'16',overtimeStart:'04',overtimeEnd:'08',position:'before'}}}}});assert.throws(()=>plan(f),/不屬於原請假班別/);
const a=page.indexOf('        async function p79ConfirmPlannedOvertimeCandidate('),b=page.indexOf('        async function p79BatchConfirmPlannedOvertime(',a);
assert(a>=0&&b>a);
async function frontend({capability=true,allow=true,message='調班後實際加班時段不屬於原請假班別，請改為本人加班核對',crossDate=false}={}){
 const rule={category:'延',code:'延16-20'},date=coverDay,credit=crossDate?'2026-11-20':date;
 const saved={id:'ORIGINAL',planned:true,code:'old',category:'延',leaveId:'L1',forEmpId:'L',coverDate:credit,overtimeDate:credit};
 let writes=[],prompts=0;
 const g={window:{confirm:()=>{prompts++;return allow},P79Overtime:{
  report:()=>rule,activeReportRows:()=>[early],prepareSaveValidation:async()=>({rules:{rows:[early],config:{}},cloud:{capabilities:{adjustedOvertimeReviewV1:capability},schedules:[{empId:'W',schedule:{__meta:{[date]:{overtimeReport:saved}}}}]}}),
  verifySavedReport:(draft,result)=>{assert.equal(draft.id,result.id);assert.equal(draft.adjustedIndependentReview,true)}
 }},p79AssertDirectReportActive:()=>{},p79SaveWorkOvertimeDraft:async draft=>{
  writes.push(draft);if(writes.length===1)throw Error(message);
  return {ok:true,directOvertimeSaved:true,id:draft.id,report:{planned:false}};
 }};
 vm.createContext(g);vm.runInContext(page.slice(a,b),g);
 let error=null;try{await g.p79ConfirmPlannedOvertimeCandidate({row:{name:'fixture',empId:'W',forEmpId:'L'},report:saved,rule:early,date,start:1,end:2});}catch(e){error=e}
 return {writes,prompts,error};
}
(async()=>{
 let t=await frontend();assert.equal(t.error,null);assert.equal(t.prompts,1);assert.equal(t.writes.length,2);
 assert.equal(t.writes[1].id,'ORIGINAL');assert.equal(t.writes[1].sourceLeaveHandoffId,'L1');assert.equal(t.writes[1].leaveHandoffId,'');assert.equal(t.writes[1].forEmpId,'');
 for(const opts of [{capability:false},{allow:false},{message:'網路中斷，結果尚未確認'},{crossDate:true}]){
  t=await frontend(opts);assert(t.error);assert.equal(t.writes.length,1,'no retry on uncertainty, old backend, declined change or cross-date');
 }
 const c=page.indexOf('        function p79PlannedBulkCandidate('),d=page.indexOf('        function p79RefreshPlannedBulkControls(',c);assert(c>=0&&d>c);
 let shift='早';
 const m={minute:v=>Number(v)*60,sameReport:()=>false,resolve:()=>({state:'completed',confirmed:true})};
 const x={window:{P79Overtime:{activeReportRules:()=>[early],report:()=>({category:'延',code:early[1],normalStart:'08',normalEnd:'16',overtimeStart:'16',overtimeEnd:'20',declaredHours:4}),ruleAttendanceIssue:()=>''},P79OvertimeShiftMatch:m},
  p79CanReportOvertime:()=>true,p79OvertimeCoverDateWarning:()=>null,normalizeScheduleDateKey:v=>v,p79OvertimePendingReason:()=>({code:'review'}),p79DirectAttendanceTimestamp:v=>v,p79OvertimeAttendanceIssue:()=>'',p79ResolvePlannedOvertimePeriod:()=>({state:'completed',confirmed:true,suggested:{category:'延',code:early[1],overtimeStart:'16',overtimeEnd:'20'}}),p79WorkOvertimeRoster:()=>({[coverDay]:shift}),p79PlannedBulkKey:()=> 'KEY',console};
 vm.createContext(x);vm.runInContext(page.slice(c,d),x);
 const row={empId:'W',rosterDate:coverDay,reportVerified:true,clockIn:1,clockOut:2,forEmpId:'L',overtimeReport:{id:'ORIGINAL',planned:true,category:'延',code:'old',leaveId:'L1',forEmpId:'L'}};
 assert(x.p79PlannedBulkCandidate(row,coverDay),'changed rule with latest matching normal shift is eligible');shift='中';assert.equal(x.p79PlannedBulkCandidate(row,coverDay),null,'wrong normal shift is not eligible');
 assert(page.includes('adjustedIndependentReview:true,sourceLeaveHandoffId:draft.sourceLeaveHandoffId'));
 assert(backend.includes('本人加班原代班稽核未通過正式讀回確認'));
 console.log('PASS adjusted linked and independent overtime, early/night actual punches, original ID/date, permissions and approvals, duplicate/overlap protection, explicit frontend choice and safe retry guards');
})().catch(e=>{console.error(e);process.exitCode=1});
