const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('assets/port79-session-timeout.js','utf8').replace('window.Port79IdleLogout={currentMinutes:', 'window.test={saveUI,request};window.Port79IdleLogout={currentMinutes:');
function setup(handler){
 const data=new Map([['port79_user_token','test'],['port79_user_session',JSON.stringify({adminRole:'superadmin'})]]),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const els={p79IdleSave:{},p79IdleMinutes:{value:'10'},p79IdleStatus:{style:{}}};
 const calls=[],timers=[];const c={window:{},document:{currentScript:{src:'https://example.invalid/assets/port79-session-timeout.js'},readyState:'loading',addEventListener(){},getElementById:k=>els[k]||null},location:{href:'https://example.invalid/hr/',pathname:'/hr/'},sessionStorage:storage,localStorage:storage,URL,AbortController,TextEncoder,Date,console,TypeError,setTimeout:(fn,ms)=>{timers.push({fn,ms});if(ms<60000)queueMicrotask(fn);return timers.length},clearTimeout(){},fetch:async(url,opts)=>{calls.push(opts);return {ok:true,json:async()=>handler(calls.length,opts)}}};
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
 const busy={ok:false,error:'雲端目前正在寫入資料，請稍後自動重試'};
 x=setup(n=>n===1?config(5):n===2?busy:n===3?{ok:true,config:{[field]:5,other:'newer shared value'}}:n===4?{ok:true}:config(10));
 await x.c.window.test.saveUI();
 assert.match(x.els.p79IdleStatus.textContent,/已儲存/);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,2);
 assert.equal(JSON.parse(x.calls[3].body).config.other,'newer shared value');
 x=setup(n=>n===1?busy:n===2?config(5):n===3?{ok:true}:config(10));
 await x.c.window.test.saveUI();
 assert.match(x.els.p79IdleStatus.textContent,/已儲存/);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
 x=setup((n,opts)=>opts.method==='POST'?busy:config(5));
 await x.c.window.test.saveUI();
 assert.doesNotMatch(x.els.p79IdleStatus.textContent,/✅/);
 assert.match(x.els.p79IdleStatus.textContent,/雲端目前正在寫入資料/);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,5);
 assert.equal(x.data.has('port79_idle_logout_config_v1'),false);
 x=setup(n=>n===1?config(5):n===2?busy:config(10));
 await x.c.window.test.saveUI();
 assert.match(x.els.p79IdleStatus.textContent,/已儲存/);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
 console.log('PASS 10 idle settings scenarios: normal save, ambiguous recovery, mismatch, auth, read retry, timeout, transient lock, read lock, persistent lock, verified previous write');
})().catch(e=>{console.error(e);process.exitCode=1});
