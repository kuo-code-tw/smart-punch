const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('assets/port79-session-timeout.js','utf8').replace('window.Port79IdleLogout={currentMinutes:', 'window.test={saveUI,request};window.Port79IdleLogout={currentMinutes:');
function setup(handler){
 const data=new Map([['port79_user_token','test'],['port79_user_session',JSON.stringify({adminRole:'superadmin'})]]),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const els={p79IdleSave:{},p79IdleMinutes:{value:'10'},p79IdleStatus:{style:{}}};
 const calls=[],timers=[];const c={window:{},document:{currentScript:{src:'https://example.invalid/assets/port79-session-timeout.js'},readyState:'loading',addEventListener(){},getElementById:k=>els[k]||null},location:{href:'https://example.invalid/hr/',pathname:'/hr/'},sessionStorage:storage,localStorage:storage,URL,AbortController,TextEncoder,Date,console,TypeError,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimeout(){},fetch:async(url,opts)=>{calls.push(opts);return {ok:true,json:async()=>handler(calls.length,opts)}}};
 vm.createContext(c);vm.runInContext(source,c);return {c,els,calls,timers,data};
}
const field='p79_hr_idle_logout_minutes_v1',config=n=>({ok:true,config:{[field]:n,other:'preserved'}});
(async()=>{
 let x=setup(n=>n===1?config(5):n===2?{ok:true}:config(10));await x.c.window.test.saveUI();assert.match(x.els.p79IdleStatus.textContent,/已儲存/);assert.equal(JSON.parse(x.calls[1].body).config.other,'preserved');assert(x.timers.every(t=>t.ms===60000));
 x=setup(n=>{if(n===2)throw new TypeError('network');return config(n===1?5:10)});await x.c.window.test.saveUI();assert.match(x.els.p79IdleStatus.textContent,/已儲存/);assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
 x=setup(n=>{if(n===2)throw new TypeError('network');return config(5)});await x.c.window.test.saveUI();assert.doesNotMatch(x.els.p79IdleStatus.textContent,/✅/);assert.equal(x.data.has('port79_idle_logout_config_v1'),false);
 x=setup(n=>n===1?config(5):{ok:false,error:'登入已過期'});await x.c.window.test.saveUI();assert.match(x.els.p79IdleStatus.textContent,/登入已過期/);assert.equal(x.calls.length,2);
 x=setup(n=>{if(n===1)throw new TypeError('network');return n===2?config(5):n===3?{ok:true}:config(10)});await x.c.window.test.saveUI();assert.match(x.els.p79IdleStatus.textContent,/已儲存/);assert.notEqual(x.calls[0].signal,x.calls[1].signal);
 x=setup(()=>({ok:true}));x.c.fetch=(url,opts)=>new Promise((r,j)=>opts.signal.addEventListener('abort',()=>{const e=Error('signal is aborted without reason');e.name='AbortError';j(e)}));const p=x.c.window.test.request('https://example.invalid');x.timers[0].fn();await assert.rejects(p,/60 秒/);
 console.log('PASS 6 idle settings scenarios: normal save, ambiguous write recovery, mismatch, auth, read retry, explicit timeout');
})().catch(e=>{console.error(e);process.exitCode=1});
