const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const date='2026-10-28',report={id:'R1',category:'休',code:'休16-24',declaredHours:8,overtimeStart:'16',overtimeEnd:'24',reportedAt:'2026-10-20T08:00:00Z',updatedAt:'2026-10-30T03:00:00Z'};
const reason={};reason.window=reason;vm.createContext(reason);vm.runInContext(fs.readFileSync('assets/port79-overtime-reason.js','utf8'),reason);
assert.equal(reason.P79OvertimeReason.amended(report).verified,false,'ordinary updatedAt does not prove an amendment');assert.equal(reason.P79OvertimeReason.amended({...report,replacesReportId:report.id}).verified,false,'same report ID is not a replacement');assert.equal(reason.P79OvertimeReason.amended({...report,modifiedAt:'2026-10-29T08:00:00Z'}).verified,true,'an explicit amendment remains visible');
let writes=0;const review={confirmed:true,mismatch:true,state:'completed',code:'休08-16',category:'休',suggested:{code:'休08-16',category:'休'}};
const clockIn={id:'IN'},clockOut={id:'OUT'},roster={[date]:'休',__meta:{[date]:{overtimeReport:report}}};
const c={normalizeScheduleDateKey:v=>v,p79DirectAttendanceTimestamp:()=>1,p79WorkOvertimeRoster:()=>roster,p79CanReportOvertime:()=>true,p79WorkhoursIsEditing:()=>false,currentPort79SsoToken:()=> 'fixture',getActiveGasUrl:()=> 'https://fixture.invalid',P79OvertimeShiftMatch:{resolve:()=>review},P79Overtime:{reportRules:()=>[],overtimeMinutes:()=>60},P79OvertimePeriodSync:{sync(){writes++}},p79QueueConfirmedRosterRecheck(){},getAttendanceTimestamp:()=>1,p79AttendanceOvertimeDate:()=>date,p79AttendanceRosterRows:()=>[{schedule:roster}],p79AttendanceSpecialParts:()=>[],getAttendanceEmployeeMasterToken:()=> 'fixture'};c.window=c;
vm.createContext(c);
function extract(file,startName,nextName){const text=fs.readFileSync(file,'utf8'),start=text.indexOf('function '+startName+'(');assert(start>=0);return text.slice(start,text.indexOf('function '+nextName+'(',start));}
vm.runInContext(extract('work-hours/index.html','p79WorkOvertimePeriodReview','p79OpenOvertimeChangeForRow'),c);vm.runInContext(extract('attendance/index.html','p79AttendanceReportedOvertime','attendanceRowAttendanceMinutes'),c);
for(let i=0;i<3;i++){c.p79WorkOvertimePeriodReview({empId:'E1',dateKey:date,clockIn,clockOut,reportVerified:true,overtimeReport:report});c.p79AttendanceReportedOvertime({empId:'E1',clockIn,clockOut},{covers:[],rows:[]},{token:'fixture'});}
assert.equal(writes,0,'opening/rendering either page repeatedly cannot write even for a confirmed mismatch');assert.equal(report.code,'休16-24');
const store=new Map(),state={ready:true,token:'OLD',rows:[{empId:'E1',schedule:roster}],people:[{empId:'E1',name:'甲'}]},session={empId:'MANAGER',adminRole:'admin',dataScope:{dept:'A'},systemPermissions:{workhours:'manage'}};
const q={document:{readyState:'complete',getElementById:()=>null},addEventListener(){},renderRecordsPagination(){},sessionStorage:{getItem:()=>JSON.stringify(session)},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},p79AttendanceOvertimeMonths:new Map([['2026-10',state]])};q.window=q;vm.createContext(q);vm.runInContext(fs.readFileSync('assets/port79-attendance-overtime.js','utf8').replace('g.P79AttendanceOvertimeDayStatus={','g.__v4Fingerprint=p79V4ReviewFingerprint;g.P79AttendanceOvertimeDayStatus={'),q);const api=q.P79AttendanceOvertimeDayStatus;
assert.equal(api.overtimeDayIndicator(date,state).kind,'reported');report.modifiedAt='2026-10-29T08:00:00Z';assert(api.markReviewed(date,true));const signature=api.reviewFingerprint(date,state);
report.updatedAt='2026-10-30T04:00:00Z';report.lastSyncedAt='2026-10-30T04:00:01Z';state.token='RENEWED';assert.equal(api.reviewFingerprint(date,state),signature,'metadata refresh and same-viewer token renewal cannot invalidate review');assert(api.isReviewed(date));
report.code='休08-16';assert.notEqual(api.reviewFingerprint(date,state),signature,'real period edits still invalidate review');report.code='休16-24';session.empId='OTHER';assert.notEqual(api.reviewFingerprint(date,state),signature,'review is not shared across users');
console.log('PASS passive attendance/workhours rendering never writes; incidental updates/token renewal preserve reviewed colors; genuine edits remain audited');

// Reproduce the remaining V4 bug: a different module refreshes permission
// metadata while leaving every formal overtime business value untouched.
session.empId='MANAGER';
assert(api.markReviewed(date,true));
const beforeRefresh=api.reviewFingerprint(date,state);
const oldPermissionSignature=q.__v4Fingerprint(date,state);
session.systemPermissions={...session.systemPermissions,history:'view',workhours:'manage'};
session.finePermissions={workhours:{canExport:true}};
session.dataScope={workhours:'all',attendance:'all'};
assert.notEqual(q.__v4Fingerprint(date,state),oldPermissionSignature,'reproduce V4 false invalidation on unrelated permission enrichment');
assert.equal(api.reviewFingerprint(date,state),beforeRefresh,'module permission enrichment is not a filing edit');
assert(api.isReviewed(date),'green stays reviewed after entering another module');
roster.__meta[date].overtimeReports=[{...report,revision:77,modifiedAt:'2026-10-30T17:00:00Z',updatedBy:'sync'}];
report.revision=78;report.modifiedAt='2026-10-30T17:00:01Z';report.attendanceInId='RELINKED-PUNCH';
assert.equal(api.reviewFingerprint(date,state),beforeRefresh,'mirror reports, revision counters, timestamps and punch links do not change filing contents');
assert(api.isReviewed(date));
report.declaredHours='8';
assert.equal(api.reviewFingerprint(date,state),beforeRefresh,'numeric strings and numbers are equivalent');
roster.__meta[date].overtimeReports=[];
for(const [key,value] of [['note','new reason'],['declaredHours',4],['forEmpId','OTHER']]){
 const old=report[key];report[key]=value;
 assert.notEqual(api.reviewFingerprint(date,state),beforeRefresh,key+' business edit invalidates review');report[key]=old;
}
roster.__meta[date].overtimeExcluded=true;
assert.notEqual(api.reviewFingerprint(date,state),beforeRefresh,'cancellation/exclusion invalidates review');
delete roster.__meta[date].overtimeExcluded;
console.log('PASS same-viewer permission refresh, mirror representation, metadata and punch-link changes retain green; real hours/reason/beneficiary/cancellation changes invalidate');
