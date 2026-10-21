const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const c={window:null,console,Date,Intl,crypto:{randomUUID:()=> 'fixture'}};c.window=c;vm.createContext(c);
for(const f of ['port79-rest-allocation.js','port79-rest-attendance.js','port79-monthly-rest-overtime.js'])vm.runInContext(fs.readFileSync('assets/'+f,'utf8'),c);
c.p79MonthlyRestContext={employmentStart:()=>''};
const api=c.P79MonthlyRest,json=x=>JSON.parse(JSON.stringify(x)),month='2026-10',dates=Array.from({length:31},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
function fixture(empId='FIXTURE'){
 const schedule={...Object.fromEntries(dates.map(d=>[d,'早'])),__meta:{}};
 const snapshot={attendanceEvidence:{complete:true,days:Object.fromEntries(dates.map(d=>[empId+'|'+d,{state:'worked'}]))}};
 return {emp:{empId,name:'測試'},schedule,snapshot,state:(d,state)=>snapshot.attendanceEvidence.days[empId+'|'+d]={state},balance:()=>api.balance({empId,name:'測試'},schedule,month,snapshot)};
}
// Eight quota rest days + one existing rest-day report = nine consumed days.
// Annual leave is a separate ledger and must not become a tenth quota deduction.
for(const role of ['指揮手','AQC','ARMG','F/L','領班'])for(const source of ['roster','approved','evidence']){
 const t=fixture();t.emp.jobTitle=role;
 for(const n of [2,8,9,15,21,22,28,29]){const d=dates[n-1];t.schedule[d]='休';t.state(d,'rest');}
 t.schedule.__meta[dates[0]]={overtimeReport:{id:'FIXTURE-R',category:'休'}};
 t.state(dates[3],'rest');
 if(source==='roster')t.schedule[dates[3]]='年';
 if(source==='approved')t.snapshot.leaveDates=['FIXTURE|'+dates[3]];
 if(source==='evidence')t.snapshot.attendanceEvidence.days['FIXTURE|'+dates[3]].leave=true;
 const before=JSON.stringify(t.schedule),b=t.balance();
 assert.deepEqual(json(b.off),{例:4,休:4,國:0},role+' '+source+' annual leave must not consume quota');
 assert.deepEqual(json(b.reported),{例:0,休:1,國:0});assert.deepEqual(json(b.remaining),{國:2,休:0,例:0});
 assert.equal(b.ledger.filter(x=>x.kind==='leave').length,1);assert.equal(JSON.stringify(t.schedule),before,'audit is read-only');
 const text=api.auditText({balances:[{emp:t.emp,...b}],rows:[]},t.emp.empId);assert.match(text,/國：應休 2.*未報 2/);assert.match(text,/2026-10-04.*請假/);
}
// Existing report and schedule allocation on the same date count once, including
// missing-punch and future reports. If no cards, the report becomes rest once.
for(const state of ['worked','missing','open','unknown','rest']){
 const t=fixture();for(const d of dates.slice(0,8))t.schedule[d]='休';
 const d=dates[0];t.schedule.__meta[d]={overtimeReport:{id:'FIXTURE-R',category:'休'}};t.state(d,state);
 const b=t.balance(),consumed=Object.values(b.off).reduce((a,b)=>a+b,0)+Object.values(b.reserved).reduce((a,b)=>a+b,0)+Object.values(b.reported).reduce((a,b)=>a+b,0);
 assert.equal(consumed,8,state+' consumes one quota per date');assert.equal(b.ledger.filter(x=>x.date===d).length,1);
 assert.equal(b.reported.休,state==='rest'?0:1);
}
// A new no-card rest cannot use an already reported category a second time.
{const t=fixture();for(const d of dates.slice(0,4))t.schedule.__meta[d]={overtimeReport:{id:'R'+d,category:'例'}};t.state(dates[4],'rest');const b=t.balance();assert.equal(b.off.例,0);assert.equal(b.off.休,1);assert.equal(b.conflicts.length,0);assert.equal(Object.values(b.remaining).reduce((a,b)=>a+b,0),6);}
// Independent totals across every supported month and employee identity: all
// non-leave absences consume the quota once and leave days never leak between people.
for(let m=1;m<=12;m++)for(let rests=0;rests<=12;rests++)for(let reports=0;reports<=2;reports++){
 const mo='2026-'+String(m).padStart(2,'0'),q=c.p79RestQuota(mo),ds=Array.from({length:q.days},(_,i)=>mo+'-'+String(i+1).padStart(2,'0'));
 const r={...Object.fromEntries(ds.map(d=>[d,'早'])),__meta:{}},ev={complete:true,days:{}};
 ds.forEach((d,i)=>ev.days['A|'+d]={state:i<rests?'rest':'worked'});
 r[ds[rests]]='年';ev.days['A|'+ds[rests]]={state:'rest'};
 const cap={...q.counts};for(let i=0;i<rests;i++)for(const cat of ['例','休','國'])if(cap[cat]>0){cap[cat]--;break;}
 let expectedReports=0;for(const d of ds.slice(rests+1,rests+1+reports)){const cat=['國','休','例'].find(cat=>cap[cat]>0);if(cat){r.__meta[d]={overtimeReport:{id:'R'+d,category:cat}};cap[cat]--;expectedReports++;}}
 const b=api.balance({empId:'A',name:'測試'},r,mo,{attendanceEvidence:ev,leaveDates:['OTHER|'+ds[0]]});
 assert.equal(Object.values(b.remaining).reduce((a,b)=>a+b,0),Math.max(0,q.slots.length-rests-expectedReports),mo+' quota conservation');
 assert.equal(b.ledger.filter(x=>x.kind==='leave').length,1);assert.equal(b.conflicts.length,0);
}
// Cloud-approved leave statuses use the same mapping for the main page and modal.
const html=fs.readFileSync('work-hours/index.html','utf8'),start=html.indexOf('        function p79WorkRestLeaveDates('),end=html.indexOf('        function p79BuildWorkRestAttendance(',start);
c.leaveBelongsToEmployee=(l,e)=>l.empId===e.empId;c.toDateInputValue=x=>String(x||'').slice(0,10);vm.runInContext(html.slice(start,end),c);
const records=['已核准','已核準','待審核','已駁回'].map((status,i)=>({empId:'A',status,startDate:dates[i],endDate:dates[i]}));
assert.deepEqual(json(c.p79WorkRestLeaveDates(month,{leaveRecords:records},[{empId:'A'}])),['A|'+dates[0],'A|'+dates[1]]);
// Employment boundaries must restrict both quota slots and allocator input dates.
{const t=fixture();c.p79MonthlyRestContext.employmentStart=()=>dates[9];for(const d of dates.slice(0,9))delete t.schedule[d];for(const d of dates.slice(19))delete t.schedule[d];t.schedule[dates[19]]='離';const b=t.balance(),q=c.p79RestQuota(month).slots.filter(s=>s.sourceDate>=dates[9]&&s.sourceDate<dates[19]);assert.equal(Object.values(b.quota).reduce((a,b)=>a+b,0),q.length);assert.equal(b.dates.length,10);c.p79MonthlyRestContext.employmentStart=()=>'';}
console.log('PASS rest ledger: all roles; annual leave from roster/cloud/evidence; nine deductions leave two days; per-date report deduplication; reported-category capacity; 468 month/count cases; approval statuses; source data preserved');
