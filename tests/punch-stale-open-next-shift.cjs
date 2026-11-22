'use strict';
// Regression fixture only: no cloud requests, no personal employee data.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const baseline=fs.readFileSync('backend/punch-deleted-guard-baseline.gs','utf8');
const deletedPatched=require('../scripts/apply-gas-punch-deleted-guard.cjs').apply(baseline);
const candidate=require('../scripts/apply-gas-stale-open-checkin.cjs').apply(deletedPatched);
function fn(source,name) {
  const at=source.indexOf('function '+name+'(');
  assert(at>=0,name);
  const end=source.indexOf('\nfunction ',at+10);
  return source.slice(at,end<0?undefined:end);
}
function make({source=candidate,rows,archive=[],now='2026/11/22 07:42',
  old='2026/11/19 15:41',incomingStatus='上班簽到',deleted=false,
  newer=false,badRead=false,missingSheet=false,month='2026-11'}={}) {
  const initial={id:'OLD-IN',empId:'FIXTURE-E1',attNo:'001',
    type:'IN',status:'上班簽到',timeStr:old};
  const next={id:'NEW-IN',empId:'FIXTURE-E1',attNo:'001',
    status:incomingStatus,timeStr:now};
  const records=rows===undefined?[{...initial}]:rows;
  const main={name:'main'},historical={name:'historical'};
  const ss={getSheetByName:()=>missingSheet?null:main};
  let repairs=0,writes=0;
  const context={
    Set,Array,Date,Number,Object,Infinity,console:{warn(){}},
    normalizeId_:v=>String(v||''),normalizeText_:v=>String(v||''),
    p79PunchGuardStatusType_:s=>String(s).includes('上班')?'IN':
      String(s).includes('下班')?'OUT':'',
    p79PunchGuardChannel_:()=> 'REG',
    p79GuardEventMillis_:s=>{
      const iso=String(s||'').replaceAll('/','-').replace(' ','T');
      return Date.parse(iso+'+08:00');
    },
    p79GuardSameEmployee_:(a,b)=>a.empId===b.empId,
    p79ReadPunchGuardState_:()=>newer?{...initial,id:'NEWER'}:initial,
    p79RepairStalePunchGuard_:()=>{repairs++;return false},
    getDeletedRecordIds_:()=>deleted?{'OLD-IN':true}:{},
    readRecords_:sheet=>{
      if(badRead)throw Error('read unavailable');
      return sheet===main?records:archive;
    },
    SHEET_RECORDS:'考勤紀錄',
    attendanceMonthKeyFromTimeStr_:()=>month,
    attendanceCurrentMonthKey_:()=> '2026-11',
    getAttendanceMonthlySheet_:()=>historical
  };
  vm.createContext(context);
  if(source.includes('function p79AllowNextShiftAfterOldOpenIn_('))
    vm.runInContext(fn(source,'p79AllowNextShiftAfterOldOpenIn_'),context);
  vm.runInContext(fn(source,'p79CheckDuplicatePunchGuard_'),context);
  return {check:()=>context.p79CheckDuplicatePunchGuard_(next,ss),
    initial,next,getRepairs:()=>repairs,getWrites:()=>writes};
}
let passed=0;
function test(title,run){run();passed++;console.log('PASS '+title)}
test('baseline reproduces multi-day duplicate block',()=>{
  const t=make({source:deletedPatched});
  assert.equal(t.check().ok,false);
  assert.equal(t.getWrites(),0);
});
test('24+ hour old proven unclosed IN permits later workday IN only',()=>{
  const t=make(),res=t.check();
  assert.equal(res.ok,true);
  assert.equal(res.previousOpenShiftNeedsReview,true);
  assert.equal(res.previousOpenPunchId,'OLD-IN');
  assert.equal(t.getWrites(),0,'repair cannot fabricate OUT or edit the ledger');
});
test('same-day and <24h second IN are still rejected',()=>{
  for(const now of ['2026/11/19 15:42','2026/11/20 15:40']) {
    assert.equal(make({now}).check().ok,false);
  }
});
test('normal last OUT is not reclassified by stale-IN helper',()=>{
  const t=make({incomingStatus:'下班簽退'});
  assert.equal(t.check().ok,true);
});
test('missing, deleted, or mismatched old ledger evidence blocks recovery',()=>{
  assert.equal(make({rows:[]}).check().ok,false);
  assert.equal(make({deleted:true}).check().ok,false);
  assert.equal(make({rows:[{id:'OTHER',empId:'FIXTURE-E1',status:'上班簽到',timeStr:'2026/11/19 15:41'}]}).check().ok,false);
});
test('different employee data never becomes proof for this employee',()=>{
  const t=make({rows:[{id:'OLD-IN',empId:'FIXTURE-E2',status:'上班簽到',timeStr:'2026/11/19 15:41'}]});
  assert.equal(t.check().ok,false);
});
test('later IN, later OUT, or conflicting same-time proof blocks recovery',()=>{
  const old={id:'OLD-IN',empId:'FIXTURE-E1',status:'上班簽到',timeStr:'2026/11/19 15:41'};
  for(const extra of [
    {id:'IN20',empId:'FIXTURE-E1',status:'上班簽到',timeStr:'2026/11/20 07:42'},
    {id:'OUT19',empId:'FIXTURE-E1',status:'下班簽退',timeStr:'2026/11/19 23:45'},
    {id:'COLLISION',empId:'FIXTURE-E1',status:'下班簽退',timeStr:'2026/11/19 15:41'}
  ])assert.equal(make({rows:[old,extra]}).check().ok,false);
});
test('read failures and stale in-memory guard cannot authorize a punch',()=>{
  assert.equal(make({badRead:true}).check().ok,false);
  assert.equal(make({missingSheet:true}).check().ok,false);
  assert.equal(make({newer:true}).check().ok,false);
  assert.equal(make({rows:[{id:'OLD-IN',empId:'FIXTURE-E1',status:'上班簽到',timeStr:'invalid'}]}).check().ok,false);
});
test('previous-month official archive can prove old IN',()=>{
  const old={id:'OLD-IN',empId:'FIXTURE-E1',status:'上班簽到',timeStr:'2026/10/30 15:41'};
  const t=make({old:'2026/10/30 15:41',rows:[],archive:[old],month:'2026-10'});
  assert.equal(t.check().ok,true);
});
test('patch rejects repeated application and unexpected GAS source',()=>{
  assert.throws(()=>require('../scripts/apply-gas-stale-open-checkin.cjs').apply(candidate),/already applied/);
  assert.throws(()=>require('../scripts/apply-gas-stale-open-checkin.cjs').apply('wrong version'),/Expected V100/);
});
console.log(JSON.stringify({passed,failed:0,scope:'synthetic Node VM; not deployed; no GAS or real attendance writes'}));
