'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const g={window:null,console,Date,Intl};g.window=g;vm.createContext(g);
vm.runInContext(source,g);
const {reviewAllUnits,rosterReviewRows}=g.P79MonthlyRest;
const employee=(empId,companyName,dept,groupName,jobTitle)=>({empId,name:'測試-'+empId,companyName,dept,groupName,jobTitle});
const staff=[
 employee('S1','公司甲','第一單位','甲組','指揮手'),
 employee('S2','公司甲','第一單位','甲組','AQC'),
 employee('S3','公司甲','第一單位','乙組','ARMG'),
 employee('S4','公司甲','第二單位','甲組','F/L'),
 employee('S5','公司乙','第二單位','乙組','領班'),
 employee('S6','公司乙','第三單位','丙組','F/L'),
 employee('S7','公司乙','第三單位','丙組','AQC'),
 employee('S8','公司乙','第三單位','丁組','指揮手'),
 employee('S9','公司乙','第三單位','戊組','ARMG')
];
const balance=(emp,remaining,ledger=[])=>({emp,remaining:{例:remaining,休:0,國:0},ledger});
const model={
 balances:[
 balance(staff[0],0), // Completed remains in full-unit census
 balance(staff[1],1),
 balance(staff[2],0,[{kind:'workedRestUnreported'}]),
 balance(staff[3],2),
 balance(staff[4],0),
 balance(staff[5],1,[{kind:'reportedPendingAttendance'}]),
 balance(staff[6],0),
 balance(staff[8],0)
 ],
 unavailable:[{emp:staff[7],reason:'10/28 班表未排完整'}],
 rows:[{empId:'S2',saved:false,planned:false},{empId:'S4',saved:false,planned:false},
 {empId:'S4',saved:true,planned:false},{empId:'S5',saved:false,planned:true}]
};
const r=reviewAllUnits(model,staff);
assert.equal(r.staffCount,9,'All nine staff from both companies are audited');
assert.equal(r.groupCount,9,'All company, department, team and job combinations appear');
assert.equal(r.completed,4,'Completed staff are counted instead of omitted');
assert.equal(r.outstanding,4,'Unresolved quota, worked rest and pending declarations are included');
assert.equal(r.missing,1,'Missing group roster still appears and cannot be counted as completed');
assert.equal(r.ready,2,'Only unsaved nonplanned applications qualify for submission');
assert.equal(r.duplicateIds.length,0);
assert.equal(r.groups.filter(x=>x.company==='公司乙').length,5,'Second company not lost');
assert.equal(r.groups.filter(x=>x.role==='F/L').length,2,'F/L is tested alongside every other job');
assert.equal(r.groups.find(x=>x.role==='領班').completed,1,'A fully complete role is still shown');
assert.equal(r.groups.find(x=>x.group==='丁組').missing,1,'Missing schedule is traceable to group');
const open=rosterReviewRows(model,staff);
assert.equal(open.length,5,'Every unresolved and missing roster entry appears in per-person review');
assert.equal(open.find(x=>x.emp.empId==='S3').unreported,1);
assert.equal(open.find(x=>x.emp.empId==='S6').pending,1);
assert.equal(open.find(x=>x.emp.empId==='S8').missing,true);
assert.equal(open.some(x=>x.emp.empId==='S1'),false,'Resolved employee is shown in unit counts, not duplicate unresolved detail');
const subset=staff.filter(x=>x.companyName==='公司乙');
const scoped=reviewAllUnits(model,subset);
assert.equal(scoped.staffCount,5,'Choosing another company filters existing full-month audit locally');
assert.equal(scoped.outstanding,1);
assert.equal(scoped.missing,1);
const duplicate=reviewAllUnits(model,[...staff,staff[0],{...staff[0],empId:''}]);
assert.equal(duplicate.staffCount,9,'Duplicate employee identity is never counted twice');
assert.equal(duplicate.duplicateIds.length,2,'Duplicate or absent employee keys are visibly flagged');
assert(source.includes("q('#mrScopeRows').innerHTML=scope.groups.map"),'Full-unit audit is rendered in the modal');
assert(source.includes("reviewAllUnits(model,loadedPeople)"),'Unfiltered account-wide counts cannot be hidden by a job/person filter');
assert(source.includes('本帳號可檢視的全範圍'),'Scope is stated honestly: account permissions may limit company access');
assert(source.includes("snapshot?.attendanceEvidence?.complete!==true"),'Incomplete raw attendance must not be marked as a successful full audit');
assert(source.includes('if(attendance.length!==1||!attendance[0].start||!attendance[0].end)'),'Formal submission still requires official IN/OUT');
assert.equal(model.rows.length,4,'Read-only audit does not fabricate overtime applications');
console.log('PASS full-scope roster audit: 2 companies / 3 departments / 5 job categories / teams, complete & unresolved, missing & duplicate, no double count or overtime writes');
