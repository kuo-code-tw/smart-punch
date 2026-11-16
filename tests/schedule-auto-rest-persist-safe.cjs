'use strict';
// Regression: safe monthly 例／休／國 changes are persisted only during an
// authorized cloud-backed save; neither formal data nor the original roster
// may be modified. Check all personnel rather than one named person.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('schedule/index.html','utf8');
const allocation=fs.readFileSync('assets/port79-rest-allocation.js','utf8');
const {p79AllocateRestMonth}=Function(allocation+
 ';return {p79AllocateRestMonth};')();
const begin=html.indexOf('    function p79ApplyAutomaticRestMetadata() {');
const end=html.indexOf('\n    }',begin);
assert(begin>=0&&end>begin,'automatic save classifier exists');
const isolated=html.slice(begin,end+6);
const month='2026-11',date=n=>month+'-'+String(n).padStart(2,'0');
const people=Array.from({length:86},(_,i)=>({id:'E'+(i+1)}));
const oneRoster=()=>{
 const value=Object.fromEntries(Array.from({length:30},(_,i)=>
  [date(i+1),'中']));
 for(const n of [1,4,5,11,12,13,18,19,25])value[date(n)]='休';
 value[date(14)]='國';return value;
};
const roster=Object.fromEntries(people.map(emp=>[emp.id,oneRoster()]));
roster.E86={[date(1)]:'休'}; // Partial cloud month must be skipped.
const meta=Object.fromEntries(people.map(emp=>[emp.id,{}]));
meta.E1={
 [date(14)]:{p79AutoRestQuotaOverflow:true,note:'old history'},
 [date(4)]:{restCategory:'休',restCategoryLocked:true,note:'manual lock'},
 [date(1)]:{overtimeReport:{id:'CLOUD-1',category:'休',code:'休08-16'},note:'approved overtime'},
 [date(12)]:{note:'approved leave'}
};
meta.E86={[date(1)]:{note:'incomplete, unchanged'}};
const savedRoster=JSON.stringify(roster);
let lock=false,official=false,savedMonth=month,mutations=0,warnings=0;
const mocks={
 document:{getElementById:()=>({value:savedMonth})},
 scheduleEditLockState:{get mine(){return lock;}},
 p79ScheduleHasOfficialData:()=>official,
 p79RestAutomaticPlan:(emp,m,previous)=>p79AllocateRestMonth(
  roster[emp.id],previous,m,emp.id==='E1'?[date(12)]:[]),
 employees:people,monthlyScheduleData:roster,monthlyScheduleMeta:meta,
 p79EmployeeDateEligible:()=>true,
 approvedLeaveForEmployee:(id,d)=>id==='E1'&&d===date(12),
 p79LeaveCoverOnDay:()=>[],
 p79MarkScheduleLocalMutation:()=>{mutations++;},
 console:{warn:()=>{warnings++;}}
};
const apply=Function('mocks','with(mocks){'+isolated+
 '\nreturn p79ApplyAutomaticRestMetadata;}')(mocks);
assert.equal(apply(),false,'cannot change cloud without edit lock');
lock=true;assert.equal(apply(),false,'cannot write from unverified local copy');
official=true;savedMonth='2026-10';
assert.equal(apply(),false,'October is under a mandatory bulk-write freeze');
savedMonth=month;
assert.equal(apply(),true,'verified November classification is saved once');
assert.equal(mutations,1);
assert.equal(meta.E1[date(14)].restCategory,'例','old 國 converted into legal 例');
assert.equal(meta.E1[date(14)].note,'old history','other metadata survives');
assert.equal(meta.E1[date(4)].restCategory,'休','locked day stays 休');
assert.equal(meta.E1[date(4)].note,'manual lock');
assert.equal(meta.E1[date(1)].overtimeReport.id,'CLOUD-1','formal overtime unchanged');
assert.equal(meta.E1[date(12)].note,'approved leave','approved leave unchanged');
assert.deepEqual(meta.E86,{[date(1)]:{note:'incomplete, unchanged'}},
 'a person without a full roster is not rewritten');
assert.equal(Object.values(meta).filter(person=>
 person[date(14)]?.restCategory==='例').length,85,
 'every safely loaded employee was classified automatically');
assert.equal(JSON.stringify(roster),savedRoster,'not a single formal shift was edited');
assert.equal(apply(),false,'same data is stable on repeated saves');
assert.equal(mutations,1,'no redundant cloud-dirty event after reload');
assert(warnings>=1,'incomplete month is surfaced for audit');
console.log('PASS automatic statutory rest persists for all 85 complete rosters, preserves cloud shifts, formal overtime, leave, locks and October freeze; compact save is idempotent');
