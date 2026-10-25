// Special-day and approved-leave cover are independent of statutory rest quotas.
// Accounting sees only real cloud audit evidence, never fabricated amendments/deletions.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const g={
 localStorage:{getItem:k=>k==='p79-manual-typhoon-days-v1'?'["2026-10-23"]':'[]'},
 P79RestAttendance:{reportIssue:()=>'',isLeaveDay:()=>false,state:()=> 'worked'},
 p79MonthlyRestContext:{employmentStart:()=>''}
};
const sandbox={window:g,console};vm.createContext(sandbox);
const load=p=>vm.runInContext(fs.readFileSync(p,'utf8'),sandbox,{filename:p});
load('assets/port79-rest-allocation.js');
Object.assign(g,{p79RestQuota:sandbox.p79RestQuota,p79AllocateRestMonth:sandbox.p79AllocateRestMonth});
for(const file of ['assets/port79-overtime-reason.js','assets/port79-monthly-rest-overtime.js',
 'assets/port79-overtime-status.js','assets/port79-overtime-application.js'])load(file);
const month='2026-10',d=n=>month+'-'+String(n).padStart(2,'0');
const people=['E1','E2','E3','E4','E5'].map((empId,i)=>({empId,
 name:['颱風員工','代班員工','一般超額','已取消','已修改'][i]}));
const data=[
 ['E1',d(23),{overtimeReport:{id:'TY',category:'國',typeName:'颱風日加班',overtimeStart:'08',overtimeEnd:'11',declaredHours:3}},'早'],
 ['E2',d(22),{forEmpId:'LEAVE-1',overtimeReport:{id:'CV',category:'國',typeName:'國定假日加班',overtimeStart:'08',overtimeEnd:'16',declaredHours:8,leaveId:'L1'}},'休'],
 ['E3',d(12),{overtimeReport:{id:'NORMAL',category:'國',typeName:'國定假日加班',overtimeStart:'08',overtimeEnd:'16',declaredHours:8}},'早'],
 ['E4',d(11),{overtimeRevocations:[{confirmed:true,reportId:'CANCEL',
   report:{id:'CANCEL',category:'國',overtimeStart:'08',overtimeEnd:'16',declaredHours:8},
   date:d(11),empId:'E4',actor:'主管甲',at:'2026-10-24',reason:'主管取消'}]},'早'],
 ['E5',d(14),{overtimeReport:{id:'EDIT',category:'延',typeName:'平日加班',
   overtimeStart:'16',overtimeEnd:'20',declaredHours:4,reportedAt:'2026-10-20',modifiedAt:'2026-10-21'}},'早']
];
const snapshot={
 attendanceEvidence:{complete:true,month},
 schedules:data.map(([empId,date,meta,shift])=>({empId,schedule:{[date]:shift,__meta:{[date]:meta}}})),
 leaveCoverAssignments:[{workerIds:['E2'],startDate:d(22),endDate:d(22),leaveEmpId:'LEAVE-1',leaveId:'L1'}],
 approvedLeaves:[{id:'L1',empId:'LEAVE-1',start:d(22),end:d(22),leaveType:'年假'}]
};
const balance=()=>({off:{例:4,休:5,國:2},reserved:{例:0,休:0,國:0},
 quota:{例:4,休:5,國:2},ledger:[]});
const collected=g.P79OvertimeStatus.collect(snapshot,people,month,balance);
const map=Object.fromEntries(collected.rows.map(row=>[row.id,row]));
for(const [id,status] of Object.entries({TY:'reported',CV:'reported',NORMAL:'review',
 CANCEL:'revoked',EDIT:'amended'}))
 assert.equal(g.P79OvertimeStatus.status(map[id]),status,id+' status');
assert.equal(map.TY.exempt,true);
assert.match(map.TY.exemptionNote,/不計例／休／國超額/);
assert.equal(map.CV.exempt,true);
assert.match(map.CV.exemptionNote,/年假人員代班/);
assert.equal(map.NORMAL.exempt,false);
assert.equal(map.NORMAL.excessDays,1);
assert.equal(map.CANCEL.revocation.reason,'主管取消');
assert.equal(map.EDIT.amendment.verified,true);
const csv=g.P79OvertimeStatus.accountingCsv(collected.rows);
for(const item of ['已取消（請勿付款）','主管甲','已修改（依目前有效版本）','颱風天加班','年假代班'])
 assert(csv.includes(item),'missing accounting column '+item);
const app=g.P79OvertimeApplication.collect([snapshot],people,data.map(row=>row[1]),'',[],'all');
const notes=Object.fromEntries(app.rows.map(row=>[row.reportId,row.note]));
assert.match(notes.TY,/颱風天加班/);
assert.match(notes.CV,/年假代班/);
assert(!notes.CANCEL,'revoked record must not reappear in active application');
assert(!Object.values(notes).every(note=>note==='吊櫃作業'),'no hardcoded notes');
const rest=[1,4,7,10,13,16,19,22,23,25,28];
for(let i=0;i<83;i++){
 const id='S'+i,date=i%2?d(22):d(23),mode=i%2?'cover':'typhoon';
 const roster=Object.fromEntries(Array.from({length:31},(_,j)=>[d(j+1),
 rest.includes(j+1)?'休':'早']));
 if(mode==='typhoon')roster[date]='早';
 const meta={restCategory:'國',restQuotaOvertime:true,restAllocationSource:'manual',
  ...(mode==='cover'?{forEmpId:'LEAVE-1'}:{}),
  overtimeReport:{id:'REP-'+id,category:'國',
   typeName:mode==='typhoon'?'颱風日加班':'國定假日加班',
   overtimeStart:'08',overtimeEnd:'16',declaredHours:8}};
 roster.__meta={[date]:meta};
 const states=Object.fromEntries(Array.from({length:31},(_,j)=>
  [id+'|'+d(j+1),roster[d(j+1)]==='休'?'rest':'worked']));
 g.P79RestAttendance.state=(snap,emp,day)=>snap.states[emp+'|'+day]||'worked';
 const b=g.P79MonthlyRest.balance({empId:id,name:id},roster,month,
  {...snapshot,states,leaveCoverAssignments:[{workerIds:[id],leaveEmpId:'LEAVE-1',
     leaveId:'L1',startDate:d(22),endDate:d(22)}]},'');
 assert.equal(b.reported.國,0,'exempt category must never consume 國 for '+id);
 assert.equal(b.ledger.find(row=>row.date===date)?.kind,
  mode==='cover'?'exemptOvertime':'typhoon');
}
console.log('PASS special-day/annual-leave cover, actual quota, original application notes, 5 accounting states, confirmed audit, CSV; 83 workers');
