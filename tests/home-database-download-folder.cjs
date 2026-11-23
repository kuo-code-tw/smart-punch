'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('assets/port79-home-database-download.js','utf8');
const home=fs.readFileSync('index.html','utf8');
const cache=fs.readFileSync('assets/port79-data-cache.js','utf8');
const compact=fs.readFileSync('assets/port79-home-compact-controls.js','utf8');
const css=fs.readFileSync('assets/port79-home-compact-controls.css','utf8');
new vm.Script(source);

function fixture({role='admin',loggedIn=true,punchOnly=false,folder=true}={}){
 const events=new Map(),observers=[],alerts=[],calls={opens:0,folder:0,downloads:0};
 const records=new Map();
 const controls={bar:{show:loggedIn},systems:{show:loggedIn}};
 const bar={classList:{contains:c=>c==='show'&&controls.bar.show}};
 const systems={classList:{contains:c=>c==='show'&&controls.systems.show}};
 const picker={focused:false,focus(){this.focused=true;}};
 const persist={focused:false,focus(){this.focused=true;}};
 const status={id:'p79DeviceStatus'};
 const dialog={
  added:[],
  querySelector(sel){return({
   '#p79DeviceStatus':status,
   '[data-cache-action="folder"]':picker,
   '[data-cache-action="persist"]':persist
  })[sel]||null;},
  insertBefore(node,other){this.added.push({node,other});records.set(node.id,node);},
  prepend(node){this.added.push({node});records.set(node.id,node);}
 };
 const button={hidden:true,disabled:false,listeners:new Map(),addEventListener(name,cb){this.listeners.set(name,cb);}};
 const nodes={
  p79HomeDatabaseDownload:button,sessionBar:bar,systems,
  p79CacheModal:dialog
 };
 const session=new Map();
 if(loggedIn){
  session.set('port79_user_token','TOKEN');
  session.set('port79_user_session',JSON.stringify({empId:'QA',adminRole:role,punchOnly}));
 }
 const sessionStorage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)};
 const document={
  getElementById:id=>nodes[id]||records.get(id)||null,
  createElement:tag=>({tagName:tag,setAttribute(k,v){this[k]=v;},className:'',textContent:''}),
  addEventListener:(name,cb)=>events.set('document:'+name,cb)
 };
 const window={
  Port79DataCache:{
   openCenter(){calls.opens++;return Promise.resolve()},
   connectFolder(){calls.folder++},
   downloadAll(){calls.downloads++}
  },
  setInterval:()=>1,clearInterval(){},addEventListener:(name,cb)=>events.set('window:'+name,cb),
  alert:msg=>alerts.push(msg)
 };
 if(folder)window.showDirectoryPicker=()=>null;
 class MutationObserver{constructor(cb){this.cb=cb;observers.push(this);}observe(){}disconnect(){}}
 vm.runInNewContext(source,{document,window,sessionStorage,MutationObserver,JSON,String,Promise,Error}, {filename:'assets/port79-home-database-download.js'});
 return {document,window,sessionStorage,button,calls,controls,records,observers,events,alerts,picker,persist};
}

(async()=>{
 const admin=fixture();
 assert.equal(admin.button.hidden,false,'Authenticated management can open the database centre');
 admin.button.listeners.get('click')();
 await Promise.resolve();
 assert.equal(admin.calls.opens,1);
 assert.equal(admin.calls.folder,0,'Opening modal must NOT implicitly choose a folder');
 assert.equal(admin.calls.downloads,0,'Opening modal must NOT download the entire database');
 assert(admin.picker.focused,'Folder selection should be the first highlighted action');
 assert.match(admin.records.get('p79HomeDatabaseGuide').textContent,/選擇電腦資料夾/);
 assert.match(admin.records.get('p79HomeDatabaseGuide').textContent,/下載六項基本資料/);
 assert.match(admin.records.get('p79HomeDatabaseGuide').textContent,/公司允許的位置/);

 const superadmin=fixture({role:'superadmin'});
 superadmin.button.listeners.get('click')();
 assert.equal(superadmin.calls.opens,1,'Superadmin can open database centre even if Windows ZIP is locked');

 const employee=fixture({role:'employee'});
 assert.equal(employee.button.hidden,true,'Employee may not export management cache');
 employee.button.listeners.get('click')();
 assert.equal(employee.calls.opens,0);

 const punch=fixture({punchOnly:true});
 assert.equal(punch.button.hidden,true,'Punch-only session cannot open management database');
 const loggedOut=fixture({loggedIn:false});
 assert.equal(loggedOut.button.hidden,true);
 loggedOut.button.listeners.get('click')();
 assert.equal(loggedOut.calls.opens,0);

 const sessionChanged=fixture();
 sessionChanged.sessionStorage.removeItem('port79_user_token');
 sessionChanged.observers[0].cb();
 assert.equal(sessionChanged.button.hidden,true,'Logout immediately hides database download');
 sessionChanged.button.listeners.get('click')();
 assert.equal(sessionChanged.calls.opens,0);

 const unsupported=fixture({folder:false});
 unsupported.button.listeners.get('click')();
 assert.equal(unsupported.calls.opens,1,'Browser-only fallback still opens centre');
 assert(unsupported.persist.focused,'Unsupported folder API highlights browser storage instead');
 assert.match(unsupported.records.get('p79HomeDatabaseGuide').textContent,/瀏覽器內部快取/);

 assert.match(source,/sessionStorage\.getItem\('port79_admin_token'\)/,'Legacy signed-in managers retain database entry');
 assert.match(home,/id="p79WindowsDownloadLink"[\s\S]{0,400}id="p79HomeDatabaseDownload"/);
 assert.match(home,/id="p79HomeDatabaseDownload"[^>]*type="button" hidden/);
 assert.match(home,/port79-home-database-download\.js\?v=20261123-db-folder-v1/);
 assert.match(compact,/compact\.append\(database\)/,'Shortcut follows existing Windows link');
 assert.match(css,/#p79HomeCompactActions #p79HomeDatabaseDownload/);
 assert.match(cache,/async function connectFolder\(\)\{/);
 assert.match(cache,/await window\.showDirectoryPicker\(\{id:'port79-cloud-cache'/,'Actual folder location picker remains');
 assert.match(cache,/data-cache-action="folder">選擇電腦資料夾/);
 assert.match(cache,/data-cache-action="all">下載六項基本資料（歷史按月）/);
 assert.match(cache,/data-cache-action="quick">快速預載常用資料/);
 assert.match(cache,/window\.Port79DataCache=\{preloadCurrent,[^\n]*openCenter/);
 assert.doesNotMatch(source,/\.downloadAll\(|\.downloadSystem\(|\.connectFolder\(|showDirectoryPicker\(/,
  'Homepage button must never silently bulk-download or initiate directory selection');
 const build=fs.readFileSync('desktop-lite/build-portable.ps1','utf8');
 assert.match(build,/'assets','attendance','schedule','leave'/);
 assert.match(build,/'index.html'/,'Windows package also contains this same shortcut');
 console.log('PASS home database button, manager permissions, independent ZIP gating, explicit folder choice, browser fallback and shared Web/Windows packaging');
})().catch(e=>{console.error(e);process.exitCode=1;});
