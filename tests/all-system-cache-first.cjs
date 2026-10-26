const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-data-cache.js','utf8');
const storage=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
class Element{constructor(tag){this.tag=tag;this.children=[];this.style={};this.attrs={};this.textContent='';this.listeners={};}addEventListener(type,fn){this.listeners[type]=fn;}appendChild(e){this.children.push(e);e.parent=this;return e;}prepend(e){this.children.unshift(e);e.parent=this;}setAttribute(k,v){this.attrs[k]=v;}remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}}
function setup({hang=false}={}){
 const ss=storage();ss.setItem('port79_user_session',JSON.stringify({empId:'QA',adminRole:'admin'}));ss.setItem('port79_user_token','TOKEN');
 const host=new Element('main'),requests=[],opens=[];
 const window={fetch:(url,init)=>new Promise((resolve,reject)=>requests.push({url,init,resolve,reject}))};
 const c={window,sessionStorage:ss,localStorage:storage(),URL,URLSearchParams,Request,Response,Blob,Date,JSON,Map,Set,Promise,console,setTimeout,clearTimeout,location:{pathname:'/smart-punch/hr/',href:'https://example.invalid/smart-punch/hr/'},document:{createElement:t=>new Element(t),querySelector:()=>host},indexedDB:{open(){const r={};opens.push(r);if(!hang)queueMicrotask(()=>{r.error=Error('test storage unavailable');r.onerror?.()});return r;}}};
 vm.createContext(c);vm.runInContext(source.replace('window.Port79DataCache={','window.Port79DataCache={testKey:actionKey,testMemory:memoryCache,'),c);
 return{c,api:window.Port79DataCache,fetch:window.fetch,ss,host,requests,release(){hang=false;for(const r of opens){r.error=Error('test');r.onerror?.();}}};
}
const url=(action,extra='')=>'https://script.google.com/macros/s/FIXTURE/exec?action='+action+'&token=TOKEN'+extra;
const response=d=>new Response(JSON.stringify(d));
const tick=()=>new Promise(r=>setImmediate(r));
async function settle(){for(let i=0;i<10;i++)await tick();}
async function seed(x,system,data,savedAt=Date.now()-86400000){await x.api.put({key:'QA@admin|system|'+system,kind:'system',system,savedAt,size:100,data}).catch(()=>{});}
const options={system:'hr',actions:['hrGetEmployees'],host:'main',canShow:()=>true,select:d=>({columns:['工號','姓名','部門','職稱'],rows:d.employees.map(e=>[e.empId,e.name,e.dept,e.jobTitle]),label:'員工主檔'})};
(async()=>{
 let x=setup({hang:true}),p=x.fetch(url('hrGetEmployees'),{cache:'no-store',signal:new AbortController().signal});
 x.requests[0].resolve(response({ok:true,employees:[{empId:'QA',name:'Fixture'}]}));
 assert((await Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(Error('network waited for disk')),150))])).ok);await settle();
 assert(x.api.testMemory.has('QA@admin|system|hr'),'ordinary no-store read automatically saves preview');x.release();
 x=setup({hang:true});p=x.fetch(url('getLeaveData'));await new Promise(r=>setTimeout(r,80));assert.equal(x.requests.length,1,'blocked local cache cannot prevent cloud request');x.requests[0].resolve(response({ok:true,employees:[],leaveRecords:[]}));await p;x.release();
 // The startup preview window and its DOM rendering code must be absent.
 assert(!('showStartupPreview' in x.api));
 assert(!('finishStartupPreview' in x.api));
 assert(!('hasStartupPreview' in x.api));
 assert(!source.includes('p79StartupCacheStatus'));
 assert(!source.includes('p79-hr-cache-compact'));
 x=setup();p=x.fetch(url('hrGetEmployees'),{cache:'no-store'});x.ss.setItem('port79_user_token','NEW');x.requests[0].resolve(response({ok:true,employees:[{name:'old account'}]}));await p;await settle();assert.equal(x.api.testMemory.size,0);
 x=setup();p=x.fetch(url('hrGetEmployees').replace('TOKEN','OTHER'),{cache:'no-store'});x.requests[0].resolve(response({ok:true,employees:[]}));await p;await settle();assert.equal(x.api.testMemory.size,0,'explicit foreign credentials never populate active viewer snapshot');
 x=setup();p=x.fetch(url('getAttendanceMonthData','&month=2026-10'),{cache:'no-store'});x.requests[0].resolve(response({ok:true,month:'2026-10',records:[{id:'R1'}]}));await p;await settle();for(const sys of ['attendance','workhours'])assert(x.api.testMemory.has('QA@admin|system|'+sys+'|2026-10'));
 const historyUrl=url('historyGetMonthData','&type=attendance&month=2026-10');await x.api.put({key:x.api.testKey(historyUrl),kind:'api',savedAt:Date.now()-86400000,size:100,data:{ok:true,month:'2026-10',records:[{id:'H1'}]}}).catch(()=>{});
 assert((await x.api.getHistoryPreview(historyUrl)).sourceLabel.includes('本機歷史快取'));assert.equal(await x.api.getHistoryPreview(url('historyGetMonthData','&type=attendance&month=2026-11')),null);
 // Every production page still loads the real shared cache, but has no startup preview renderer.
 for(const file of ['attendance/index.html','work-hours/index.html','leave/index.html','hr/index.html','aqc-efficiency/index.html']){
  const html=fs.readFileSync(file,'utf8');
  assert(html.includes('port79-data-cache.js'),file+' must retain the real cache module');
  assert(!/showStartupPreview|finishStartupPreview|hasStartupPreview|p79StartupCacheStatus|p79PreviewAttendanceFolder|p79PreviewLeave|p79PreviewEfficiencyFolder|p79TryLoadHrCache/.test(html),file+' must not contain startup preview UI');
 }
 assert(fs.readFileSync('work-hours/index.html','utf8').includes("document.addEventListener('DOMContentLoaded',async function(ev)"));
 assert(!fs.readFileSync('aqc-efficiency/index.html','utf8').includes("window.addEventListener('load',async()=>{"));
 console.log('PASS startup preview UI removed while shared cache persistence, account guards, monthly snapshots and history cache remain intact');
})().catch(e=>{console.error(e);process.exitCode=1});
