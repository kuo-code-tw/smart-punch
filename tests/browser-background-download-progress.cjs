'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const cache=fs.readFileSync('assets/port79-data-cache.js','utf8');
const worker=fs.readFileSync('assets/port79-browser-background.html','utf8');
const ui=fs.readFileSync('assets/port79-browser-download-status.js','utf8');
const windows=fs.readFileSync('assets/port79-windows-download.js','utf8');
const home=fs.readFileSync('index.html','utf8');
new vm.Script(cache);new vm.Script(ui);
assert.match(cache,/function startBrowserBackgroundDownload\(action,system\)/);
assert.match(cache,/startBrowserBackgroundDownload\(act,currentSystem\(\)\)/);
assert.match(cache,/!window\.chrome\?\.webview\?\.postMessage/);
assert.match(cache,/port79-browser-download-status\.js/);
assert.match(cache,/port79-browser-background\.html/);
assert.match(windows,/link\.hidden=!active/);
assert.match(windows,/link\.removeAttribute\('href'\)[\s\S]*?link\.setAttribute\('aria-disabled','true'\)/);
assert.match(home,/id="p79WindowsDownloadLink"/);
assert.match(home,/id="p79HomeDatabaseDownload"/);
assert.match(worker,/src="\.\/port79-data-cache\.js/);
assert.match(worker,/window\.__p79BrowserBackgroundWorker=true/);
assert.doesNotMatch(worker,/token=[^'"&]*TOKEN/);

function launch(){
 const start=cache.indexOf('function startBrowserBackgroundDownload(action,system){');
 const end=cache.indexOf('\nfunction ensureModal()',start);
 assert(start>0&&end>start);
 const opens=[],messages=[],store=new Map();
 const context={URL,Date,JSON,String,viewerKey:()=> 'QA@admin',setProgress:t=>messages.push(t),
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  document:{querySelector:()=>({src:'https://example.org/smart-punch/assets/port79-data-cache.js?v=1'})},
  window:{open:(url,name)=>{opens.push({url,name});return {}}}};
 vm.createContext(context);vm.runInContext(cache.slice(start,end),context);
 context.startBrowserBackgroundDownload('all','attendance');
 assert.equal(opens.length,1);
 const first=new URL(opens[0].url);
 assert.equal(first.pathname,'/smart-punch/assets/port79-browser-background.html');
 assert.equal(first.searchParams.get('mode'),'all');
 assert(!first.href.includes('TOKEN'));
 assert(messages.some(x=>x.includes('背景分頁')));
 store.set('p79BrowserCacheProgressV1',JSON.stringify({viewer:'QA@admin',phase:'downloading',updatedAt:Date.now(),detail:'考勤 3/10 月'}));
 context.startBrowserBackgroundDownload('all','attendance');
 assert.equal(opens.length,1,'An active job cannot be replaced by a second download');
 store.clear();context.startBrowserBackgroundDownload('resume','attendance');assert.equal(opens.length,2);assert.equal(new URL(opens[1].url).searchParams.get('resume'),'1');
 assert.match(ui,/data-p79-retry/);assert.match(home,/id="p79HomeBackgroundDownload"/);
}

function verifyNoticeNavigation(){
 const store=new Map();let now=100000;
 const key='p79BrowserCacheProgressV1',viewer='QA@admin';
 const put=(phase,startedAt,updatedAt=now)=>store.set(key,JSON.stringify({viewer,phase,startedAt,updatedAt,completed:6,total:6}));
 const page=()=>{
  const children=new Map(),node=()=>({hidden:false,style:{},textContent:'',setAttribute(){},addEventListener(name,fn){this[name]=fn}});
  const panel={...node(),querySelector(s){if(!children.has(s))children.set(s,node());return children.get(s)}};
  const win={Port79DataCache:{viewerKey:()=>viewer},addEventListener(){},setInterval:f=>{win.tick=f}};
  const document={readyState:'complete',body:{appendChild(){}},head:{appendChild(){}},createElement:t=>t==='aside'?panel:node()};
  vm.runInNewContext(ui,{window:win,document,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},Date:{now:()=>now},JSON,Math,Number,String,Object,encodeURIComponent});
  return {panel,tick:win.tick,dismiss:()=>children.get('[data-p79-dismiss]').click()};
 };
 put('complete',90000);const first=page();assert.equal(first.panel.hidden,false,'fresh completion shown once');
 assert.equal(page().panel.hidden,true,'navigation cannot replay same completion');
 now+=8000;first.tick();assert.equal(first.panel.hidden,true,'shared completion expires');
 put('complete',98000,now-9000);assert.equal(page().panel.hidden,true,'old completion not replayed');
 put('downloading',now);const active=page();assert.equal(active.panel.hidden,false,'active progress still visible');
 put('partial',now);active.tick();assert.equal(active.panel.hidden,false,'partial state visible');active.dismiss();assert.equal(page().panel.hidden,true,'dismissal shared across pages');
 now+=1000;put('complete',now);assert.equal(page().panel.hidden,false,'new job announces completion');
}

async function executeWorker({role='admin',mode='all',session=true}={}){
 const scripts=[...worker.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
 const code=scripts.at(-1);
 new vm.Script(code);
 const mem=new Map(),events=new Map(),calls=[];
 const panel={summary:{textContent:''},detail:{textContent:''},bar:{max:1,value:0}};
 const doc={getElementById:id=>({summary:panel.summary,detail:panel.detail,bar:panel.bar})[id]};
 const saved=new Map(),sessionStorage={getItem:k=>saved.get(k)||null};
 if(session){saved.set('port79_user_session',JSON.stringify({empId:'QA',adminRole:role}));
  saved.set('port79_user_token','SECRET_ACCESS_TOKEN');}
 const win={addEventListener:(name,fn)=>events.set(name,fn),
  Port79DataCache:{viewerKey:()=> 'QA@'+role,
   flushFolder:async()=>{},
   getFolderSyncStatus:async()=>({state:'idle',label:'未連接'}),
   downloadAll:async callback=>{
    for(const [i,sys] of ['leave','schedule','efficiency','hr','attendance','workhours'].entries()){
     callback(sys,i,6,'loading',null,'正在讀取');
     if(sys==='attendance')callback(sys,i,6,'detail',null,'讀取 3/10 月',{monthCompleted:3,monthTotal:10});
     callback(sys,i,6,'done');
     calls.push(sys);
    }
    return calls.map(system=>({system,ok:true}));
   }}
 };
 const context={window:win,document:doc,localStorage:{setItem:(k,v)=>mem.set(k,v)},
  sessionStorage,location:{search:'?mode='+mode},URLSearchParams,Date,JSON,Set,Number,String,
  BroadcastChannel:class{postMessage(){}},Error,Promise};
 vm.createContext(context);vm.runInContext(code,context);
 await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setImmediate(resolve));
 return {calls,progress:JSON.parse(mem.get('p79BrowserCacheProgressV1')),events,panel,stored:mem};
}
(async()=>{
 launch();
 verifyNoticeNavigation();
 const manager=await executeWorker();
 assert.equal(manager.calls.length,6);
 assert.equal(manager.progress.phase,'complete');
 assert.equal(manager.progress.completed,6);
 assert.equal(manager.progress.total,6);
 assert.equal(manager.progress.monthCompleted,3);
 assert.equal(manager.progress.monthTotal,10);
 assert.equal(manager.panel.bar.value,1);
 assert(!JSON.stringify([...manager.stored]).includes('SECRET_ACCESS_TOKEN'),'Never share login credentials in status storage');
 const employee=await executeWorker({role:'employee'});
 assert.equal(employee.calls.length,0);
 assert.equal(employee.progress.phase,'failed');
 const loggedOut=await executeWorker({session:false});
 assert.equal(loggedOut.calls.length,0);
 assert.equal(loggedOut.progress.phase,'failed');
 console.log('PASS browser background tab: verified manager, six systems, month progress, re-entry lock, cross-tab status and no credential leaks');
})().catch(e=>{console.error(e);process.exitCode=1});
