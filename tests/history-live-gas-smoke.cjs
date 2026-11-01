'use strict';
// No tokens or credentials; must not read private records or perform any mutation.
const {strict:assert}=require('node:assert');
const base='https://script.google.com/macros/s/AKfycbzPD0v8QQol_7cMuMUFGnjHxo-9jFnRLEwoWQhW-n3g5GlbbHnaL7EhRAtcymUcdYOEzg/exec';
async function get(action,params={}){
 const url=new URL(base);url.searchParams.set('action',action);
 for(const [key,val] of Object.entries(params))url.searchParams.set(key,val);
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),30000);
 try {
  const response=await fetch(url.toString(),{redirect:'follow',signal:controller.signal});
  const raw=await response.text();
  let data;try{data=JSON.parse(raw)}catch(e){throw Error(action+': HTTP '+response.status+' returned non-JSON (possible GAS login page)');}
  return {status:response.status,data};
 }finally{clearTimeout(timeout)}
}
(async()=>{
 const health=await get('deploymentCheck');
 assert.equal(health.status,200,'Public deploymentCheck HTTP status');
 assert.equal(health.data.ok,true,'GAS deploymentCheck health');
 console.log('PASS deploymentCheck route online');
 const unknown=await get('p79DefinitelyUnknownHistoryRouteV999');
 assert.equal(unknown.data.ok,false,'Unknown route should be rejected');
 assert.match(String(unknown.data.error||''),/未知操作|unknown|not found|不支援/i);
 for(const action of ['historyGetArchivedModuleMonth','historyGetProvisionalScheduleMonth']){
  const result=await get(action,{type:action==='historyGetArchivedModuleMonth'?'leave':'schedule',month:'2026-10'});
  assert.equal(result.status,200,action+' should respond with JSON');
  assert.equal(result.data.ok,false,'Anonymous history request must never return data');
  const error=String(result.data.error||'');
  assert.ok(error.length>0,'Auth failure must be explicit for '+action);
  assert.ok(!/未知操作|unknown action/i.test(error),action+' route not deployed');
  console.log('PASS '+action+': recognized but anonymous caller denied');
 }
})().catch(error=>{console.error('FAIL '+error.message);process.exitCode=1;});
