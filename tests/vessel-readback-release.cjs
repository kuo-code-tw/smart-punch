'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),zlib=require('zlib'),crypto=require('crypto');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
function fn(name){const a=html.indexOf('async function '+name+'('),b=html.indexOf('\n}',a);assert(a>=0&&b>a);return html.slice(a,b+2);}
async function scenario(mode){
 let resolve,reject,timeout,reads=0,states=[];
 const c={console:{warn(){}},Promise,gcToken:'fixture',p79EfficiencyReadbackGeneration:1,p79VesselReadbackJob:null,readQueue:()=>[],restoreVesselDataFromCloud:()=>{reads++;return new Promise((a,b)=>{resolve=a;reject=b;});},setTimeout:f=>{timeout=f;return 1;},clearTimeout(){},p79SetEfficiencySyncLight:s=>states.push(s),setEfficiencySaveState(){},cloudStatus(){}};
 vm.createContext(c);vm.runInContext(fn('p79WaitStrictVesselReadback'),c);
 const task=c.p79WaitStrictVesselReadback();timeout();await assert.rejects(task,e=>e.vesselReadPending===true);assert.equal(reads,1);assert(!states.includes('success'));
 const next=c.p79WaitStrictVesselReadback();assert.equal(reads,1,'repeated clicks share the existing read without another upload/read');
 if(mode==='new-edit')c.p79EfficiencyReadbackGeneration++;
 if(mode==='account')c.gcToken='other';
 if(mode==='failed'){reject(Error('busy'));await assert.rejects(next,/busy/);}else{resolve(true);assert.equal(await next,true);}
 await new Promise(r=>setImmediate(r));
 assert.equal(states.includes('success'),mode==='ok','only confirmed current-account/current-generation data may complete');
 assert.equal(c.p79VesselReadbackJob,null,'completed or failed read always releases job');
}
(async()=>{for(const mode of ['ok','new-edit','account','failed'])await scenario(mode);
 let revision='r1',auth='a1';const values=new Map();
 const blob=b=>({bytes:Buffer.isBuffer(b)?b:Buffer.from(String(b)),getBytes(){return [...this.bytes];},getDataAsString(){return this.bytes.toString('utf8');}});
 const cache={get:k=>values.get(k)||null,getAll:keys=>Object.fromEntries(keys.filter(k=>values.has(k)).map(k=>[k,values.get(k)])),put:(k,v)=>values.set(k,v),putAll:o=>Object.entries(o).forEach(([k,v])=>values.set(k,v))};
 const c={Logger:{log(){}},gcGetRevision_:()=>revision,getEmployeeAuthRevision_:()=>auth,CacheService:{getScriptCache:()=>cache},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(a,s)=>crypto.createHash(a).update(s).digest(),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),base64Encode:b=>Buffer.from(b).toString('base64'),base64Decode:s=>Buffer.from(s,'base64'),newBlob:blob,gzip:b=>blob(zlib.gzipSync(b.bytes)),ungzip:b=>blob(zlib.gunzipSync(b.bytes))}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('backend/vessel-read-snapshot-cache.gs','utf8'),c);
 const key=c.p79VesselSnapshotKey_({month:'2026-11'}),result={ok:true,revision,records:[{id:'fixture'}],shipMasters:[]};
 c.p79VesselSnapshotStore_(key,result);assert.equal(c.p79VesselSnapshotRead_(key).records[0].id,'fixture');
 revision='r2';assert.equal(c.p79VesselSnapshotRead_(key),null,'new write revision rejects old snapshot');revision='r1';auth='a2';assert.equal(c.p79VesselSnapshotRead_(key),null,'permission changes reject old snapshot');auth='a1';
 const part=[...values.keys()].find(k=>k!==key);values.delete(part);assert.equal(c.p79VesselSnapshotRead_(key),null,'partial cache eviction cannot return incomplete data');
 c.p79VesselSnapshotStore_(key,{ok:false,revision});assert.equal(c.p79VesselSnapshotRead_(key),null,'failed reads never create confirmed cache');
 const original="if (action === 'gcGetData') {\n      const ss = getSpreadsheet_(true);\n      gcRequireSystemPermission_(ss, params.gcToken || params.token || '', 'efficiency', 'view');\n      port79AutoMonthlyRollover_(false);\n}\nfunction gcGetDataSafe_(ss, options) {\n  const lock = LockService.getScriptLock();\n  try {\n    return gcGetData_(ss, options || {});\n  }finally{lock.releaseLock();}\n}";
 const patched=require('../scripts/apply-gas-vessel-read-snapshot.cjs').apply(original);assert(!patched.includes('port79AutoMonthlyRollover_(false)'));assert(patched.indexOf('gcRequireSystemPermission_')<patched.indexOf('gcGetDataSafe_'));assert(patched.includes('if (snapshot) return snapshot;'));assert.throws(()=>require('../scripts/apply-gas-vessel-read-snapshot.cjs').apply(patched),/already installed/);
 console.log('PASS 15-second foreground release, exact single-flight background completion, account/edit guards and revision/auth-bound complete snapshot cache');
})().catch(e=>{console.error(e);process.exitCode=1;});
