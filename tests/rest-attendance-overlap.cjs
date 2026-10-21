const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),c={window:null,Date,Intl};c.window=c;vm.createContext(c);for(const f of ['rest-allocation','rest-attendance','monthly-rest-overtime'])vm.runInContext(fs.readFileSync('assets/port79-'+f+'.js','utf8'),c);c.p79MonthlyRestContext={employmentStart:()=>''};const api=c.P79RestAttendance,ts=s=>Date.parse(s+'+08:00'),now=ts('2026-10-21T10:00:00');
function build(schedule,sessions,month='2026-10'){return api.build({complete:true,month,now,schedules:[{empId:'FIXTURE',schedule}],sessions:sessions.map(s=>({empId:'FIXTURE',...s}))});}
for(const role of ['指揮手','AQC','ARMG','F/L','領班']){
 const dates=Array.from({length:31},(_,i)=>'2026-10-'+String(i+1).padStart(2,'0')),off=new Set([2,8,9,15,21,22,28,29]),schedule={...Object.fromEntries(dates.map((d,i)=>[d,off.has(i+1)?'休':i===3?'年':i>=15&&i<=19?'晚':'早'])),__meta:{'2026-10-01':{overtimeReport:{id:'FIXTURE-CLOUD',category:'休',overtimeStart:'08',overtimeEnd:'16'}}}};
 const sessions=[];for(const d of dates){if(!['早','晚'].includes(schedule[d]))continue;const p=api.period(d,schedule);if(p.end>now)continue;sessions.push({start:d==='2026-10-18'?ts('2026-10-19T05:00:00'):p.start,end:d==='2026-10-18'?ts('2026-10-19T07:45:00'):p.end});}
 const before=JSON.stringify(schedule),e=build(schedule,sessions),b=c.P79MonthlyRest.balance({empId:'FIXTURE',name:'測試',jobTitle:role},schedule,'2026-10',{attendanceEvidence:e});
 assert.equal(e.days['FIXTURE|2026-10-18'].state,'worked',role+' late overnight pair is not no-card rest');assert.equal(e.days['FIXTURE|2026-10-19'].state,'worked','next full shift is not falsely combined with the previous partial shift');
 assert.equal(Object.values(b.unused).reduce((a,b)=>a+b,0),3,'eleven-day quota minus eight scheduled rest days');assert.equal(Object.values(b.remaining).reduce((a,b)=>a+b,0),2,'one stored declaration leaves two pending days');assert(!b.ledger.some(x=>x.date==='2026-10-18'&&x.kind==='off'));assert.equal(JSON.stringify(schedule),before);
}
// After-midnight partial shifts retain the previous accounting date, including month boundaries.
for(const [date,clock,month] of [['2026-10-18','2026-10-19','2026-10'],['2026-09-30','2026-10-01','2026-09']])for(const hour of ['04','05','06','07']){
 const e=build({[date]:'晚',[clock]:'早'},[{start:ts(clock+'T'+hour+':00:00'),end:ts(clock+'T07:45:00')}],month);assert.equal(e.days['FIXTURE|'+date].state,'worked');assert.equal(e.sessionDates[0],date);if(month==='2026-10')assert.equal(e.days['FIXTURE|'+clock].state,'rest','a completed previous shift does not manufacture current-day attendance');
}
for(const [shift,start,end] of [['早','2026-10-18T13:00:00','2026-10-18T15:45:00'],['中','2026-10-18T21:00:00','2026-10-18T23:45:00'],['晚','2026-10-19T05:00:00','2026-10-19T07:45:00']]){
 const schedule={'2026-10-18':shift};assert.equal(build(schedule,[{start:ts(start),end:ts(end)}]).days['FIXTURE|2026-10-18'].state,'worked');for(const s of [{start:ts(start)},{end:ts(end)}])assert.equal(build(schedule,[s]).days['FIXTURE|2026-10-18'].state,'missing','lone late punches remain unresolved instead of rest');
}
// Ambiguous lone punch at 05:00 could be a late night IN or early day IN. Neither is all-no-card.
let e=build({'2026-10-18':'晚','2026-10-19':'早'},[{start:ts('2026-10-19T05:00:00')}]);assert.equal(e.days['FIXTURE|2026-10-18'].state,'missing');assert.equal(e.days['FIXTURE|2026-10-19'].state,'missing');
e=build({'2026-10-18':'晚','2026-10-19':'早'},[]);assert.equal(e.days['FIXTURE|2026-10-18'].state,'rest','truly absent shift still counts as rest');
e=build({'2026-10-18':'晚'},[{start:ts('2026-10-19T08:00:00'),end:ts('2026-10-19T10:00:00')}]);assert.equal(e.days['FIXTURE|2026-10-18'].state,'rest','boundary touch without positive overlap is not attendance');
console.log('PASS shift overlap: late partial shifts for all roles, 3 unused vs 2 pending, adjacent full shifts, month boundaries, all shifts, ambiguous single punches, true absence and no-overlap boundary');
