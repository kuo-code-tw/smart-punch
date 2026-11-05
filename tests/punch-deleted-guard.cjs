'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const before=fs.readFileSync(process.env.P79_PUNCH_GUARD_SOURCE||'backend/punch-deleted-guard-baseline.gs','utf8'),after=require('../scripts/apply-gas-punch-deleted-guard.cjs').apply(before);
function fn(source,name){const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction ',a+10);return source.slice(a,b<0?undefined:b);}
function setup({source=after,deleted=true,rows=[],originals=[],failClear=false,changed=false}={}){
 const initial={id:'DELETED-IN',type:'IN',status:'上班簽到',timeStr:'2026/11/05 20:13'},incoming={id:'NEW-IN',empId:'E1',attNo:'234',status:'上班簽到',timeStr:'2026/11/05 20:34'};
 let state={...initial},reads=0;const actions=[];
 const main={},ss={getSheetByName:()=>main};
 const c={console:{warn(){}},Date,Number,Infinity,Object,normalizeId_:x=>String(x||''),normalizeText_:x=>String(x||''),
  p79GuardEventMillis_:x=>Date.parse(String(x).replaceAll('/','-').replace(' ','T')+'Z'),
  p79PunchGuardStatusType_:x=>String(x).includes('上班')?'IN':'OUT',p79PunchGuardChannel_:()=> 'REG',p79PunchGuardKey_:()=> 'GUARD',
  p79ReadPunchGuardState_:()=>{reads++;return changed&&reads>1?{...state,id:'NEWER'}:state},
  getDeletedRecordIds_:()=>deleted?{'DELETED-IN':true}:{},attendanceMonthKeyFromTimeStr_:()=> '2026-11',attendanceMonthKeyFromRecord_:()=> '2026-11',attendanceCurrentMonthKey_:()=> '2026-11',SHEET_RECORDS:'main',
  readRecords_:()=>rows,p79MergeProtectedPunchOriginals_:(_,r)=>[...r,...originals],p79GuardSameEmployee_:(a,b)=>a.empId===b.empId,
  p79WritePunchGuardState_:r=>{state={id:r.id,type:c.p79PunchGuardStatusType_(r.status),status:r.status,timeStr:r.timeStr};actions.push('rebuild')},
  PropertiesService:{getScriptProperties:()=>({deleteProperty:()=>{if(failClear)throw Error('storage unavailable');actions.push('property-clear')}})},
  CacheService:{getScriptCache:()=>({remove:()=>{actions.push('cache-clear');state=null}})}};
 vm.createContext(c);for(const name of ['p79CheckDuplicatePunchGuard_','p79RepairStalePunchGuard_'])vm.runInContext(fn(source,name),c);
 return {run:()=>c.p79CheckDuplicatePunchGuard_(incoming,ss),state:()=>state,actions,incoming};
}
function record(id,status,time='19:00',empId='E1'){return{id,empId,status,timeStr:'2026/11/05 '+time};}
let t=setup({source:before});assert.equal(t.run().ok,false,'baseline reproduces deleted 20:13 blocking 20:34');
t=setup();assert.equal(t.run().ok,true);assert.equal(t.state(),null);assert.deepEqual(t.actions,['property-clear','cache-clear']);
t=setup({deleted:false});assert.equal(t.run().ok,false);assert.equal(t.actions.length,0,'valid old IN remains protected');
t=setup({rows:[record('ACTIVE-IN','上班簽到','18:00')]});assert.equal(t.run().ok,false);assert.equal(t.state().id,'ACTIVE-IN','older surviving open IN is not discarded');
t=setup({rows:[record('LAST-OUT','下班簽退','20:10')]});assert.equal(t.run().ok,true);assert.equal(t.state().type,'OUT');
t=setup({originals:[record('PROTECTED-IN','上班簽到','20:20')]});assert.equal(t.run().ok,false);assert.equal(t.state().id,'PROTECTED-IN','accepted original still blocks duplicate even if absent from main');
t=setup({rows:[record('OTHER','上班簽到','20:20','OTHER')]});assert.equal(t.run().ok,true,'other employee cannot determine own state');
t=setup({rows:[record('A','上班簽到','20:20'),record('B','下班簽退','20:20')]});assert.equal(t.run().ok,false);assert.equal(t.actions.length,0,'ambiguous evidence stays protected');
t=setup({rows:[record('FUTURE','下班簽退','20:40')]});assert.equal(t.run().ok,false);assert.equal(t.actions.length,0);
t=setup({changed:true});assert.equal(t.run().ok,false);assert.equal(t.actions.length,0,'newer guard never cleared');
t=setup({failClear:true});assert.equal(t.run().ok,false);assert.equal(t.actions.length,0,'failed cleanup never permits a write');
console.log('PASS deleted guard reproduction and repair, no attendance writes, surviving earlier IN, protected originals, same employee, ambiguous/future/newer evidence and storage failure protections');
