'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),json=x=>JSON.parse(JSON.stringify(x));
const date='2026-11-28',month='2026-11',empId='TEST';
const report={id:'OLD',category:'休',code:'休16-24',planned:true,note:'每月未休假加班 2026-11'};
const archive={version:1,confirmed:true,reportId:'OLD',empId,date,reason:'休假超額',originalShift:'休',report};
const active=[{empId,month,schedule:{[date]:'休16-24',__meta:{[date]:{overtimeAssignedShift:'休16-24',reportOriginalShift:'休',overtimeReport:report}}}}];
const orphan=[{empId,month,schedule:{[date]:'休16-24',__meta:{[date]:{overtimeExcluded:true,overtimeRevocations:[archive]}}}}];
const request={token:'fixture',empId,date,expectedRevision:'1:1:1:'+month,expectedReportId:'OLD',reason:'restore_revoked_preplan',expectedCurrentShift:'休16-24',expectedOriginalShift:'休'};
const code=['overtime-revocation-audit.gs','overtime-revocation-delete-plan.gs','overtime-revocation-delete-route.gs'].map(f=>fs.readFileSync('backend/'+f,'utf8')).join('\n');
function setup(initial,{deny=false,leave=false,broken=false}={}){
 let rows=json(initial),writes=0;
 const env={normalizeEmpId_:x=>String(x||'').toUpperCase(),p79DateOnly_:String,gcRequireSystemPermission_:()=>({empId:'ADMIN'}),getScheduleSyncRevision_:()=>1,getLeaveSyncRevision_:()=>1,getEmployeeAuthRevision_:()=>1,readScheduleMonthOnly_:()=>json(rows),P79_LEAVE_COVER_SHEET:'covers',SHEET_LEAVE:'leave',p79ReadLeaveCoverAssignments_:()=>[],p79GetEmployeeMasterCached_:()=>[{empId}],p79CanReadScopedEmployee_:()=>!deny,readLeaveRecords_:()=>[{empId,status:'已核准',startDate:date,endDate:date}],syncSchedules_:(ss,d)=>{rows=json(d.schedules);writes++;if(broken&&writes===1)rows[0].schedule[date]='晚';},touchLeaveSyncRevision_(){},touchScheduleSyncRevision_(){}};
 const route=new Function('env','const {'+Object.keys(env).join(',')+'}=env;'+code+';return p79DeleteOvertimeAssignment_;')(env);
 return {run:data=>route({getSheetByName:n=>n==='leave'&&leave?{getLastRow:()=>2}:null},data),rows:()=>json(rows),writes:()=>writes};
}
let t=setup(active);
assert(t.run({...request,reason:'rest_quota_excess'}).revocationVerified);
assert.equal(t.rows()[0].schedule[date],'休');
t=setup(orphan);assert(t.run(request).restorationVerified);assert.equal(t.rows()[0].schedule[date],'休');assert.equal(JSON.stringify(t.rows()[0].schedule.__meta[date].overtimeRevocations[0]),JSON.stringify(archive));
for(const patch of [{expectedOriginalShift:'早'},{expectedCurrentShift:'晚'},{expectedRevision:'wrong'},{expectedReportId:'wrong'}]){
 t=setup(orphan);assert.throws(()=>t.run({...request,...patch}));assert.equal(t.writes(),0);
}
const newer=json(orphan);newer[0].schedule.__meta[date].overtimeReport={...report,id:'NEW'};
t=setup(newer);assert.throws(()=>t.run(request));assert.equal(t.writes(),0);
for(const opts of [{deny:true},{leave:true}]){t=setup(orphan,opts);assert.throws(()=>t.run(request));assert.equal(t.writes(),0);}
t=setup(orphan,{broken:true});assert.throws(()=>t.run(request));assert.equal(t.writes(),2);assert.equal(JSON.stringify(t.rows()),JSON.stringify(orphan));
const window={P79SpecialOvertime:{kindsForDate:d=>d===date?[{kind:'election'}]:[]}};
new Function('window',fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8'))(window);
const scan=version=>window.P79MonthlyRest.abnormalMonthlyRestPlans({schedules:orphan,overtimeRevokedRestoreVersion:version},[{empId}],month);
assert.equal(scan(0).repair.length,0);assert(scan(0).review.some(r=>r.issue.includes('部署')));
assert.equal(scan(1).repair.length,1);assert(scan(1).repair[0].restoreRevoked);assert.equal(scan(1).repair[0].original,'休');
console.log('PASS archived original-shift restore: legacy field, exact audit, scope, leave, stale revision, rollback, newer report, capability handshake');
