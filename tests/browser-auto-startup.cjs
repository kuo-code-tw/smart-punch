'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('assets/port79-data-cache.js','utf8'),auto=fs.readFileSync('assets/port79-browser-auto-start.js','utf8'),ui=fs.readFileSync('assets/port79-browser-download-status.js','utf8'),home=fs.readFileSync('index.html','utf8');
new vm.Script(src);new vm.Script(auto);new vm.Script(ui);
function setup({role='admin',permissions={hr:'view',schedule:'none',attendance:'view'},pending=false,offline=false}={}){
 const ss=new Map([['port79_user_session',JSON.stringify({empId:'QA',adminRole:role,systemPermissions:permissions})],['port79_user_token','SECRET']]),local=new Map(),events=new Map(),calls=[];
 const win={__port79CachedSessionRefreshPending:pending,navigator:{onLine:!offline},addEventListener:(k,f)=>events.set(k,f),setInterval:()=>1,clearInterval(){},Port79DataCache:{
 viewerKey:()=> 'QA@'+role,downloadAll:async(cb,options)=>{calls.push(options);for(const [i,sys] of options.systems.entries()){if(!options.startupGuard())break;cb(sys,i,options.systems.length,'reused');}return options.systems.map(system=>({system,ok:true}));},flushFolder:async()=>{},getFolderSyncStatus:async()=>({state:'idle'})}};
 const c={window:win,sessionStorage:{getItem:k=>ss.get(k)||null},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},Date,JSON,Set,Object,Number,String,Promise};
 vm.createContext(c);vm.runInContext(auto,c);
 return {win,calls,local,ss,events,run:()=>win.P79BrowserStartup.start('SECRET')};
}
(async()=>{
 const a=setup();await a.run();await a.run();assert.equal(a.calls.length,1);assert.deepEqual(Array.from(a.calls[0].systems),['hr','attendance']);assert.equal(a.calls[0].resumeExisting,true);
 const progress=JSON.parse(a.local.get('p79BrowserCacheProgressV1'));assert.equal(progress.completed,2);assert.equal(progress.phase,'complete');assert(!JSON.stringify(progress).includes('SECRET'));assert.equal(progress.states.hr,'reused');
 const b=setup({pending:true});await b.run();assert.equal(b.calls.length,0);
 const c=setup({role:'employee'});await c.run();assert.equal(c.calls.length,0);
 const d=setup({offline:true});await d.run();assert.equal(d.calls.length,0);d.win.navigator.onLine=true;d.events.get('online')();await new Promise(r=>setImmediate(r));assert.equal(d.calls.length,1);
 const e=setup();e.ss.set('port79_user_token','OTHER');await e.run();assert.equal(e.calls.length,0);
 const all=setup({role:'superadmin'});await all.run();
 assert.deepEqual(Array.from(all.calls[0].systems),['leave','schedule','efficiency','hr','attendance','workhours']);
 assert.equal(all.calls[0].historyOnDemand,true);
 const allProgress=JSON.parse(all.local.get('p79BrowserCacheProgressV1'));
 assert.equal(allProgress.total,6);assert.equal(allProgress.completed,6);assert.equal(allProgress.phase,'complete');assert.equal(allProgress.historyOnDemand,true);assert.equal(allProgress.states.history,undefined);
 const hist=setup({permissions:{history:'view'}});await hist.run();assert.equal(hist.calls.length,0,'history-only account does not trigger startup bulk download');
 assert(ui.includes('歷史資料：按月讀取（未預載）'));
 assert(home.includes('P79BrowserStartup?.start?.(token)'));assert(home.includes('P79BrowserStartup?.busy?.()'));
 assert(ui.includes('data-p79-month-bar'));assert(ui.includes('data-p79-systems'));
 console.log('PASS verified web startup, permissions, no duplicate run, offline resume, progress and credential isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
