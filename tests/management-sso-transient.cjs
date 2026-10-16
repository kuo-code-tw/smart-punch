const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../integration-test/aqc-efficiency/index.html'),'utf8');
const src=fs.readFileSync(path.join(__dirname,'../integration-test/management-link.js'),'utf8');
const core=src.slice(0,src.indexOf('(function(){const path='));
const start=html.indexOf('async function verifyGcSsoToken('),end=html.indexOf('\nasync function consumePort79SsoHandoff',start);assert(start>=0&&end>start);
function setup(data,stage=true){let calls=0;const c={P79ManagementTestMode:stage,Date,JSON,Map,Set,Promise,AbortController,setTimeout:()=>1,clearTimeout(){},getGasUrl:()=> 'https://script.google.com/macros/s/TEST/exec',fetch:async()=>{calls++;return data},readGcSsoJson:async d=>d,efficiencyPermissionFromData:d=>d.systemPermissions?.efficiency||'none'};c.window=c;vm.createContext(c);vm.runInContext(html.slice(start,end),c);vm.runInContext(core,c);return {c,calls:()=>calls}}
let passed=0,failed=0;async function test(name,f){try{await f();passed++;console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+': '+e.message)}}
(async()=>{
await test('known GAS lock contention remains an unconfirmed read, never a logout decision',async()=>{const x=setup({ok:false,error:'雲端正在同步管理員資料，請稍後重試 SSO 驗證'});await assert.rejects(x.c.verifyGcSsoToken('synthetic-token'),e=>e.ssoAuthRejected===false&&e.retryable===true);assert.equal(x.calls(),1)});
await test('expired, stopped and missing accounts remain explicit authorization failures',async()=>{for(const error of ['登入驗證已逾時，請重新登入','登入驗證資料失效，請重新登入','找不到此員工帳號','此帳號目前沒有管理員權限']){const x=setup({ok:false,error});await assert.rejects(x.c.verifyGcSsoToken('synthetic-token'),e=>e.ssoAuthRejected===true);assert.equal(x.calls(),1)}});
await test('unknown backend errors are never converted into successful authentication',async()=>{const x=setup({ok:false,error:'unknown backend error'});await assert.rejects(x.c.verifyGcSsoToken('synthetic-token'));assert.equal(x.calls(),1)});
await test('valid role without efficiency permission still rejects',async()=>{const x=setup({ok:true,adminRole:'admin',systemPermissions:{efficiency:'none'}});await assert.rejects(x.c.verifyGcSsoToken('synthetic-token'),e=>e.ssoAuthRejected===true)});
await test('valid response passes through without another request',async()=>{const x=setup({ok:true,adminRole:'admin',systemPermissions:{efficiency:'view'}});assert.equal((await x.c.verifyGcSsoToken('synthetic-token')).efficiencyAccessLevel,'view');assert.equal(x.calls(),1)});
await test('non-stage page verifier retains existing behavior',async()=>{const x=setup({ok:false,error:'雲端正在同步管理員資料，請稍後重試 SSO 驗證'},false);await assert.rejects(x.c.verifyGcSsoToken('synthetic-token'),e=>e.ssoAuthRejected===true)});
console.log(JSON.stringify({passed,failed,scope:'Actual isolated efficiency verifier with synthetic GAS replies; no real credentials or permission changes'}));process.exitCode=failed?1:0;
})();
