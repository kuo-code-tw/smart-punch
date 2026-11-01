'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const begin=src.indexOf('function automaticSupplementReviewRows('),
 end=src.indexOf('// 與正式申報候選分開',begin);
assert(begin>=0&&end>begin);
const ctx={cats:['國','休','例'],id:x=>String(x||'').trim().toUpperCase()};
vm.createContext(ctx);vm.runInContext(src.slice(begin,end),ctx);
const emp=(id,job='F/L')=>({empId:id,name:id,jobTitle:job,company:'甲公司',dept:'作業單位',group:'A組'});
const staff=[emp('FL1'),emp('FL2'),emp('FL3'),emp('ARM','ARMG')];
const first={empId:'FL1',month:'2026-10',schedule:{__personnel:{role:'F/L'},__meta:{
 '2026-10-01':{restAllocationSource:'auto-v1',restCategory:'休'},
 '2026-10-02':{restAllocationSource:'auto-v1',restCategory:'國'},
 '2026-10-15':{restQuotaOvertime:true,restCategory:'國',
  overtimeReport:{id:'R1',code:'國24-08',category:'國',status:'已核對出勤'}}
}}};
const second={empId:'FL2',month:'2026-10',schedule:{__meta:{
 '2026-10-19':{restQuotaOvertime:true,restCategory:'休'}
}}};
const last={empId:'ARM',month:'2026-10',schedule:{__meta:{}}};
const snapshot={schedules:[first,second,last],attendanceEvidence:{complete:true}};
const balances=staff.filter(x=>x.empId!=='FL3').map(emp=>({
 emp,remaining:emp.empId==='FL2'?{國:0,例:0,休:1}:{例:0,休:0,國:0},
 ledger:[]}));
const model={balances,unavailable:[{emp:staff[2],reason:'本月班表缺漏'}],
 rows:[{empId:'FL2',planned:false,saved:false}],plannedRows:[]};
const prior=JSON.stringify({snapshot,model});
const rows=ctx.automaticSupplementReviewRows(snapshot,staff,'2026-10',model);
assert.equal(rows.length,4,'all employees including zero deficit must remain visible');
const map=Object.fromEntries(rows.map(x=>[x.empId,x]));
assert.equal(map.FL1.autoRest,2,'rest assignment is not itself a reported overtime day');
assert.equal(map.FL1.confirmed,1,'saved confirmed report separate');
assert.equal(map.FL1.tagged,1);
assert.equal(map.FL2.noReport,1,'rest overtime flag without report ID must not look approved');
assert.match(map.FL2.state,/缺正式申報編號/);
assert.equal(map.FL3.missing,true,'missing roster never silently disappears');
assert.equal(map.ARM.remaining,0,'no due is still listed');
assert.equal(JSON.stringify({snapshot,model}),prior,'read-only cannot mutate submitted reports');
assert.match(src,/id="mrAutoSupplementRows"/);
assert.match(src,/automaticSupplementReviewRows\(snapshot,loadedPeople,loadedMonth,model\)/);
console.log('PASS: automatic monthly supplement status covers every role, F/L, complete, no-report flags, and missing roster; no writes');
