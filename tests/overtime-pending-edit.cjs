'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const backend=fs.readFileSync('backend/night-cover-dual-date-v108-core.gs','utf8');
const asset=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const page=fs.readFileSync('work-hours/index.html','utf8');
const date='2026-11-19',next='2026-11-20';
const night=['延','延20-08',4,6.02,'24','08','20','24','before','平日延時加班'];
const early=['延','延16-20',4,6.02,'08','16','16','20','after','平日延時加班'];
const old={id:'ORIG',planned:true,workDate:date,overtimeDate:date,category:'延',code:night[1]};
const source=[{empId:'W',schedule:{[date]:'中',__meta:{[date]:{overtimeReport:old,reportOriginalShift:'晚'}}}}];
const clone=x=>JSON.parse(JSON.stringify(x));
let stored=clone(source);
const req={id:'ORIG',replaceReportId:'ORIG',empId:'W',date,workDate:date,overtimeDate:date,coverDate:date,month:'2026-11',planned:true,editPlannedOnly:true,note:'改時段',forEmpId:'',leaveHandoffId:''};
const stubs={normalizeEmpId_:v=>String(v||'').trim().toUpperCase(),p79AssertOvertimeReportNotRevoked_:()=>{},
 gcRequireActionPermission_:()=>({empId:'ADMIN',name:'TEST'}),p79DateOnly_:v=>v,p79GetEmployeeMasterCached_:()=>[{empId:'W'}],
 p79CanReadScopedEmployee_:()=>true,readScheduleMonthOnly_:()=>stored,getScheduleSyncRevision_:()=> 'S',getLeaveSyncRevision_:()=> 'L',
 getEmployeeAuthRevision_:()=> 'E',scheduleReadEditLock_:()=>null,getSystemConfig_:()=>({overtimeConversionRowsV1:[night,early]}),
 Utilities:{formatDate:()=> '2026-11-25'},p79ReadLeaveCoverAssignments_:()=>[],SHEET_LEAVE:'leave',
 syncSchedules_:(_,data)=>{stored=clone(data.schedules);},P79_LEAVE_DELETE_PERMIT_:{},P79_OT_HISTORY_ACTOR_:null};
const core=new Function(...Object.keys(stubs),backend+'\nreturn {plan:p79PlanDirectReport_,save:p79SaveDirectOvertimeReport_};')(...Object.values(stubs));
let r=core.plan(source,req,early,null,[],[],[]);
assert.equal(r.report.id,'ORIG');assert.equal(r.report.planned,true);assert.equal(r.report.code,early[1]);assert.equal(r.report.actualMinutes,null);
assert.equal(r.rows[0].schedule[date],'中');assert.equal(source[0].schedule.__meta[date].overtimeReport.code,night[1]);
assert.throws(()=>core.plan(source,{...req,id:'NEW'},early,null,[],[],[]),/原預排已變更/);
assert.throws(()=>core.plan(source,{...req,planned:false},early,null,[],[],[]),/原預排已變更/);
let approved=clone(source);approved[0].schedule.__meta[date].overtimeReport.approvedBy='manager';
assert.throws(()=>core.plan(approved,req,early,null,[],[],[]),/原預排已變更/);
let formal=clone(source);formal[0].schedule.__meta[date].overtimeReport.planned=false;
assert.throws(()=>core.plan(formal,req,early,null,[],[],[]),/原預排已變更/);
const linked=clone(source);linked[0].schedule.__meta[date].forEmpId='L';Object.assign(linked[0].schedule.__meta[date].overtimeReport,{leaveId:'L1',coverDate:date});
linked.push({empId:'L',schedule:{[date]:'年',__meta:{[date]:{leaveOriginalShift:'早'}}}});
const covers=[{leaveId:'L1',leaveEmpId:'L',startDate:date,endDate:date,mode:'two',workerIds:['W','OTHER']}];
const leaves=[{id:'L1',empId:'L',startDate:date,endDate:date,status:'已核准'}];
const lr={...req,leaveHandoffId:'L1',forEmpId:'L'};
r=core.plan(linked,lr,early,null,covers,leaves,[]);
assert.equal(r.report.planned,true);assert.equal(r.report.leaveId,'L1');assert.equal(r.rows[0].schedule[date],'中');
assert.throws(()=>core.plan(linked,{...lr,forEmpId:'X'},early,null,covers,leaves,[]),/原預排日期或代班關聯/);
const ss={getSheetByName:()=>null},request={...req,category:'延',code:early[1],typeName:early[9],expectedRevision:'S:L:E:2026-11'};
r=core.save(ss,request);
assert.equal(r.report.planned,true);assert.equal(r.report.id,'ORIG');assert.equal(r.report.code,early[1]);assert.equal(r.report.note,'改時段');
assert.throws(()=>core.save(ss,{...request,id:'NEW',replaceReportId:'',editPlannedOnly:false}),/過去日期/);
const start=Date.parse(date+'T19:35:00+08:00'),end=Date.parse(next+'T05:47:00+08:00');
const att={start,end,inId:'I',outId:'O'},review={...req,planned:false,editPlannedOnly:false,manualReviewCoverage:true};
r=core.plan(source,review,night,att,[],[],[]);
assert.equal(r.report.actualMinutes,240);assert.equal(r.report.convertedHours,6.02);assert.equal(r.report.planned,false);
assert.equal(r.rows[0].schedule[date],'中');
assert.throws(()=>core.plan(source,review,night,{...att,start:Date.parse(date+'T20:05:00+08:00')},[],[],[]),/完整實際加班/);
assert.throws(()=>core.plan(linked,{...review,leaveHandoffId:'L1',forEmpId:'L'},night,att,covers,leaves,[]),/不屬於原請假班別/);
r=core.plan(linked,{...review,adjustedIndependentReview:true,sourceLeaveHandoffId:'L1',sourceForEmpId:'L'},night,att,covers,leaves,[]);
assert.equal(r.report.id,'ORIG');assert.equal(r.report.actualMinutes,240);assert.equal(r.report.adjustedIndependentFrom.leaveId,'L1');
assert.equal(r.report.leaveId,'');assert.equal(r.rows[0].schedule[date],'中');
const win={};new Function('window',asset)(win);const api=win.P79Overtime;
assert(api.manualPlannedReviewCovers(start,end,date,night));
assert(!api.manualPlannedReviewCovers(Date.parse(date+'T20:05:00+08:00'),end,date,night));
assert(!api.manualPlannedReviewCovers(start,NaN,date,night));
const i=page.indexOf('        function p79OpenExistingPlannedEditRow'),j=page.indexOf('        function p79OpenPlannedOvertimeReviewRow(',i);
assert(i>=0&&j>i);
const row={empId:'W',rosterDate:date,reportVerified:true,overtimeReport:clone(old)};
let allowed=true,calls=[],alerts=[];
const ui=new Function('window','p79CanReportOvertime','normalizeScheduleDateKey','p79WorkOvertimeRoster','p79WorkOvertimeDisplayedRows','p79OvertimePlannedDisplayedRows','p79OvertimeCoverDateWarning','p79DirectAttendanceTimestamp','p79OvertimeAttendanceIssue','alert','busy',
 'let p79PlannedBulkBusy=busy;'+page.slice(i,j)+';return {edit:p79OpenMainPlannedEdit,pending:p79OpenPlannedEdit,canReview:p79CanManuallyReviewPlannedRow,setBusy:v=>p79PlannedBulkBusy=v};')
 ({P79Overtime:{openReport:p=>calls.push(p)}},()=>allowed,v=>v,()=>({[date]:'中'}),[row],[row],()=>null,v=>v,()=>'',m=>alerts.push(m),false);
ui.edit(0);ui.pending(0);
assert.equal(calls.length,2);assert(calls.every(p=>p.manualPlan&&p.editPlannedOnly&&p.reportId==='ORIG'&&!p.attendance&&!p.plannedReview));
assert(!ui.canReview(row));assert(ui.canReview({...row,clockIn:start,clockOut:end}));
allowed=false;ui.edit(0);assert.equal(calls.length,2);
allowed=true;row.overtimeReport.planned=false;ui.edit(0);assert.equal(calls.length,2);assert.equal(alerts.length,1);
row.overtimeReport.planned=true;ui.setBusy(true);ui.edit(0);assert.equal(calls.length,2);
assert(page.includes('onclick="p79OpenMainPlannedEdit(${rowIndex})"'));assert(page.includes("p79OpenPlannedEdit('+index+')"));
const scripts=[...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].filter(m=>m[1].includes('function p79OpenExistingPlannedEditRow')||m[1].includes('async function p79SaveWorkOvertimeDraft'));
assert(scripts.length>=1);for(const m of scripts)new Function(m[1]);
console.log('PASS pending edit (historical/current), same ID, no punches, roster preservation, linked plan, review coverage across midnight, independent audit, UI permission and syntax guards');
