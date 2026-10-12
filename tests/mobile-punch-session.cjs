const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
const source=html.slice(html.indexOf('        const p79MobileOfficial ='),html.indexOf('        // On actual GAS acknowledgment'));
function setup(replies,options={}){
 const emp={empId:'E450',attNo:'450',name:'員工'},state=new Map([['port79_user_token',options.missing?'':'OLD'],['port79_user_session',JSON.stringify({empId:'E450',adminRole:options.role||'employee'})]]),calls=[];
 const c={currentEmp:emp,console:{warn(){}},Date,Promise,encodeURIComponent,window:{},sessionStorage:{getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,v)},getActiveGasUrl:()=> 'https://script.google.com/macros/s/A/exec',getAttendanceTimestamp:r=>Date.parse(r.timeStr),updateHomeClockInButtonState(){},fetchGasJsonWithRetry:async(url,label,attempts,timeout)=>{calls.push({url,label,attempts,timeout});const r=replies.shift();if(r instanceof Error)throw r;return typeof r==='function'?r(c):r;}};
 vm.createContext(c);vm.runInContext(source,c);return{c,state,calls,refresh:()=>c.p79MobileRefreshOfficial(true)};
}
const month=new Date().toISOString().slice(0,7),ok={ok:true,month,records:[{id:'IN1',empId:'E450',timeStr:'2026/10/12 07:00',status:'上班簽到'},{id:'OTHER',empId:'OTHER'}]},renew={ok:true,empId:'E450',punchOnly:true,adminRole:'employee',userToken:'NEW'};
let passed=0;async function test(name,run){await run();passed++;console.log('PASS '+name)}
(async()=>{
await test('expired token renews same employee then requires successful authoritative read',async()=>{const x=setup([{ok:false,error:'登入驗證已逾時，請重新登入'},renew,ok]);assert(await x.refresh());assert.equal(x.state.get('port79_user_token'),'NEW');assert.equal(x.calls.length,3);assert(x.calls[2].url.includes('token=NEW'));assert.equal(x.c.window.p79MobileLatestOfficialPunch.recordId,'IN1');assert.equal(x.calls[0].timeout,45000)});
await test('missing token verifies employee before requesting attendance',async()=>{const x=setup([renew,ok],{missing:true});assert(await x.refresh());assert(x.calls[0].url.includes('action=verifyUser'));assert.equal(x.calls.length,2)});
await test('management session is never silently renewed',async()=>{const x=setup([{ok:false,error:'登入驗證已逾時，請重新登入'}],{role:'admin'});assert.equal(await x.refresh(),false);assert.equal(x.calls.length,1);assert.equal(x.state.get('port79_user_token'),'OLD')});
await test('wrong employee and elevated renewal response never update token',async()=>{for(const patch of [{empId:'OTHER'},{adminRole:'admin'},{punchOnly:false}]){const x=setup([{...renew,...patch}],{missing:true});assert.equal(await x.refresh(),false);assert.equal(x.state.get('port79_user_token'),'');assert.equal(x.calls.length,1)}});
await test('server rejects inactive employee without attendance read or write',async()=>{const x=setup([{ok:false,error:'登入驗證已逾時，請重新登入'},{ok:false,error:'此帳號已離職'}]);assert.equal(await x.refresh(),false);assert.equal(x.calls.length,2);assert(x.c.window.p79MobileOfficialReadError.includes('離職'))});
await test('network timeout exposes reason and never renews credentials',async()=>{const e=Error('aborted');e.name='AbortError';const x=setup([e]);assert.equal(await x.refresh(),false);assert.equal(x.calls.length,1);assert(x.c.window.p79MobileOfficialReadError.includes('逾時'))});
await test('permission failure does not invoke renewal',async()=>{const x=setup([{ok:false,error:'沒有考勤查看權限'}]);assert.equal(await x.refresh(),false);assert.equal(x.calls.length,1)});
await test('renewed credential cannot turn failed readback into success',async()=>{const x=setup([{ok:false,error:'登入驗證已逾時，請重新登入'},renew,{ok:false,error:'登入驗證已逾時，請重新登入'}]);assert.equal(await x.refresh(),false);assert.equal(x.calls.length,3);assert(!x.c.window.p79MobileLatestOfficialPunch)});
await test('concurrent refresh shares one read and renewal',async()=>{let finish;const x=setup([()=>new Promise(r=>finish=r),renew,ok]);const a=x.refresh(),b=x.refresh();finish({ok:false,error:'登入驗證已逾時，請重新登入'});assert(await a);assert(await b);assert.equal(x.calls.length,3)});
await test('account change during renewal cannot install another employee token',async()=>{const x=setup([c=>{c.currentEmp={empId:'OTHER'};return renew}],{missing:true});assert.equal(await x.refresh(),false);assert.equal(x.state.get('port79_user_token'),'')});
await test('wrong month readback is not authoritative',async()=>{const x=setup([{...ok,month:'2000-01'}]);assert.equal(await x.refresh(),false);assert(!x.c.window.p79MobileLatestOfficialPunch)});
await test('successful retry clears previous error',async()=>{const x=setup([Error('offline'),ok]);assert.equal(await x.refresh(),false);assert(await x.refresh());assert.equal(x.c.window.p79MobileOfficialReadError,'')});
console.log(JSON.stringify({passed,failed:0,scope:'simulated network; no production punches'}));
})().catch(e=>{console.error(e);process.exitCode=1});
