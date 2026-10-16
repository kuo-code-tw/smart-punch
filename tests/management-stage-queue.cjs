const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const stage=fs.readFileSync(path.join(__dirname,'../integration-test/aqc-efficiency/index.html'),'utf8');
const production=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const queueCode=stage.slice(stage.indexOf('let p79EfficiencyDbPromise='),stage.indexOf('function recordIdentityKey('));
const storeLine=stage.match(/const STORE=\{[^\n]+/)[0];
const pending=JSON.stringify([{id:'synthetic-production-pending',action:'gcSaveData'}]);
const values=new Map([['gc_queue_v1',pending],['gc_queue_storage_v2','indexeddb']]);
const touched=[],opened=[];
const context={console,JSON,Array,Promise,queueMicrotask,STORE:undefined,
localStorage:{getItem(key){touched.push(['get',key]);return values.get(key)||null},setItem(key,value){touched.push(['set',key]);values.set(key,value)},removeItem(key){touched.push(['remove',key]);values.delete(key)}},
indexedDB:{open(name){opened.push(name);const req={result:{}};queueMicrotask(()=>req.onsuccess());return req;}}};
vm.createContext(context);vm.runInContext(storeLine+'\n'+queueCode,context);
(async()=>{
  await context.p79EfficiencyOpenDb();
  assert.deepEqual(opened,['port79_efficiency_management_test_durable_v1']);
  let imported;
  context.p79EfficiencyDbReadQueue=async legacy=>{imported=JSON.parse(JSON.stringify(legacy));return legacy};
  await context.ensureGcQueueReady();
  assert.deepEqual(imported,[]);
  assert.equal(values.get('gc_queue_v1'),pending);
  assert.equal(values.get('gc_queue_storage_v2'),'indexeddb');
  assert(touched.every(([,key])=>key.startsWith('gc_management_test_queue')));
  assert(production.includes("queue:'gc_queue_v1'"));
  assert(production.includes("indexedDB.open('port79_efficiency_durable_v1',1)"));
  console.log('PASS isolated queue never reads, imports or removes production pending operations; production database name retained');
})().catch(error=>{console.error(error);process.exitCode=1});
