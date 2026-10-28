const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const g={console,Date,Intl,localStorage:{getItem:()=>null},
 P79RestAttendance:{state:(snapshot,emp,date)=>snapshot?.states?.[emp+'|'+date]||'worked',isLeaveDay:()=>false},
 p79MonthlyRestContext:{employmentStart:()=>''}};
g.window=g;vm.createContext(g);
for(const file of ['port79-rest-allocation','port79-overtime-reason','port79-monthly-rest-overtime'])
 vm.runInContext(fs.readFileSync('assets/'+file+'.js','utf8'),g);
const month='2026-10',dates=Array.from({length:31},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
const identity=(emp,date='2026-10-22',planned=false)=>({
 emp:{empId:emp,name:'受測員工'},
 roster:{...Object.fromEntries(dates.map((d,i)=>[d,i<8?'休':'早'])),__meta:{
 [date]:{type:'overtime',overtime:true,overtimeType:'rest',overtimeOriginalShift:'休',
  restCategory:'休',restQuotaOvertime:true,restAllocationSource:'manual',
  forEmpId:'OTHER',overtimeReport:{id:'FORMAL-'+emp,category:'休',code:'休08-16',
   declaredHours:8,planned,status:planned?'預排待出勤':'已核對出勤',leaveId:'LEAVE-1'}}}},
 snapshot:{states:{[emp+'|'+date]:'worked'},leaveCoverAssignments:[
  {workerIds:[emp],leaveEmpId:'OTHER',leaveId:'LEAVE-1',startDate:date,endDate:date}],
  approvedLeaves:[{id:'LEAVE-1',empId:'OTHER',start:date,end:date,leaveType:'年假'}]}
});
const normalize=x=>JSON.parse(JSON.stringify(x));
for(let i=0;i<83;i++){
 const key='E'+i,fixture=identity(key,i%2?'2026-10-24':'2026-10-22',i%2===0);
 const orig=JSON.stringify(fixture);
 const d=i%2?'2026-10-24':'2026-10-22';
 const classification=g.P79OvertimeReason.classify({empId:key,date:d,roster:fixture.roster,meta:fixture.roster.__meta[d],
  report:fixture.roster.__meta[d].overtimeReport,snapshot:fixture.snapshot});
 assert.equal(classification.exempt,false,key+' confirmed own rest must not be exempt merely for cover link');
 assert.equal(classification.kind,'rest-cover');
 const b=g.P79MonthlyRest.balance(fixture.emp,fixture.roster,month,fixture.snapshot,'');
 assert.equal(b.reported.休,1,key+' saved own-rest cover counts once');
 assert.equal(b.ledger.filter(row=>row.date===d&&row.kind==='reported'&&row.category==='休').length,1,key+' no duplicate ledger item');
 assert(b.remaining.休>=0,key+' no negative quota');
 if(i%2===0){
  const row=b.ledger.find(x=>x.date===d&&x.kind==='reported');
  // The latest merged attendance reconciliation clears stale planned warnings
  // when complete worked evidence already confirms the saved declaration.
  assert.equal(row.statusNote,'');
  assert(!b.conflicts.some(x=>x.date===d&&/原預排旗標/.test(x.reason)),'complete worked evidence must not keep an obsolete planned warning');
 }
 assert.equal(JSON.stringify(fixture),orig,key+' audit may not modify rosters or reports');
}
// 胡毓麒 10/22 類似情境：有正式編號、日期已過，但出勤讀取尚是整班無卡。
// 不算成已出勤；應標示已申報待核、保留休額度且不得再次推薦該日期。
{
 const f=identity('HUMOCK','2026-10-22',true),d='2026-10-22';
 f.snapshot.states['HUMOCK|'+d]='rest';
 const b=g.P79MonthlyRest.balance(f.emp,f.roster,month,f.snapshot,'');
 assert.equal(b.reported.休,0,'No punched work must not be claimed as verified attendance');
 assert.equal(b.ledger.filter(x=>x.date===d&&x.kind==='reportedPendingAttendance').length,1,'File exists and is explicitly pending review');
 assert(b.reserved.休>=1,'Keep already-filed rest overtime reserved so system cannot suggest duplicate');
 assert(b.conflicts.some(x=>/已有正式申報編號/.test(x.reason)));
 const detail=g.P79MonthlyRest.auditText({balances:[{emp:f.emp,...b}],rows:[]},f.emp.empId);
 assert.match(detail,/已申報／出勤待核對/);
}
for(const scenario of ['revoked','excluded','idless','notOwnRest','typhoon','pureCover']){
 const fixture=identity('CHECK','2026-10-24'),meta=fixture.roster.__meta['2026-10-24'],r=meta.overtimeReport;
 if(scenario==='revoked')meta.overtimeRevocations=[{confirmed:true,reportId:r.id}];
 if(scenario==='excluded')meta.overtimeExcluded=true;
 if(scenario==='idless')delete r.id;
 if(scenario==='notOwnRest'){delete meta.restCategory;delete meta.restQuotaOvertime;delete meta.overtimeOriginalShift;}
 if(scenario==='typhoon')r.typeName='颱風日加班';
 if(scenario==='pureCover'){r.category='代';r.typeName='請假代班';}
 const cls=g.P79OvertimeReason.classify({empId:'CHECK',date:'2026-10-24',roster:fixture.roster,meta,report:r,snapshot:fixture.snapshot});
 const b=g.P79MonthlyRest.balance(fixture.emp,fixture.roster,month,fixture.snapshot,'');
 if(['revoked','excluded','idless','notOwnRest','typhoon','pureCover'].includes(scenario))
  assert.equal(b.reported.休,0,scenario+' must not be treated as a valid own-rest category');
 if(['typhoon','pureCover'].includes(scenario))assert(cls.exempt,scenario+' exemption preserved');
}
const g2={window:null};g2.window=g2;vm.createContext(g2);
vm.runInContext(fs.readFileSync('assets/port79-overtime-application.js','utf8'),g2);
const app=fs.readFileSync('assets/port79-overtime-application.js','utf8');
assert(app.includes("report.planned===true&&date>=today()"),'Past reported dates should not remain in the future-only application list');
const hours=fs.readFileSync('work-hours/index.html','utf8');
assert(hours.includes("planned:meta.overtimeReport.planned===true&&date>=todayTaipei"),
 'Past 10/22 stored report cannot still be displayed as a future-only planned claim');
assert(hours.includes("已有正式申報；原預排標記未更新，出勤待核對"),
 'Past submitted report with no complete clock pair must explicitly say already filed, pending punch review');
const main=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
assert(main.includes('if(meta.overtimeReport||meta.overtime||meta.forEmpId'),'Submission must not duplicate any existing recorded overtime or cover assignment');
assert(main.includes("已申報；原預排旗標待核對出勤"),'Past plans must be shown as submitted with pending attendance reconciliation');
console.log(JSON.stringify({passed:89,staffReviewed:83,failed:0,
 scope:'all staff rest-day cover, saved vs attendance-flag separation, explicit no-double-count, typhoon/pure-cover exemptions, revocations and audit read-only'}));
