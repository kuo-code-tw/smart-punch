// Safe, fixture-only email integration tests; never sends real mail.
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');
const frontend={};frontend.window=frontend;vm.createContext(frontend);
vm.runInContext(fs.readFileSync('assets/port79-overtime-mail.js','utf8'),frontend);
const mail=frontend.P79OvertimeMail,day='2026-10-15';
const report={id:'R1',category:'國',code:'國08-16',declaredHours:8,modifiedAt:'t1'};
const records=[{empId:'E1',schedule:{__meta:{[day]:{overtimeReport:report}}}}];
const people=[{empId:'E1',name:'測試員'}];
const rows=mail.collect({schedules:records},people,'2026-10');
a.equal(rows.length,1);
a.equal(mail.receiptStatus(rows[0],[]).kind,'new');
const older={...report,declaredHours:7};
const receipt=(r,status='sent')=>({status,reportId:r.id,reportJson:mail.canonical(r),empId:'E1',date:day,recipientId:'acc',recipientName:'會計',sentAt:'2026-10-25'});
a.equal(mail.receiptStatus(rows[0],[receipt(report)],'acc').kind,'sent');
a.equal(mail.receiptStatus(rows[0],[receipt(older)],'acc').kind,'stale');
a.equal(mail.receiptStatus(rows[0],[receipt(report,'sending')],'acc').kind,'pending');
a.equal(mail.receiptStatus(rows[0],[receipt(report)],'other').kind,'new','other recipients must not appear as sent');

const frontendDay={document:{readyState:'loading',addEventListener(){}},addEventListener(){}};
frontendDay.window=frontendDay;vm.createContext(frontendDay);
vm.runInContext(fs.readFileSync('assets/port79-attendance-overtime.js','utf8'),frontendDay);
const dates=frontendDay.P79AttendanceOvertimeDayStatus;
const state={ready:true,people,rows:records};
a.equal(dates.overtimeDayIndicator(day,state,[receipt(report)]).kind,'mailed');
a.equal(dates.overtimeDayIndicator(day,state,[receipt(older)]).kind,'outdated');
a.equal(dates.overtimeDayIndicator(day,state).kind,'amended','without receipt never claim sent');
records[0].schedule.__meta[day].overtimeRevocations=[{confirmed:true,reportId:'R1',report,empId:'E1',date:day,at:'2026-10-25',actor:'主管'}];
a.equal(dates.overtimeDayIndicator(day,state,[receipt(report)]).kind,'revoked','cancellation overrides previous sent status');

const header=['requestId','status','sentAt','createdAt','reportId','empId','date',
'recipientId','recipientEmail','recipientName','actorEmpId','actorName','reportJson','error'];
let grid=null,sent=0,denied=false,rosters=[{empId:'E1',schedule:{__meta:{[day]:{overtimeReport:{...report}}}}}];
function fakeRange(row,col,h=1,w=1){
 return {
  getValue(){return (grid[row-1]||[])[col-1]},
  getValues(){return Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>(grid[row+i-1]||[])[col+j-1]??''))},
  setValue(v){while(grid.length<row)grid.push([]);grid[row-1][col-1]=v;return this},
  setValues(rows){rows.forEach((a,i)=>a.forEach((value,j)=>{while(grid.length<row+i)grid.push([]);grid[row+i-1][col+j-1]=value}));return this}
 };
}
const sheet={
 appendRow(row){grid.push([...row])},
 getLastRow(){return grid.length},
 getLastColumn(){return grid[0].length},
 getRange:fakeRange
};
const ss={getSheetByName(){return grid?sheet:null},insertSheet(){grid=[];return sheet}};
const sandbox={
 PropertiesService:{getScriptProperties(){return {getProperty:()=>JSON.stringify([{id:'acc',name:'會計',email:'accounting@example.com'}])}}},
 gcRequireSystemPermission_(){if(denied)throw Error('no permission');return {empId:'M1',name:'主管'}},
 normalizeEmpId_:x=>String(x).toUpperCase(),
 p79GetEmployeeMasterCached_:()=>people,
 p79CanReadScopedEmployee_:()=>true,
 readScheduleMonthOnly_:()=>rosters,
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 SpreadsheetApp:{flush(){}},MailApp:{getRemainingDailyQuota:()=>10,sendEmail(){sent++}}
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('backend/overtime-accounting-email.gs','utf8'),sandbox);
const send=(overrides={})=>({empId:'E1',date:day,reportId:'R1',recipientId:'acc',
 requestId:'otmail_request_1234',expectedReport:{...report},...overrides});
a.equal(sandbox.p79OvertimeMailOptions_(ss,{month:'2026-10'}).receipts.length,0);
let done=sandbox.p79OvertimeMailSend_(ss,send());
a.equal(done.sent,true);a.equal(sent,1);
a.equal(sandbox.p79OvertimeMailOptions_(ss,{month:'2026-10'}).receipts.length,1);
done=sandbox.p79OvertimeMailSend_(ss,send());
a.equal(done.duplicate,true);a.equal(sent,1,'no duplicate sends');
a.throws(()=>sandbox.p79OvertimeMailSend_(ss,send({recipientId:'outside'})),/收件人/);
a.throws(()=>sandbox.p79OvertimeMailSend_(ss,send({expectedReport:{...report,declaredHours:4}})),/版本已改變/);
rosters[0].schedule.__meta[day].overtimeExcluded=true;
a.throws(()=>sandbox.p79OvertimeMailSend_(ss,send({requestId:'otmail_other_12345'})),/加班已取消/);
a.equal(sent,1);
denied=true;
a.throws(()=>sandbox.p79OvertimeMailOptions_(ss,{month:'2026-10'}),/permission/);
a.throws(()=>sandbox.p79OvertimeMailSend_(ss,send()),/permission/);
a.equal(sent,1);
const html=fs.readFileSync('work-hours/index.html','utf8');
a(html.includes('P79OvertimeMail.open()'));
a(html.includes('p79OvertimeMailContext'));
a(fs.readFileSync('attendance/index.html','utf8').includes('email-sent-v3'));
console.log('PASS restricted recipients, exact version, verified cloud audit, nonduplicate send, cancelled block, date color and UI wiring');
