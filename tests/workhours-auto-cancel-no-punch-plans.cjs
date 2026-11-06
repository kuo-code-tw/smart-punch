'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const auto=require('../assets/port79-workhours-no-punch-autocancel.js');
const reconcile=require('../assets/port79-planned-rest-reconciliation.js');
const page=fs.readFileSync('work-hours/index.html','utf8');
const date='2026-11-05',month='2026-11',emp='E1',reportId='P-AUTO-11-05',token='TEST-TOKEN';
const baseMeta={reportOriginalShift:'休',restCategory:'休',overtime:true,
 overtimeReport:{id:reportId,planned:true,category:'休',code:'休24-08',
  overtimeStart:'24',overtimeEnd:'08',declaredHours:8}};
const makeRoster=()=>({empId:emp,schedule:{[date]:'晚',__meta:{[date]:structuredClone(baseMeta)}}});
const makeEvidence=(status='rest')=>({complete:true,days:{
 [emp+'|'+date]:{state:status,shiftEnd:Date.parse('2026-11-06T08:00:00+08:00')}}});
const makeState=()=>({token,ready:true,pending:false,rows:[makeRoster()],covers:[],leaveRecords:[],
 attendanceEvidence:makeEvidence(),restEvidencePending:false,restEvidenceError:''});
const makeRow=()=>({empId:emp,name:'陳韋陞',dateKey:date,rosterDate:date,monthKey:month,
 reportVerified:true,planned:true,clockIn:null,clockOut:null,
 overtimeReport:{...structuredClone(baseMeta.overtimeReport),attendanceState:'rest'}});
const list=(rows,st)=>auto.candidates(rows,{token,today:'2026-11-06',stateFor:m=>m===month?st:null,
 isVerified:()=>true,canManage:true,reconcile});
let st=makeState(),row=makeRow();
assert.equal(list([row],st).length,1,'11/05 休24-08 no-card planned report is eligible');
assert.equal(list([row,row],st)[0].targets.length,1,'duplicate main/planned ledger rows deduplicate by ID');
for(const [label,mutator] of [
 ['not officially filed',r=>r.reportVerified=false],
 ['not planned',r=>{r.planned=false;r.overtimeReport.planned=false}],
 ['not checked as absent',r=>r.overtimeReport.attendanceState='unknown'],
 ['has a punch',r=>r.clockIn={id:'IN'}],
 ['not a cloud report',r=>r.overtimeReport.id=''],
 ['wrong report id',r=>r.overtimeReport.id='NEW-ID']
]){
 const candidate=makeRow();mutator(candidate);assert.equal(list([candidate],st).length,0,label);
}
st=makeState();st.attendanceEvidence=makeEvidence('missing');
assert.equal(list([row],st).length,0,'single punch never auto deletes');
st=makeState();st.attendanceEvidence=makeEvidence('worked');
assert.equal(list([row],st).length,0,'overnight punched work must be protected');
st=makeState();st.attendanceEvidence.complete=false;
assert.equal(list([row],st).length,0,'incomplete cross-day read cannot auto delete');
st=makeState();st.restEvidencePending=true;
assert.equal(list([row],st).length,0,'pending absence review cannot auto delete');
st=makeState();st.rows[0].schedule.__meta[date].overtimeReport.approvedAt='2026-11-05';
assert.equal(list([row],st).length,0,'approved report needs manager review');
st=makeState();st.rows[0].schedule.__meta[date].forEmpId='LEAVER';
assert.equal(list([row],st).length,0,'substitute-linked report protected');
st=makeState();st.covers=[{startDate:date,endDate:date,workerIds:[emp],leaveEmpId:'LEAVER'}];
assert.equal(list([row],st).length,0,'official cover protects both workers');
st=makeState();st.leaveRecords=[{status:'已核准',empId:emp,startDate:date,endDate:date}];
assert.equal(list([row],st).length,0,'approved leave link protected');
st=makeState();st.rows[0].schedule.__meta[date].reportOriginalShift='早';
assert.equal(list([row],st).length,0,'original workday is not silently converted to rest');
assert.equal(auto.candidates([row],{token,today:date,canManage:true,stateFor:()=>makeState(),isVerified:()=>true,reconcile}).length,0,'current day 11/05 not auto cancelled');
assert.equal(auto.candidates([row],{token,today:'2026-11-06',canManage:false,stateFor:()=>makeState(),isVerified:()=>true,reconcile}).length,0,'manager permission required');

async function runScenario({version=true,canConfirm=true,replace=false,changeToken=false,approved=false}={}){
 let cloud=[makeRoster()],revision='S:L:E:2026-11',posted=0,reads=0,commits=0,failures=[],activeToken=token;
 let state=makeState();
 if(approved){cloud[0].schedule.__meta[date].overtimeReport.approvedAt='2026-11-05';}
 const fetch=async(url,opts={})=>{
  if(opts.method==='POST'){
   posted++;
   const payload=JSON.parse(opts.body);
   assert.equal(payload.action,'confirmAttendanceDayAndReconcile');
   assert.equal(payload.expectedRevision,revision);
   assert.equal(payload.date,date);
   assert.match(payload.requestId,/^ATTCONF-/);
   const plan=reconcile.plan({rows:cloud,date,today:'2026-11-06',
     now:'2026-11-06T11:00:00+08:00',confirmed:true,actor:'ADMIN',evidence:makeEvidence()});
   cloud=plan.rows;revision='S2:L:E:2026-11';
   return{ok:true,json:async()=>({ok:true,plannedRestAttendanceVersion:1,date,
    cancelled:plan.cancelled,results:plan.results,schedules:cloud})};
  }
  reads++;
  if(replace&&reads===1)cloud[0].schedule.__meta[date].overtimeReport.id='REPLACED';
  if(changeToken&&reads===1)activeToken='OTHER';
  return{ok:true,json:async()=>({ok:true,revision,plannedRestAttendanceVersion:version?1:0,
   plannedRestAttendanceCanConfirm:canConfirm,schedules:structuredClone(cloud),
   leaveCoverAssignments:[],leaveRecords:[]})};
 };
 const runner=auto.create({
  token:()=>activeToken,canManage:()=>true,isEditing:()=>false,stateFor:m=>m===month?state:null,
  isVerified:()=>true,reconcile,gasUrl:()=> 'https://example.invalid/exec',
  fetch,now:()=>new Date('2026-11-06T11:18:00+08:00'),requestId:()=> '12345678-1234',
  onCommitted:async (item,receipt,readback)=>{commits++;state.rows=readback.schedules;
   assert.equal(item.date,date);assert.equal(receipt.cancelled,1);},
  onFailure:msg=>failures.push(msg)
 });
 runner.offer([makeRow()]);
 await runner.flush();
 runner.offer([makeRow()]);
 await runner.flush();
 return{posted,reads,commits,failures,state,cloud,status:runner.status()};
}
(async()=>{
 let a=await runScenario();
 assert.equal(a.posted,1,'background confirmation posted exactly once, never loops');
 assert.equal(a.commits,1,'only verified readback of deletion updates active ledger');
 assert.equal(a.cloud[0].schedule[date],'休','restores original rest day');
 assert.equal(a.cloud[0].schedule.__meta[date].overtimeReport,undefined,'removes live saved report');
 assert.equal(a.cloud[0].schedule.__meta[date].plannedRestResolution.report.id,reportId,'audit copy retained');
 assert.equal(a.failures.length,0);
 a=await runScenario({version:false});assert.equal(a.posted,0,'no server support, no risky fallback delete');assert.equal(a.commits,0);
 a=await runScenario({canConfirm:false});assert.equal(a.posted,0,'server denies permission safely');
 a=await runScenario({replace:true});assert.equal(a.posted,0,'replacement report ID is protected');
 a=await runScenario({changeToken:true});assert.equal(a.posted,0,'logout or identity change blocks old request');
 a=await runScenario({approved:true});assert.equal(a.commits,0,'approved report stays in cloud despite local stale candidate');assert.equal(a.cloud[0].schedule.__meta[date].overtimeReport.id,reportId);
 assert(page.includes('port79-workhours-no-punch-autocancel.js?v=20261106-workhours-no-punch-v1'));
 assert(page.includes('p79WorkNoPunchAutoCancel?.offer(allOvertimeRows)'),'main overtime ledger triggers automatic confirmation');
 assert(page.includes('state.rows=readback.schedules'),'only read-back formal server roster updates active view');
 assert(page.includes('const allOvertimeRows=')&&page.includes('p79OvertimeMainLedgerRows'),'existing main ledger remains wired');
 // All inline scripts must remain syntactically valid after the integration.
 for(const m of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))
  if(!/\bsrc=|application\/json|importmap/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
 console.log('PASS auto-cancel 11/05 unworked saved 休24-08: server proof & readback, idempotence, preview/linked/approved/current-day protection, no delete on permissions or revisions, valid page scripts');
})().catch(e=>{console.error(e);process.exit(1)});
