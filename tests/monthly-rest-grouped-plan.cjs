const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let seq=0,now='2026-10-25';
const c={window:null,Date,crypto:{randomUUID:()=>String(++seq)},Intl:{DateTimeFormat:function(){return{format:()=>now}}},console};
c.window=c;
c.p79RestQuota=()=>({days:31,slots:[{category:'國',sourceDate:'2026-10-01'},{category:'休',sourceDate:'2026-10-02'},{category:'例',sourceDate:'2026-10-03'}]});
c.p79MonthlyRestContext={employmentStart:()=>''};
c.P79RestAttendance={state:()=> 'worked',isLeaveDay:()=>false};
c.P79Overtime={inferRule:(start,end,date,rules)=>rules.find(r=>r[6]==='08'&&r[7]==='16')||null};
vm.createContext(c);const quotaForTest=c.p79RestQuota;
vm.runInContext(fs.readFileSync('assets/port79-rest-allocation.js','utf8'),c);
c.p79RestQuota=quotaForTest;
vm.runInContext(fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8'),c);
const api=c.P79MonthlyRest,cats=['國','休','例'],rules=cats.map(cat=>[cat,cat+'08-16',8,null,null,null,'08','16']);
const people=[{empId:'A',name:'甲'},{empId:'B',name:'乙'},{empId:'C',name:'丙'}];
function snapshot(){return{
 schedules:people.map(e=>({empId:e.empId,schedule:{...Object.fromEntries(Array.from({length:31},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),'早'])),'2026-10-25':'休',__meta:{}}})),
 pairs:people.flatMap(e=>[25,26,27,28,29,30].map(day=>({empId:e.empId,date:'2026-10-'+day,start:Date.parse('2026-10-'+day+'T08:00:00+08:00'),end:Date.parse('2026-10-'+day+'T08:00:00+08:00')+8*3600000}))),
 leaveDates:[],attendanceEvidence:{complete:true,days:{}}
};}
const s=snapshot();
let plan=api.plan(s,people,'2026-10',rules);
assert.equal(plan.rows.length,3,'only the current completed date appears (one per employee)');
assert(plan.rows.every(r=>r.date==='2026-10-25'&&r.category==='休'&&!r.planned));
assert.equal(new Set(plan.rows.map(r=>r.date)).size,1,'same-category employees share a confirmed date');
assert.equal(plan.plannedRows.length,0,'ordinary future workdays cannot be invented as rest-day overtime');
now='2026-10-28';
plan=api.plan(s,people,'2026-10',rules);
assert.equal(plan.rows.length,3,'each eligible employee may only appear on todays completed date');
assert(plan.rows.every(r=>r.date==='2026-10-25'&&!r.planned),'genuine completed work retains its original date');
assert(!plan.rows.some(r=>r.date>now));
now='2026-10-31';
assert.equal(api.plan(s,people,'2026-10',rules).rows.length,3,'unreported verified original dates remain eligible without inventing a 31st punch');
now='2026-10-25';
const mixed=snapshot();mixed.pairs=mixed.pairs.filter(p=>p.empId==='A'&&p.date==='2026-10-25');
const m=api.plan(mixed,people,'2026-10',rules);
assert.equal(m.rows.length,1);
assert.equal(m.rows[0].empId,'A');
assert.equal(m.rows[0].date,'2026-10-25');
const blocked=snapshot();
blocked.schedules[0].schedule.__meta={'2026-10-25':{overtimeReport:{category:'國',id:'saved'}}};
blocked.leaveDates=['B|2026-10-25'];
blocked.pairs.push({...blocked.pairs.find(p=>p.empId==='C'&&p.date==='2026-10-25')});
const b=api.plan(blocked,people,'2026-10',rules);
assert(!b.rows.some(r=>r.date==='2026-10-25'),'saved, on leave and duplicate attendance may not auto-create new reports');
const reordered=api.sortRows([
 {category:'國',date:'2026-10-21',name:'甲',empId:'A',planned:true},
 {category:'例',date:'2026-10-19',name:'乙',empId:'B',planned:false,status:'可申報'},
 {category:'國',date:'2026-10-26',name:'丙',empId:'C',planned:false,status:'可申報'}
]);assert.deepEqual(Array.from(reordered,r=>r.empId),['B','C','A'],'actual dates are chronological, drafts remain separate');
const permuted=api.plan(s,people.slice().reverse(),'2026-10',rules);
assert.deepEqual(Array.from(permuted.rows,r=>[r.empId,r.date,r.category]),Array.from(api.plan(s,people,'2026-10',rules).rows,r=>[r.empId,r.date,r.category]),'order is independent of employee input');
const empty=snapshot();empty.schedules.forEach(r=>{for(const d of Object.keys(r.schedule))r.schedule[d]='休'});
assert.equal(api.plan(empty,people,'2026-10',rules).rows.length,3,'real completed work on a scheduled rest day remains eligible');
console.log('PASS original-date rest-day attendance, no invented future work, saved/leave/duplicate exclusions and stable employee ordering');

 // Two actual eligible dates for each category in the first cycle, plus
 // matching dates in the next cycle. Spread before exhausting one week.
 now='2026-10-31';
 c.p79RestQuota=()=>({days:31,slots:[
 {category:'例',sourceDate:'2026-10-04'},{category:'例',sourceDate:'2026-10-11'},
 {category:'休',sourceDate:'2026-10-03'},{category:'休',sourceDate:'2026-10-10'}]});
 const worker={empId:'W',name:'週期測試',weeklyCycleStart:'2026-10-04'};
 const schedule={...Object.fromEntries(Array.from({length:31},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),'早'])),__meta:{}};
 const day=n=>'2026-10-'+String(n).padStart(2,'0');
 const assignments=[[4,'例'],[5,'例'],[6,'休'],[7,'休'],[11,'例'],[12,'休']];
 for(const [n,cat] of assignments)schedule[day(n)]=cat;
 const pairs=assignments.map(([n])=>({empId:'W',date:day(n),start:Date.parse(day(n)+'T08:00:00+08:00'),end:Date.parse(day(n)+'T16:00:00+08:00')}));
 const source={schedules:[{empId:'W',schedule}],pairs,leaveDates:[],attendanceEvidence:{complete:true}};
 const before=JSON.stringify(source),balanced=api.plan(source,[worker],'2026-10',rules);
 assert.deepEqual(Array.from(balanced.rows,r=>[r.date,r.category]),[[day(4),'例'],[day(6),'休'],[day(11),'例'],[day(12),'休']],'one each across cycles before duplicate week dates');
 assert.equal(JSON.stringify(source),before,'no modification of official schedule');
 assert.equal(new Set(balanced.rows.map(r=>r.date)).size,4);
 now='2026-10-12';
 schedule[day(18)]='例';schedule[day(19)]='休';
 // Future scheduled holidays with no punches must reserve monthly capacity.
 const protectedPlan=api.plan(source,[worker],'2026-10',rules);
 assert.equal(protectedPlan.balances[0].remaining.例,1);
 assert.equal(protectedPlan.balances[0].remaining.休,1);
 assert.equal(protectedPlan.rows.length,2);
 assert(protectedPlan.rows.every(r=>r.date<=now&&!r.planned));
 console.log('PASS weekly 例/休 distribution, chronological rows, real future rest reservation, monthly capacity and original source preservation');
