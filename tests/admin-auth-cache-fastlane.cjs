'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync('backend/admin-auth-cache-fastlane.gs','utf8');
let raw,revision='current',locks=0,coreCalls=0;
const c={CacheService:{getScriptCache:()=>({get:()=>raw})},GC_TOKEN_PREFIX:'fixture_',normalizeEmpId_:v=>String(v||'').trim(),getEmployeeAuthRevision_:()=>revision,LockService:{getScriptLock:()=>({tryLock(){locks++;return false;},releaseLock(){}})},adminRequireTokenCore_(){coreCalls++;return null;}};
vm.createContext(c);vm.runInContext(code,c);
const original="function adminRequireToken_(ss, token) {\n  const lock = LockService.getScriptLock();\n  if (!lock.tryLock(10000)) throw Error('busy');\n  return adminRequireTokenCore_(ss,token);\n}\nfunction gcRequireSuperAdmin_(ss, token) {\n  const lock = LockService.getScriptLock();\n  if (!lock.tryLock(10000)) throw Error('busy');\n  return adminRequireTokenCore_(ss,token);\n}";
const patched=require('../scripts/apply-gas-admin-auth-fastlane.cjs').apply(original);new vm.Script(patched);vm.runInContext(patched,c);
const fixture={empId:'FIXTURE',adminRole:'superadmin',authRevision:'current',systemPermissions:{efficiency:'manage'}};
raw=JSON.stringify(fixture);assert.equal(c.adminRequireToken_({},'token').empId,'FIXTURE');assert.equal(c.gcRequireSuperAdmin_({},'token').empId,'FIXTURE');assert.equal(locks,0,'unrelated write lock cannot block already verified sessions');assert.equal(coreCalls,0);
for(const value of [null,'bad json',JSON.stringify({...fixture,authRevision:'old'}),JSON.stringify({...fixture,punchOnly:true}),JSON.stringify({...fixture,empId:''}),JSON.stringify({...fixture,adminRole:'employee'})]){raw=value;assert.throws(()=>c.adminRequireToken_({},'token'),/busy/,'unconfirmed session retains original guarded path');}
raw=JSON.stringify({...fixture,adminRole:'admin'});assert.equal(c.adminRequireToken_({},'token').adminRole,'admin');assert.throws(()=>c.gcRequireSuperAdmin_({},'token'),/busy/,'admin cannot gain superadmin access');
raw=JSON.stringify(fixture);revision='changed';assert.throws(()=>c.adminRequireToken_({},'token'),/busy/,'permission revision change requires authoritative refresh');
assert.throws(()=>require('../scripts/apply-gas-admin-auth-fastlane.cjs').apply(patched),/already installed/);
console.log('PASS admin auth under active data lock: existing current sessions pass; missing, invalid, changed and insufficient sessions retain original authorization path');
