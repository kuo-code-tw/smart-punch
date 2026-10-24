const fs=require('fs'),vm=require('vm'),a=require('assert/strict'),html=fs.readFileSync('attendance/index.html','utf8');
const name='p79AttendanceReportedOvertime',start=html.indexOf('        function '+name+'('),code=html.slice(start,html.indexOf('\n        }',start)+10);
const date='2026-10-23',context={p79AttendanceOvertimeDate:()=>date,window:{P79SpecialOvertime:{forShift:()=>[{date}]}},getAttendanceTimestamp:r=>r.at};vm.createContext(context);vm.runInContext(code,context);
const row=id=>({empId:id,clockIn:{id:'IN-'+id,at:Date.parse(date+'T07:32:00+08:00')},clockOut:{id:'OUT-'+id,at:Date.parse(date+'T11:55:00+08:00')}});
const state=meta=>({rows:[{empId:'468',schedule:{[date]:'早',__meta:{[date]:meta}}}],covers:[]});
for(const category of ['國','休','例'])for(let i=1;i<=83;i++){
 const id='E'+i,s={rows:[{empId:id,schedule:{[date]:'早',__meta:{[date]:{restCategory:category,restQuotaOvertime:true,restAllocationSource:'auto-v1'}}}}],covers:[]};
 a.equal(context.p79AttendanceReportedOvertime(row(id),s),null,'automatic quota flags must never fabricate declaration labels for '+id);
}
a.equal(context.p79AttendanceReportedOvertime(row('468'),state({restCategory:'國',restQuotaOvertime:true,overtime:true,overtimeStart:'08:00',overtimeEnd:'16:00'})),null,'legacy overtime flags without saved ID are not a declaration');
const report={id:'REAL',category:'國',typeName:'颱風日加班',code:'颱08-12',declaredHours:4,overtimeStart:'08',overtimeEnd:'12'};
a.equal(context.p79AttendanceReportedOvertime(row('468'),state({overtimeReport:{...report,attendanceInId:'OTHER-IN',attendanceOutId:'OTHER-OUT'}})),null,'report belonging to another shift is not repeated on this row');
const good=context.p79AttendanceReportedOvertime(row('468'),state({restCategory:'國',restQuotaOvertime:true,overtimeReport:report}));a.equal(good.label,'颱08-12');a.equal(good.minutes,240);
a.equal(context.p79AttendanceReportedOvertime(row('468'),state({overtimeReport:report,overtimeExcluded:true})),null,'excluded report cannot resurrect from quota metadata');
a.equal(context.p79AttendanceReportedOvertime(row('468'),state({overtimeReport:report,overtimeRevocations:[{confirmed:true,reportId:'REAL'}]})),null,'revoked report is not active');
const declared=context.p79AttendanceReportedOvertime(row('468'),state({overtimeReport:{...report,code:'國08-14',overtimeEnd:'14',declaredHours:8}}));a.equal(declared.minutes,480,'configured declared hours are not reconstructed from interval length');
context.window.P79Overtime={overtimeMinutes:()=>0};a.equal(context.p79AttendanceReportedOvertime(row('468'),state({overtimeReport:report})),null,'non-overlapping legacy report does not repeat on a second same-day shift');delete context.window.P79Overtime;
const coverState=state({});coverState.rows.push({empId:'TARGET',schedule:{[date]:'早'}});coverState.covers=[{leaveEmpId:'TARGET',workerIds:['468','OTHER'],startDate:date,endDate:date,mode:'two'}];const cover=context.p79AttendanceReportedOvertime(row('468'),coverState);a.equal(cover.label,'代08-12');a.equal(cover.pending,true);a.equal(cover.report,null);
console.log('PASS all 83 staff across quota categories: no phantom declarations, exact typhoon codes, exclusions/revocations, declared hours, and pending genuine covers');
