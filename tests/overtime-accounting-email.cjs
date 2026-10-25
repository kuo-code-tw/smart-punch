// In-memory fixtures only. No real Google emails are sent.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const day='2026-10-23';
const rule1={id:'R1',code:'颱08-11',typeName:'颱風日加班',declaredHours:3};
const rule2={id:'R2',code:'休08-16',typeName:'休息日加班',declaredHours:8};
const rule3={id:'R3',code:'颱08-12',typeName:'颱風日加班',declaredHours:4};
const people=[{empId:'E1',name:'甲'},{empId:'E2',name:'乙'}];
const schedules=[
 {empId:'E1',schedule:{__meta:{[day]:{overtimeReport:rule1,overtimeReports:[rule1,rule3]}}}},
 {empId:'E2',schedule:{__meta:{[day]:{overtimeReport:rule2}}}}
];
const browser={};browser.window=browser;vm.createContext(browser);
vm.runInContext(fs.readFileSync('assets/port79-overtime-mail.js','utf8'),browser);
const ui=browser.P79OvertimeMail;
const rows=ui.collect({schedules},people,'2026-10'),items=ui.dailyItems(rows,day);
assert.equal(rows.length,3,'same person with two rules must be included without duplicates');
assert.equal(items.length,3);
assert(ui.dayStatus(day,items,[],'finance').kind==='new');
const attendance={document:{readyState:'loading',addEventListener(){}},addEventListener(){}};
attendance.window=attendance;vm.createContext(attendance);
vm.runInContext(fs.readFileSync('assets/port79-attendance-overtime.js','utf8'),attendance);
const dayUi=attendance.P79AttendanceOvertimeDayStatus;
let props={P79_OVERTIME_MAIL_RECIPIENTS_V1:JSON.stringify([{id:'finance',name:'財務',email:'finance@company.example'}])};
const sheets={},sent=[];
function getSheet(name){
 const grid=[];
 return {grid,appendRow:r=>grid.push(r.slice()),getLastRow:()=>grid.length,getLastColumn:()=>grid[0]?.length||0,
 getRange(row,col,h=1,w=1){return {
  setNumberFormat(){return this},
  getValue(){return grid[row-1]?.[col-1]},
  setValue(v){while(grid.length<row)grid.push([]);grid[row-1][col-1]=v;return this},
  getValues(){return Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>grid[row-1+i]?.[col-1+j]??''))},
  setValues(m){m.forEach((r,i)=>r.forEach((v,j)=>{while(grid.length<row+i)grid.push([]);grid[row-1+i][col-1+j]=v}));return this}
 }}
 };
}
const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=getSheet(n))};
let denied=false;
const server={
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}})},
 Utilities:{getUuid:()=> 'test1234-test1234-test1234-test1234'},
 gcRequireSystemPermission_(){if(denied)throw Error('no permission');return {empId:'ADMIN',name:'管理員'}},
 p79GetEmployeeMasterCached_:()=>people,p79CanReadScopedEmployee_:()=>true,
 readScheduleMonthOnly_:()=>schedules,
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 SpreadsheetApp:{flush(){}},
 MailApp:{getRemainingDailyQuota:()=>30,sendEmail:o=>sent.push(o)}
};
server.globalThis=server;vm.createContext(server);
vm.runInContext(fs.readFileSync('backend/overtime-accounting-email.gs','utf8'),server);
const options=server.p79OvertimeMailOptions_(ss,{month:'2026-10'});
assert.equal(options.overtimeMailVersion,2);
assert(options.canManageRecipients===true);
const payload={date:day,recipientId:'finance',expectedReports:items,requestId:'otmailday_request_1234'};
const once=server.p79OvertimeDayMailSend_(ss,payload);
const twice=server.p79OvertimeDayMailSend_(ss,payload);
assert.equal(once.sent,true);assert.equal(twice.duplicate,true);
assert.equal(sent.length,1,'ONE email for every employee and report on the day');
assert.match(sent[0].body,/甲/);assert.match(sent[0].body,/乙/);
assert.match(sent[0].body,/3 筆/);
const receipts=server.p79OvertimeMailOptions_(ss,{month:'2026-10'}).receipts;
assert.equal(receipts.length,1);
assert.equal(ui.dayStatus(day,items,receipts,'finance').kind,'sent');
assert.equal(dayUi.overtimeDayIndicator(day,{ready:true,rows:schedules,people},receipts).kind,'mailed');
const edited=items.map(x=>({...x,report:{...x.report}}));
edited[0].report.declaredHours=6;
assert.equal(ui.dayStatus(day,edited,receipts,'finance').kind,'stale');
assert.throws(()=>server.p79OvertimeDayMailSend_(ss,{...payload,requestId:'otmailday_request_1235',expectedReports:edited}),/不一致/);
assert.equal(sent.length,1);
const changedSchedules=JSON.parse(JSON.stringify(schedules));
changedSchedules[0].schedule.__meta[day].overtimeReport={...rule1,declaredHours:6};
assert.equal(dayUi.overtimeDayIndicator(day,{ready:true,rows:changedSchedules,people},receipts).kind,'outdated');
assert.throws(()=>server.p79OvertimeDayMailSend_(ss,{...payload,recipientId:'outside',requestId:'otmailday_request_1236'}),/名單/);
const added=server.p79OvertimeMailManageRecipient_(ss,{operation:'add',name:'人資',email:'hr@company.example'});
assert.equal(added.recipients.length,2);
assert.equal(server.p79OvertimeMailOptions_(ss,{month:'2026-10'}).recipients.length,2);
assert.throws(()=>server.p79OvertimeMailManageRecipient_(ss,{operation:'add',name:'人資',email:'hr@company.example'}),/已經在名單/);
const removed=server.p79OvertimeMailManageRecipient_(ss,{operation:'remove',recipientId:added.recipients[1].id});
assert.equal(removed.recipients.length,1);
assert.equal(server.p79OvertimeMailOptions_(ss,{month:'2026-10'}).receipts.length,1,'historical email audit retained');
denied=true;
assert.throws(()=>server.p79OvertimeMailManageRecipient_(ss,{operation:'add',name:'不允許',email:'bad@example.com'}),/permission/);
assert.throws(()=>server.p79OvertimeDayMailSend_(ss,payload),/permission/);
assert.equal(sent.length,1);
const work=fs.readFileSync('work-hours/index.html','utf8');
assert(work.includes('✉ 發送 Mail'));
assert(work.includes('daily-mail-v3'));
const attend=fs.readFileSync('attendance/index.html','utf8');
assert(attend.includes('daily-mail-v4'));
console.log('PASS one email per day, multi-person digest, canonical cloud version, idempotence, date status, add/remove Mail, authorization');
