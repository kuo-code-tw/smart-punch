'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{apply}=require('../scripts/apply-gas-hr-org-options-fastlane.cjs');
const fixture="function doGet(e){const params=e.parameter,action=params.action;\n  if(action==='getGpsConfig')return null;}\nfunction doPost(e){const parsedData=e,action=e.action;\n  if(action==='gateStatsImport')return null;}\nfunction syncConfig_(data) { return p79GpsSaveConfig_(data); }\nfunction hrReadOrgSettings_(ss) {\n throw Error('sheet read should be skipped');\n}";
const patched=apply(fixture);new vm.Script(patched);
assert(patched.indexOf("action==='hrSaveOrgOptions'")<patched.indexOf("action==='gateStatsImport'"));
assert.throws(()=>apply(patched),/already installed/);
let stored={gps:{radius:100},idle:10},writes=0,locks=0,releases=0,revisions=0,allow=true,busy=false;
const props={getProperty:()=>JSON.stringify(stored),setProperty:(k,v)=>{stored=JSON.parse(v);writes++}};
const c={Object,Array,JSON,String,Error,Utilities:{newBlob:s=>({getBytes:()=>new TextEncoder().encode(s)})},
 SYSTEM_CONFIG_PROPERTY:'config',PropertiesService:{getScriptProperties:()=>props},
 getSpreadsheet_:()=>({}),gcRequireSystemPermission_(){if(!allow)throw Error('權限不足')},gcRequireActionPermission_(){if(!allow)throw Error('權限不足')},
 LockService:{getScriptLock(){throw Error('bulk ScriptLock must never be requested')},getUserLock:()=>({tryLock(){locks++;return !busy},releaseLock(){releases++}})},
 touchSyncRevision_(){revisions++},getSystemConfig_:()=>JSON.parse(JSON.stringify(stored)),
 p79GpsSaveConfig_:data=>{const merged={...stored,...data.config};props.setProperty('config',JSON.stringify(merged));return{ok:true,config:JSON.parse(JSON.stringify(stored))}},jsonOutput:x=>x};
vm.createContext(c);vm.runInContext(patched,c);
// When supplied locally, also exercise the actual private production config implementation without publishing it.
if(process.env.P79_GAS_SOURCE){
 const source=fs.readFileSync(process.env.P79_GAS_SOURCE,'utf8');new vm.Script(source);
 for(const name of ['getSystemConfig_','p79GpsMergeConfig_','p79GpsSaveConfig_']){
  const a=source.indexOf('function '+name+'('),b=source.indexOf('\n}',a)+2;assert(a>=0&&b>a);vm.runInContext(source.slice(a,b),c);
 }
}
const payload={action:'hrSaveOrgOptions',token:'test',settings:{departments:['D'],units:['U'],jobTitles:['AQC','課長','經理']},extendedSettings:{headquarters:['HQ'],divisions:['DIV'],offices:['OFF'],sections:['SEC'],hiddenJobTitles:['課長','經理']}};
let r=c.doPost(payload);assert(r.ok);assert.equal(writes,1);assert.equal(locks,1);assert.equal(releases,1);assert.equal(revisions,1);assert.equal(stored.gps.radius,100);assert.equal(stored.idle,10);assert.equal(r.config.hrOrgOptionsV2.hiddenJobTitles.length,2);assert.equal(r.config.gps,undefined);
assert.deepEqual(JSON.parse(JSON.stringify(c.hrReadOrgSettings_({}))),stored.hrOrgOptionsV1);
r=c.doGet({parameter:{action:'hrGetOrgOptions',token:'test'}});assert(r.ok);assert.equal(r.config.idle,10,'other HR config such as per-employee leave policies remains readable');assert.equal(locks,1,'small reads need no lock');assert.equal(writes,1);
allow=false;r=c.doPost(payload);assert(!r.ok);assert.match(r.error,/權限/);assert.equal(writes,1);assert.equal(locks,1);allow=true;
busy=true;r=c.doPost(payload);assert(!r.ok);assert.equal(r.code,'ORG_CONFIG_BUSY');assert.equal(r.retryable,true);assert.equal(writes,1);busy=false;
for(const invalid of [{...payload,settings:{}},{...payload,extendedSettings:{...payload.extendedSettings,sections:[{}]}}]){r=c.doPost(invalid);assert(!r.ok);assert.equal(writes,1)}
const old=c.syncConfig_;c.syncConfig_=()=>({config:{}});r=c.doPost(payload);assert(!r.ok);assert.match(r.error,/讀回不一致/);assert.equal(revisions,1);c.syncConfig_=old;
c.syncConfig_({config:{idle:20}});assert.equal(stored.idle,20);assert.equal(stored.hrOrgOptionsV2.hiddenJobTitles.length,2);assert.equal(releases,2);
console.log('PASS org fast lane: bulk-lock independence, one verified write, protected config merge, read-only fetch, permission denial, short-lock contention, validation, readback failure and legacy canonical read');
