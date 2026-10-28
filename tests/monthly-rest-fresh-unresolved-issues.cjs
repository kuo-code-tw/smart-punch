'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const workhours=fs.readFileSync('work-hours/index.html','utf8');
new vm.Script(src);
const m='2026-10',day='2026-10-27',days=Array.from({length:31},(_,i)=>m+'-'+String(i+1).padStart(2,'0'));
const roster={...Object.fromEntries(days.map(d=>[d,'早'])),__meta:{[day]:{overtimeReport:{id:'ACTIVE1',category:'休',planned:true}}}};
let evidence='worked';
const context={window:null,p79MonthlyRestContext:{employmentStart:()=>''},
 p79RestQuota:()=>({days:31,slots:[],counts:{例:4,休:4,國:2}}),
 p79AllocateRestMonth:()=>({meta:{}}),
 P79RestAttendance:{state:()=>evidence,isLeaveDay:()=>false},
 P79OvertimeReason:{classify:()=>({exempt:false})},
 P79Overtime:{inferRule:()=>null},Intl,Date,console};
context.window=context;
vm.createContext(context);vm.runInContext(src,context);
const balance=()=>context.P79MonthlyRest.balance({empId:'E1',name:'員工'},roster,m,{attendanceEvidence:{complete:true}});
const good=balance();
assert(!good.conflicts.some(x=>x.reason.includes('原預排旗標')),'confirmed report plus paired attendance needs no stale planned alert');
evidence='missing';
const waiting=balance();
assert(waiting.conflicts.some(x=>x.reason.includes('單邊缺卡')),'genuinely missing attendance must stay visible');
assert(waiting.conflicts.some(x=>x.reason.includes('原預排旗標')),'unverified planned report must stay actionable');
assert(workhours.includes('snapshot:async function(month,rosterOnly=false,reportView=false,forceFresh=false)'),'fresh snapshot supported');
assert(workhours.includes('const shared=!forceFresh&&'),'fresh month fetch must bypass cached roster and punch');
assert(src.includes('a.snapshot(loadedMonth,false,false,true)'),'click to read suggestions uses actual current cloud');
assert(src.includes('pendingIssues.length')&&src.includes('逐人缺額及待核對原因'),'unresolved details moved to expandable audit');
assert(src.includes('model=plan(latest,loadedPeople,loadedMonth,rules)'),'successful saved corrections recompute suggestions immediately');
assert(!src.includes("setStatus('已列出 '+model.rows.length+' 筆建議，請勾選要申報的日期。\\n'"),'old long stale alert must be removed');
console.log('PASS: fresh cloud review hides completed stale flags, keeps actual missing punches, auto refreshes successful submissions');
