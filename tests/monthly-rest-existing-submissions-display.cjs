'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const file=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const a=file.indexOf('function existingRestOvertimeRows('),b=file.indexOf('// 與正式申報候選分開',a);
assert(a>=0&&b>a,'read-only previously submitted declaration collector exists');
const ctx={cats:['國','休','例'],id:x=>String(x||'').trim().toUpperCase()};
vm.createContext(ctx);vm.runInContext(file.slice(a,b),ctx);
const month='2026-10',d='2026-10-15',t='2026-10-23';
const report=(id,code,category='國',status='已核對出勤')=>({id,code,category,status});
const employee={empId:'AN1150006',name:'沈裕峰',jobTitle:'F/L'};
const actual={empId:employee.empId,month,schedule:{__personnel:{role:'F/L'},__meta:{
 [d]:{note:'每月未休假加班 2026-10',overtimeReport:report('FL-CONFIRMED','國24-08'),
   overtimeReports:[report('FL-CONFIRMED','國24-08'),report('OLDER','國16-24')]},
 [t]:{overtimeReport:report('FL-TYPHOON','颱08-12')},
 '2026-10-21':{overtimeReport:report('REVOKED','休08-16'),
   overtimeRevocations:[{reportId:'REVOKED',confirmed:true}]},
 '2026-10-22':{overtimeReport:report('COVER','代08-16','代')}
 }}};
const raw=JSON.stringify(actual),rows=ctx.existingRestOvertimeRows({schedules:[actual]},[employee],month);
assert.equal(JSON.stringify(actual),raw,'collector never modifies official roster or reporting');
assert.equal(rows.length,4,'deduplicates current report from report history; excludes substitute');
const byId=Object.fromEntries(rows.map(r=>[r.reportId,r]));
assert.equal(byId['FL-CONFIRMED'].status,'已核對出勤');
assert.equal(byId['FL-CONFIRMED'].monthlyRest,true);
assert.equal(byId['FL-CONFIRMED'].role,'F/L');
assert.equal(byId.OLDER.historical,true,'prior report is not current approval');
assert.equal(byId['FL-TYPHOON'].typhoon,true,'typhoon cannot count as ordinary unused leave');
assert.equal(byId.REVOKED.cancelled,true,'revocation cannot reappear as current report');
assert.equal(ctx.existingRestOvertimeRows({schedules:[actual]},[employee],'2026-11').length,0);
assert.match(file,/id="mrExistingRows"/);
assert.match(file,/existingRestOvertimeRows\(snapshot,loadedPeople,loadedMonth\)/);
assert.match(file,/現行申報/);
assert.match(file,/沒有已保存的例／休／國申報編號/);
console.log('PASS: 10月 F\/L saved declarations visible read-only; dedupe, cancelled, historical, typhoon separated; no writes');
