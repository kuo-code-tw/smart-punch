'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const g={window:null,Date,Intl,console};g.window=g;vm.createContext(g);vm.runInContext(source,g);
const {rosterReviewRows}=g.P79MonthlyRest;
const staff=[
 {empId:'FL01',name:'甲',jobTitle:'F/L',dept:'甲公司'},
 {empId:'FL02',name:'乙',jobTitle:'F/L',dept:'甲公司'},
 {empId:'FL03',name:'丙',jobTitle:'F/L 領班',dept:'甲公司'},
 {empId:'FL04',name:'丁',jobTitle:'F／L',dept:'乙公司'},
 {empId:'FL05',name:'戊',jobTitle:'F/L',dept:'乙公司'},
 {empId:'ARM01',name:'己',jobTitle:'ARMG',dept:'甲公司'}];
const make=(emp,remain,unreported=0,pending=0)=>({
 emp,remaining:{例:remain,休:0,國:0},
 ledger:[...Array.from({length:unreported},()=>({kind:'workedRestUnreported'})),
  ...Array.from({length:pending},()=>({kind:'reportedPendingAttendance'}))]});
const model={
 balances:[make(staff[0],1),make(staff[1],2),make(staff[2],1,1),make(staff[3],1),make(staff[5],1,0,1)],
 unavailable:[{emp:staff[4],reason:'本月班表未排完整'}],
 rows:[{empId:'FL01',status:'可申報',planned:false,saved:false,date:'2026-10-28',category:'國'}]};
const out=rosterReviewRows(model,staff);
assert.equal(out.length,6,'All roster deficits and incomplete roster staff must be shown, not only 1 eligible row');
assert.equal(out.filter(x=>x.isFL).length,5,'All five F/L are present including role variant');
assert.equal(out.some(x=>x.isFL&&x.emp.empId==='FL04'),true,'F/L variants are visible without prioritizing one job over other units');
assert.equal(out.find(x=>x.emp.empId==='FL01').eligible,1,'Only the genuine 8h eligible candidate is counted');
assert.equal(out.find(x=>x.emp.empId==='FL02').eligible,0,'Other F/L remain listed even when not eligible today');
assert.equal(out.find(x=>x.emp.empId==='FL05').missing,true,'Missing roster must be reported instead of treated as zero entitlement');
assert.equal(out.find(x=>x.emp.empId==='FL03').unreported,1,'Roster rest-day worked evidence remains visible');
assert.equal(out.find(x=>x.emp.empId==='ARM01').pending,1,'Pending already filed is not silently hidden');
assert.equal(model.rows.length,1,'Review rows do not create overtime declaration candidates');
assert.equal(rosterReviewRows(model,[staff[1]]).length,1,'Department/job/employee filters may narrow review locally');
assert.equal(rosterReviewRows({balances:[make(staff[0],0)],rows:[],unavailable:[]},staff.slice(0,1)).length,0,'Completed staff are not shown as outstanding');
assert(source.includes("rosters=new Map((snapshot.schedules||[]).map(r=>[id(r.empId),r.schedule]))"),
 'Official schedule snapshot remains the quota source');
assert(source.includes("a.snapshot(loadedMonth,false,false,true)"),'Read fresh schedule and attendance when auditing');
assert(source.includes("q('#mrNeedRows').innerHTML=review.map"),'Roster audit is rendered directly in the dialog');
assert(source.includes("q('#mrNeedSummary').textContent="),'Full roster counts and F/L counts are visible');
assert(source.includes('if(selected.some(r=>r.planned||r.date>today()))'),'No early/future formal overtime');
assert(source.includes('if(attendance.length!==1||!attendance[0].start||!attendance[0].end)'),'Save still requires verified punches');
console.log('PASS monthly-rest: all F/L outstanding and missing rosters visible; formal applications still 8h and readback-gated');
