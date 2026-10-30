const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(process.env.SCHEDULE_RECEIPT_SOURCE||'schedule/index.html','utf8');
const start=html.indexOf('    async function p79ConfirmScheduleSaveReceipt(');
const end=html.indexOf('\n    // 完整考勤僅可修復',start);
assert(start>=0&&end>start);
const source=html.slice(start,end);
const receipt={ok:true,found:true,completed:true,saveRequestId:'request123',month:'2026-11'};
async function run(steps,options={}){
 let token='session',client='client123',budget=0,calls=0;const waits=[];
 const ctx={URL,AbortController,console:{warn(){}},GAS_URL:'https://example.test/exec',
  currentPort79SsoToken:()=>token,getScheduleClientId:()=>client,
  setTimeout(fn,ms){if(ms>=8000){budget=ms;waits.push(ms);}else queueMicrotask(fn);return 1;},clearTimeout(){},
  async fetch(url,init){
   const u=new URL(url);assert.equal(init.method,'GET');assert.equal(u.searchParams.get('action'),'scheduleGetSaveReceipt');
   assert.equal(u.searchParams.get('saveRequestId'),'request123');assert.equal(u.searchParams.get('scheduleClientId'),'client123');
   const step=steps[Math.min(calls++,steps.length-1)];
   if(step.delay>budget){const e=Error('timeout');e.name='AbortError';throw e;}
   if(step.error)throw Error('network');
   if(step.changeToken)token='different';if(step.changeClient)client='other';
   return {ok:step.status===undefined||step.status===200,status:step.status||200,
    async json(){if(step.invalidJson)throw Error('HTML');return step.data||receipt;}};
  }};
 if(options.noToken)token='';if(options.noClient)client='';
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const result=await ctx.p79ConfirmScheduleSaveReceipt('request123','2026-11');
 return {result,calls,waits};
}
(async()=>{
 let r=await run([{delay:11000}]);assert(r.result,'11-second successful receipt must not be abandoned');assert.equal(r.calls,1);
 r=await run([{status:503,data:{ok:false}},{data:receipt}]);assert(r.result,'temporary 503 must retry');assert.equal(r.calls,2);
 r=await run([{data:{ok:false,error:'busy'}},{data:receipt}]);assert(r.result);assert.equal(r.calls,2);
 r=await run([{invalidJson:true},{error:true},{data:receipt}]);assert(r.result);assert.equal(r.calls,3);
 r=await run([{data:{ok:true,found:false}},{data:receipt}]);assert(r.result);assert.equal(r.calls,2);
 for(const data of [{...receipt,saveRequestId:'other'},{...receipt,month:'2026-10'},{...receipt,completed:false}]){
  r=await run([{data}]);assert.equal(r.result,null);assert.equal(r.calls,4);
 }
 r=await run([{delay:21000}]);assert.equal(r.result,null);assert.equal(r.calls,4);
 r=await run([{status:403,data:{ok:false}}]);assert.equal(r.result,null);assert.equal(r.calls,1);
 for(const change of ['changeToken','changeClient']){r=await run([{[change]:true}]);assert.equal(r.result,null);assert.equal(r.calls,1);}
 for(const missing of ['noToken','noClient']){r=await run([{}],{[missing]:true});assert.equal(r.result,null);assert.equal(r.calls,0);}
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
 console.log('PASS: 14 receipt scenarios, read-only retries, identity guards, bounded timeouts and inline script syntax');
})().catch(error=>{console.error(error);process.exitCode=1;});
