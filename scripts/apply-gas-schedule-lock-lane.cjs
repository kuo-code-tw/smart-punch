'use strict';const fs=require('fs');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Unexpected production fragment '+a.slice(0,60));return s.replace(a,b);}
function apply(source){
 let s=once(source,"const API_VERSION = '2026.11.05.V96-LEAVE-LOCK-RETRY';","const API_VERSION = '2026.11.05.V97-SHORT-EDIT-LOCK';");
 for(const name of ['scheduleAcquireEditLock_','scheduleHeartbeatEditLock_','scheduleReleaseEditLock_','scheduleForceAcquireEditLock_','scheduleForceReleaseEditLock_']){
  const a=s.indexOf('function '+name+'('),b=s.indexOf('\n}',a)+2;if(a<0||b<2)throw Error(name);
  const fn=once(s.slice(a,b),'const atomic = LockService.getScriptLock();','// Deployment executes as the fixed owner, so UserLock is shared by all web clients.\n  // This short lock is independent of long ScriptLock data reads/writes.\n  const atomic = LockService.getUserLock();');s=s.slice(0,a)+fn+s.slice(b);
 }
 const a=s.indexOf('function scheduleRenewEditLockForWriteUnderScriptLock_('),b=s.indexOf('\n}',a)+2,fn=s.slice(a,b);
 const body=fn.slice(fn.indexOf('{')+1,fn.lastIndexOf('}'));
 s=s.slice(0,a)+fn.slice(0,fn.indexOf('{')+1)+"\n  // Lock order is always ScriptLock then the short owner-scoped edit lock.\n  const editAtomic=LockService.getUserLock();\n  if(!editAtomic.tryLock(5000))throw new Error('排班編輯權正在確認，班表尚未寫入，請稍後重試');\n  try {"+body+"\n  } finally { editAtomic.releaseLock(); }\n}"+s.slice(b);
 // Revision keyed snapshots remain invalidated by every leave and employee mutation.
 const ga=s.indexOf('function getLeaveData_('),gb=s.indexOf('\n}',ga)+2;let getter=s.slice(ga,gb);
 getter=once(getter,'lock.tryLock(1500)','lock.tryLock(5000)');
 s=s.slice(0,ga)+getter+s.slice(gb);
 return s;
}
module.exports={apply};if(require.main===module){const [input,output]=process.argv.slice(2);fs.writeFileSync(output,apply(fs.readFileSync(input,'utf8')));}
