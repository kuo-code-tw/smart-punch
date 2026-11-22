const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const index = fs.readFileSync('index.html','utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('all inline scripts parse', () => {
 for (const [,attr,script] of index.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!/\bsrc=|type=["'](?:application\/|module)/i.test(attr)) new vm.Script(script);
 }
});

test('yard refresh deduplicates, preserves local data, and rejects late results after account switch',async()=>{
 const status={}, ev={}, renders=[], merges=[], pending=[];
 const session={empId:'A',adminRole:'superadmin'};
 const document={hidden:false,addEventListener:(type,callback)=>ev[type]=callback};
 const context={
  document,navigator:{onLine:true},currentSession:session,token:'T',
  $:()=>status,getToken:()=>context.token,canViewHomeYard:s=>Boolean(s?.adminRole),
  renderHomeYardSummary:s=>renders.push(s.empId),location:{hostname:'app.local'},
  YARD_HOME_STORAGE_PREFIX:'yard_',YARD_HOME_ALLOWED_PREFIX:'allowed_',
  window:{addEventListener:(type,callback)=>ev[type]=callback,setInterval:(callback,delay)=>{ev.interval=callback;assert.equal(delay,60000)},
   Port79YardAccountSync:{sync:account=>new Promise((resolve,reject)=>pending.push({account,resolve,reject})),
    merge:(account,rows)=>merges.push({account,rows})}},
  console:{warn(){}}
 };
 vm.createContext(context);
 vm.runInContext(index.slice(index.indexOf('const HOME_YARD_CLOUD_INTERVAL='),index.indexOf('/* A backup batch')),context);
 ev.pageshow();ev.online();
 assert.equal(pending.length,1);
 pending[0].resolve([{date:'2026-11-22'}]);await tick();
 assert.match(status.textContent,/最後同步/);
 ev.interval();pending[1].reject(new Error('offline'));await tick();
 assert.match(status.textContent,/顯示本機資料.*最後同步/);
 assert.equal(merges.length,1);
 ev.storage({key:'yard_other'});
 const count=renders.length;
 ev.storage({key:'yard_A'});
 assert.equal(renders.length,count+1);
 ev.interval();context.currentSession={empId:'B',adminRole:'superadmin'};context.token='U';
 pending[2].resolve([{date:'2026-11-21'}]);await tick();
 assert.equal(merges.length,1);
 ev.pageshow();assert.equal(pending[3].account,'B');
});

