'use strict';
const a=require('node:assert/strict'),vm=require('node:vm'),{apply}=require('../scripts/apply-gas-backup-lock-wait.cjs');
// A busy main-data lock must not reject an already verified immutable snapshot.
const source=`function p79AllBackupGroup_(data){
  var ss=getSpreadsheet_(true),session=p79HistoryBackupSession_(ss,data.gcToken||data.token||'');if(!data.requestId)throw Error('missing request');
  var lock=LockService.getScriptLock(),saved=fixture.saved,hash=fixture.hash,priorComplete=fixture.complete;
  if(!lock.tryLock(1000))throw Error('其他資料正在儲存，請重試此分類');
  try{fixture.created++;}finally{lock.releaseLock();}
  if(!lock.tryLock(1000))throw Error('備份檔已寫入但完成紀錄尚未取得，請稍後重試');
  lock.releaseLock();return {verified:true};
}
function unrelated(){return 'unchanged';}`;
const patched=apply(source);a.throws(()=>apply(patched),/fragment/);
function setup(code){const waits=[],fixture={saved:{hash:'same',backupId:'verified-file'},hash:'same',complete:true,created:0};let available=false,authorized=true;const c={fixture,getSpreadsheet_:()=>({}),p79HistoryBackupSession_:()=>{if(!authorized)throw Error('permission denied');return {empId:'fixture'};},LockService:{getScriptLock:()=>({tryLock:n=>{waits.push(n);return available;},releaseLock(){}})}};vm.createContext(c);vm.runInContext(code,c);return {c,fixture,waits,available:x=>available=x,authorized:x=>authorized=x};}
let t=setup(source);a.throws(()=>t.c.p79AllBackupGroup_({requestId:'fixture-request'}),/其他資料/);
t=setup(patched);let r=t.c.p79AllBackupGroup_({requestId:'fixture-request'});a.equal(r.unchanged,true);a.equal(r.requestId,'fixture-request');a.equal(t.waits.length,0);a.equal(t.fixture.created,0);
t.fixture.complete=false;a.throws(()=>t.c.p79AllBackupGroup_({requestId:'fixture-request'}),/其他資料/);a.deepEqual(t.waits,[10000]);a.equal(t.fixture.created,0,'busy refusal occurs before creating a file');
t.available(true);r=t.c.p79AllBackupGroup_({requestId:'fixture-request'});a.equal(r.verified,true);a.deepEqual(t.waits,[10000,10000,30000]);a.equal(t.fixture.created,1);
t.authorized(false);a.throws(()=>t.c.p79AllBackupGroup_({requestId:'fixture-request'}),/permission/);a.equal(t.fixture.created,1);a.equal(t.c.unrelated(),'unchanged');
console.log('PASS busy-lock regression: verified reuse avoids locks, new snapshots wait, pre-write refusal creates no file, final receipt waits, authorization preserved');
