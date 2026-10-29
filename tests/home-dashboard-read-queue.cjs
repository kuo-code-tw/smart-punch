const assert=require('node:assert/strict');const {readSnapshots}=require('../assets/port79-home-analytics.js');
(async()=>{
 let release,active=0,max=0;const calls=[],results=[],errors=[];const signal=new AbortController().signal;
 const job=(key,run)=>({key,run:async()=>{calls.push(key);active++;max=Math.max(max,active);try{return await run();}finally{active--;}}});
 const work=readSnapshots([job('roster',()=>new Promise(r=>release=r)),job('failed',()=>Promise.reject(Error('busy'))),job('vessel',()=>Promise.resolve('ships'))],{signal,onResult:(k,v)=>results.push([k,v]),onError:(k,e)=>errors.push([k,e.message])});
 await Promise.resolve();assert.deepEqual(calls,['roster'],'do not start a competing GAS lock request');release('employees');await work;assert.equal(max,1);assert.deepEqual(results,[['roster','employees'],['vessel','ships']]);assert.deepEqual(errors,[['failed','busy']],'a failed source must not prevent unrelated results');
 const abort=new AbortController();let later=false,published=false;await readSnapshots([{key:'first',run:async()=>{abort.abort();return 'stale';}},{key:'next',run:async()=>{later=true;}}],{signal:abort.signal,onResult:()=>published=true});assert.equal(later,false,'logout or replacement refresh stops subsequent reads');assert.equal(published,false,'do not publish a stale response');console.log('PASS dashboard reads serialize GAS locks, preserve partial successes and stop on abort');
})().catch(e=>{console.error(e);process.exitCode=1;});
