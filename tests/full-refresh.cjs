const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const {createReader,createRunner}=require('../assets/port79-full-refresh.js');
(async()=>{
 let identity='owner|2026-10',calls=[],payload={ok:true,records:[]};const context={identity:()=>identity,gas:()=> 'https://script.google.com/macros/s/TEST/exec',token:()=> 'test-session'};
 const read=createReader({context,identity,assertCurrent(){},fetchImpl:async(url,init)=>{calls.push({url:new URL(url),init});return {ok:true,json:async()=>payload};}});
 await read('gcGetData',{month:'2026-10'});assert.equal(calls.length,1);assert.equal(calls[0].url.searchParams.get('fresh'),'1');assert.equal(calls[0].url.searchParams.get('month'),'2026-10');assert.equal(calls[0].url.searchParams.get('token'),'test-session');assert.equal(calls[0].init.cache,'no-store');assert.equal(calls[0].init.method,'GET');
 for(const bad of [{ok:false,error:'權限不足'},{ok:true,retryable:true},{ok:true,fromCache:true},{}]){payload=bad;await assert.rejects(read('gcGetData'));}
 payload={ok:true};identity='other';await assert.rejects(read('gcGetData'),/登入或查詢範圍/);
 let sent=0;await assert.rejects(createReader({context:{...context,gas:()=> 'https://example.com/exec'},identity,assertCurrent(){},fetchImpl:async()=>{sent++;}})('getData'));assert.equal(sent,0);
 const timeoutReader=createReader({context,identity,assertCurrent(){},timeoutMs:5,fetchImpl:async(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{const e=new Error('timeout');e.name='AbortError';reject(e);} ))});await assert.rejects(timeoutReader('getData'),{name:'AbortError'});
 let resolveRun,runs=0,events=[],fresh=[];const runner=createRunner({check(){},run:()=>{runs++;return new Promise(r=>resolveRun=r);},notify:(state)=>events.push(state),setFresh:v=>fresh.push(v)});const a=runner(),b=runner();assert.equal(a,b);await Promise.resolve();assert.equal(runs,1);resolveRun(true);assert.equal(await a,true);assert.deepEqual(events,['loading','success']);assert.deepEqual(fresh,[true,false]);
 for(const run of [async()=>false,async()=>{throw Error('network');}]){events=[];fresh=[];assert.equal(await createRunner({check(){},run,notify:s=>events.push(s),setFresh:v=>fresh.push(v)})(),false);assert.ok(!events.includes('success'));assert.equal(fresh.at(-1),false);}
 let began=false;assert.equal(await createRunner({check(){throw Error('尚未儲存');},run:async()=>{began=true;return true;}})(),false);assert.equal(began,false);
 for(const page of ['attendance','work-hours','leave','schedule','aqc-efficiency','hr','history-data']){const html=fs.readFileSync(require('path').join(__dirname,'../'+page+'/index.html'),'utf8');assert.match(html,/port79-full-refresh\.js\?v=/);for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/\bsrc=|application\/ld\+json/.test(m[1]))new vm.Script(m[2]);}}
 const cache=fs.readFileSync(require('path').join(__dirname,'../assets/port79-data-cache.js'),'utf8');assert.match(cache,/P79FullRefreshRunning===true/);
 console.log('PASS seven live pages wired; real no-cache authenticated GET reads; rejects stale sessions, cached/error replies and wrong origins; timeout, repeated clicks, pending edits and false success handling');
})().catch(e=>{console.error(e);process.exitCode=1;});
