'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
let now='2026-10-28',id=0;
const g={window:null,console,Date,crypto:{randomUUID:()=> 'Q'+(++id)},Intl:{DateTimeFormat:function(){return{format:()=>now}}}};g.window=g;
g.p79RestQuota=()=>({days:31,slots:[
 {sourceDate:'2026-10-04',category:'例'},
 {sourceDate:'2026-10-03',category:'休'},
 {sourceDate:'2026-10-11',category:'例'},
 {sourceDate:'2026-10-10',category:'休'},
 {sourceDate:'2026-10-18',category:'例'},
 {sourceDate:'2026-10-17',category:'休'},
 {sourceDate:'2026-10-25',category:'例'},
 {sourceDate:'2026-10-31',category:'休'}]});
g.p79AllocateRestMonth=()=>({meta:{}});
g.p79MonthlyRestContext={employmentStart:()=>''};
g.P79RestAttendance={state:(s,e,d)=>s.attendanceEvidence?.days?.[e+'|'+d]?.state||'unknown',isLeaveDay:()=>false};
g.P79Overtime={inferRule:(start,end,date,rows)=>rows.find(x=>x[6]==='08'&&x[7]==='16')||null};
vm.createContext(g);vm.runInContext(source,g);
const api=g.P79MonthlyRest;
assert.equal(api.monthEndWindowDate('2026-10','2026-10-28'),'2026-10-28','opening on 25th must not backfill earlier completed days');
assert.equal(api.monthEndWindowDate('2026-10','2026-10-29'),'2026-10-29','next-day opening advances automatically');
assert.equal(api.monthEndWindowDate('2026-10','2026-10-24'),'2026-10-24','future drafts start today even before formal submission opens');
assert.equal(api.monthEndWindowDate('2026-09','2026-10-28'),'2026-09-01','explicit prior-month review retains its separate accounting');
const dates=Array.from({length:31},(_,i)=>'2026-10-'+String(i+1).padStart(2,'0'));
const roster=Object.fromEntries(dates.map(d=>[d,'早']));roster.__meta={};
for(const d of ['2026-10-04','2026-10-11','2026-10-18','2026-10-25'])roster[d]='例';
for(const d of ['2026-10-03','2026-10-10','2026-10-17','2026-10-24','2026-10-31'])roster[d]='休';
assert.equal(api.weeklyRestReview(roster,'2026-10').length,0,'reference weeks include a rest and regular rest');
const broken={...roster,'2026-10-31':'早'};
assert(api.weeklyRestReview(broken,'2026-10').some(w=>w.start==='2026-10-25'&&w.rest===0),'missing weekly rest must be highlighted');
assert.equal(api.futureWeekRestProtected(roster,'2026-10-29'),true,'future provisional date only if one 例 and one 休 are reserved');
assert.equal(api.futureWeekRestProtected(broken,'2026-10-29'),false,'future plan must not consume week with missing rest');
const emp={empId:'A',name:'員工'},start=d=>Date.parse(d+'T08:00:00+08:00');
const pair=(d,h)=>({empId:'A',date:d,start:start(d),end:start(d)+h*3600000});
const snapshot={schedules:[{empId:'A',schedule:roster}],pairs:[
 pair('2026-10-01',8),pair('2026-10-24',8),pair('2026-10-26',8),pair('2026-10-27',7)],
 leaveDates:[],attendanceEvidence:{complete:true,days:Object.fromEntries(dates.map(d=>['A|'+d,{state:d>'2026-10-28'?'open':'worked'}]))}};
const rules=['國','休','例'].map(cat=>[cat,cat+'08-16',8,8,'','','08','16','full']);
const plan=api.plan(snapshot,[emp],'2026-10',rules);
assert(plan.rows.every(r=>r.date<=now&&!r.planned),'formal candidates must retain actual completed dates');
assert(!plan.rows.some(r=>r.date==='2026-10-26'),'completed Oct 26 should not be redisplayed after prior reports');
assert(!plan.rows.some(r=>r.date==='2026-10-27'),'short work cannot be counted as 8 hours');
assert(plan.plannedRows.every(r=>r.planned&&r.date>'2026-10-28'),'future plans are separate and never counted');
assert(!plan.rows.some(r=>plan.plannedRows.some(p=>p.id===r.id)),'no leaked planning ID');
assert(!plan.plannedRows.some(r=>['2026-10-25','2026-10-31'].includes(r.date)),'regular/rest days never auto-converted to virtual overtime');
assert(source.includes("const selected=visibleRows().map(({r})=>r).filter(r=>r.checked&&!r.saved&&!r.planned)"),'save only processes verified rows');
assert(source.includes("min=\"'+loadedMonth+'-01'"),'manual date edit permits original dates within the selected month');
// Manual-mode read-only preview: a formally marked future working day,
 // an established week cycle, remaining quota and a matching 8h rule.
const future=JSON.parse(JSON.stringify(snapshot));
future.schedules[0].schedule['2026-10-29']='中';
future.schedules[0].schedule.__meta['2026-10-29']={restCategory:'休',restQuotaOvertime:true};
g.p79RestQuota=()=>({days:31,slots:[{sourceDate:'2026-10-03',category:'休'},{sourceDate:'2026-10-10',category:'休'},{sourceDate:'2026-10-17',category:'休'},{sourceDate:'2026-10-24',category:'休'},{sourceDate:'2026-10-31',category:'休'},{sourceDate:'2026-10-30',category:'休'},{sourceDate:'2026-10-04',category:'例'},{sourceDate:'2026-10-11',category:'例'},{sourceDate:'2026-10-18',category:'例'},{sourceDate:'2026-10-25',category:'例'}]});
const worker={...emp,weeklyCycleStart:'2026-10-25'};
const futureRules=[...rules,['休','休16-24',8,8,'','','16','24','full']];
const before=JSON.stringify(future);
const manual=api.plan(future,[worker],'2026-10',futureRules,{manualOnly:true});
assert.equal(manual.plannedRows.length,0,'opening manual mode creates no draft');
assert(manual.previewRows.some(r=>r.date==='2026-10-29'&&r.rule[1]==='休16-24'&&r.previewOnly),'official future shift is visible as a read-only suggestion');
const hint=api.personPeriodSuggestions(manual,'A',now);
assert(hint.suggestions.some(r=>r.date==='2026-10-29'&&r.period==='休16-24'&&r.planned));
assert.equal(JSON.stringify(future),before);
const unconfirmed=api.plan(future,[emp],'2026-10',futureRules,{manualOnly:true});
assert.equal(unconfirmed.previewRows.length,0,'missing cycle must not yield a recommended future shift');
assert.match(api.personPeriodSuggestions(unconfirmed,'A',now).reason,/未設定約定七日週期|未找到符合/);
const manualFuture=JSON.parse(JSON.stringify(future));
manualFuture.schedules[0].schedule['2026-10-30']='休';
const restRule=futureRules.find(r=>r[0]==='休');
assert.match(api.manualRestPlanIssue(manualFuture,worker,'2026-10','2026-10-29',restRule,now),/原班表假別不符/);
assert.match(api.manualRestPlanIssue(manualFuture,worker,'2026-10','2026-10-27',restRule,now),/今天至月底/);
assert.match(api.manualRestPlanIssue(manualFuture,worker,'2026-10','2026-10-30',rules.find(r=>r[0]==='例'),now),/例假/);
assert.match(api.manualRestPlanIssue(manualFuture,emp,'2026-10','2026-10-30',restRule,now),/已有打卡|未設定/);
manualFuture.pairs=manualFuture.pairs.filter(p=>p.date!=='2026-10-30');
assert.equal(api.manualRestPlanIssue(manualFuture,worker,'2026-10','2026-10-30',restRule,now),'');
assert.match(api.manualRestPlanIssue({...manualFuture,attendanceEvidence:{complete:false}},worker,'2026-10','2026-10-30',restRule,now),/尚未完整/);
// A normal working roster without overtime tags still provides an honest
// planning reference, but must NOT create an actual or saved overtime row.
const ordinary=JSON.parse(JSON.stringify(future));
ordinary.schedules[0].schedule.__meta={};
ordinary.schedules[0].schedule['2026-10-29']='中';
ordinary.schedules[0].schedule['2026-10-30']='中';
const originalOrdinary=JSON.stringify(ordinary);
const ordinaryModel=api.plan(ordinary,[emp],'2026-10',futureRules,{manualOnly:true});
const refHint=api.personPeriodSuggestions(ordinaryModel,'A',now);
assert(refHint.suggestions.some(r=>r.referenceOnly&&r.date==='2026-10-29'&&r.period==='16:00 – 24:00'&&!r.eligible&&r.note.includes('原排正常班')));
assert.equal(ordinaryModel.plannedRows.length,0);
assert.equal(ordinaryModel.previewRows.length,0);
assert.equal(JSON.stringify(ordinary),originalOrdinary);
assert(!api.rosterPeriodReferences({...ordinary,attendanceEvidence:{complete:false}},emp,ordinaryModel.balances[0],'2026-10',futureRules,now).length);
console.log('PASS forward-only month-end reporting, separate future planning, protected rest-day schedule and weekly rest audit');
