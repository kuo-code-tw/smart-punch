'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
let current='2026-10-28',seq=0;
const c={window:null,console,Date,crypto:{randomUUID:()=>String(++seq)},
 Intl:{DateTimeFormat:function(){return{format:()=>current}}}};
c.window=c;
c.p79RestQuota=()=>({days:31,slots:[
 {category:'休',sourceDate:'2026-10-02'},
 {category:'國',sourceDate:'2026-10-03'},
 {category:'例',sourceDate:'2026-10-04'}]});
c.p79AllocateRestMonth=()=>({meta:{}});
c.p79MonthlyRestContext={employmentStart:()=>''};
c.P79Overtime={inferRule:(_start,_end,_date,allowed)=>allowed[0]||null};
c.P79RestAttendance={state:(snap,emp,date)=>snap?.attendanceEvidence?.days?.[emp+'|'+date]?.state||'unknown',isLeaveDay:()=>false};
vm.createContext(c);vm.runInContext(source,c);
const api=c.P79MonthlyRest;
const rule=(cat,a,b,h)=>[cat,cat+a+'-'+b,h,8,'','',a,b,'full'];
assert(api.fullDayRule(rule('休','08','16',8)));
assert(api.fullDayRule(rule('休','24','08',8)),'overnight 8-hour shift');
assert(!api.fullDayRule(rule('休','08','14',6)),'six-hour work cannot report a leave day');
assert(!api.fullDayRule(rule('國','08','14',8)),'eight declared hours with only six-hour period must be refused');
assert(!api.fullDayRule(rule('休','08','18',10)),'ten-hour rule cannot be misreported as eight-hour leave day');
const at=d=>Date.parse(d+'T08:00:00+08:00');
const pair=(d,h,net)=>({empId:'E1',date:d,start:at(d),end:at(d)+h*3600000,
 ...(net==null?{}:{workedMinutes:net})});
const days=Array.from({length:31},(_,i)=>'2026-10-'+String(i+1).padStart(2,'0'));
const roster=Object.fromEntries(days.map(d=>[d,'早']));
roster['2026-10-26']='休';
roster.__meta={'2026-10-23':{overtimeReport:{id:'REPORT-23',category:'休',code:'休08-16'}}};
const evidence={complete:true,days:Object.fromEntries(days.map(d=>['E1|'+d,{state:'worked'}]))};
evidence.days['E1|2026-10-26'].state='rest';
const p8=pair('2026-10-24',8),p7=pair('2026-10-22',7);
assert(api.fullDayEvidence({attendanceEvidence:evidence},'E1','2026-10-24',p8));
assert(!api.fullDayEvidence({attendanceEvidence:evidence},'E1','2026-10-22',p7));
assert(!api.fullDayEvidence({attendanceEvidence:evidence},'E1','2026-10-25',pair('2026-10-25',9,420)),'net actual working minutes exclude rest');
assert(!api.fullDayEvidence({},'E1','2026-10-24',p8),'incomplete cloud evidence must fail closed');
assert(!api.fullDayEvidence({attendanceEvidence:evidence},'E1','2026-10-26',pair('2026-10-26',8)),'no actual work on rest day');
const snapshot={schedules:[{empId:'E1',schedule:roster}],
 pairs:[pair('2026-10-21',8),p7,p8,pair('2026-10-25',9,420),pair('2026-10-27',8),pair('2026-10-30',8)],
 attendanceEvidence:evidence,leaveDates:[]};
const rules=['國','休','例'].map(cat=>rule(cat,'08','16',8));
assert.equal(api.latestReportedDate(roster,'2026-10'),'2026-10-23');
let plan=api.plan(snapshot,[{empId:'E1',name:'測試員工'}],'2026-10',rules);
const result=Array.from(plan.rows,r=>r.date).sort();
assert.deepEqual(result,['2026-10-24','2026-10-27'],'only full worked eight-hour dates after the last submitted date; no future, short, unworked or rested dates');
assert(plan.rows.every(r=>!r.planned&&r.rule[2]===8));
assert(source.includes('if(selected.some(r=>!fullDayRule(r.rule)))'),'no confirm override for short hours');
assert(source.includes('if(!fullDayEvidence(fresh,r.empId,r.date,attendance[0]))'),'save rechecks fresh official attendance');
assert(source.includes('r.date<=latestReportedDate(roster,loadedMonth)'),'save forbids backfill before latest formal report');
assert(source.includes('if(meta.overtimeReport||meta.overtime||meta.forEmpId||meta.coverAssignmentId'),'existing formal report is never replaced');
assert(!source.includes('確定仍要申報嗎？'),'remove old short-hour bypass');
current='2026-10-24';plan=api.plan(snapshot,[{empId:'E1',name:'測試員工'}],'2026-10',rules);
assert.equal(plan.workflow.canSubmit,false,'before 25th preview is read-only');
assert(plan.rows.every(r=>r.date<='2026-10-24'),'preview also cannot contain future work');
current='2026-10-25';assert.equal(api.workflowStage('2026-10').canSubmit,true);
console.log('PASS monthly rest strict 8h: actual punch, no rest or short hours, no past backfill, before/after 25th, revalidated save');
