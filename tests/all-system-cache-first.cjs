const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-data-cache.js','utf8');
const storage=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
class Element{constructor(tag){this.tag=tag;this.children=[];this.style={};this.attrs={};this.textContent='';}appendChild(e){this.children.push(e);e.parent=this;return e;}prepend(e){this.children.unshift(e);e.parent=this;}setAttribute(k,v){this.attrs[k]=v;}remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}}
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
const options={system:'hr',actions:['hrGetEmployees'],host:'main',canShow:()=>true,select:d=>({columns:['姓名'],rows:d.employees.map(e=>[e.name]),label:'員工主檔'})};
(async()=>{
 let x=setup({hang:true}),p=x.fetch(url('hrGetEmployees'),{cache:'no-store',signal:new AbortController().signal});
 x.requests[0].resolve(response({ok:true,employees:[{empId:'QA',name:'Fixture'}]}));
 assert((await Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(Error('network waited for disk')),150))])).ok);await settle();
 assert(x.api.testMemory.has('QA@admin|system|hr'),'ordinary no-store read automatically saves preview');x.release();
 x=setup({hang:true});p=x.fetch(url('getLeaveData'));await new Promise(r=>setTimeout(r,80));assert.equal(x.requests.length,1,'blocked local cache cannot prevent cloud request');x.requests[0].resolve(response({ok:true,employees:[],leaveRecords:[]}));await p;x.release();
 x=setup();await seed(x,'hr',{ok:true,employees:[{name:'<img src=x onerror=alert(1)>'}]});
 assert(await x.api.showStartupPreview(options));const card=x.host.children[0];assert.equal(card.id,'p79StartupCacheStatus');const cells=card.children[2].children[0].children[1].children[0].children;
 assert.equal(cells[0].textContent,'<img src=x onerror=alert(1)>','data rendered as text, never executable HTML');assert.equal(cells[0].children.length,0);
 p=x.fetch(url('hrGetEmployees'),{cache:'no-store'});x.requests[0].resolve(response({ok:true,employees:[]}));await p;await settle();assert(x.api.hasStartupPreview(),'preview survives until page has actually applied cloud data');x.api.finishStartupPreview('hr');assert.equal(x.host.children.length,0);
 x=setup({hang:true});let rendered=0;const pending=x.api.showStartupPreview({...options,select:()=>{rendered++;return{rows:[['old']],columns:['old']}}});
 p=x.fetch(url('hrGetEmployees'),{cache:'no-store'});x.requests[0].resolve(response({ok:true,employees:[]}));await p;x.release();assert.equal(await pending,false);assert.equal(rendered,0,'late disk result cannot overwrite live view');
 x=setup();await seed(x,'hr',{ok:true,employees:[{name:'old'}]});x.ss.removeItem('port79_user_token');assert.equal(await x.api.showStartupPreview(options),false);
 x=setup();p=x.fetch(url('hrGetEmployees'),{cache:'no-store'});x.ss.setItem('port79_user_token','NEW');x.requests[0].resolve(response({ok:true,employees:[{name:'old account'}]}));await p;await settle();assert.equal(x.api.testMemory.size,0);
 x=setup();p=x.fetch(url('hrGetEmployees').replace('TOKEN','OTHER'),{cache:'no-store'});x.requests[0].resolve(response({ok:true,employees:[]}));await p;await settle();assert.equal(x.api.testMemory.size,0,'explicit foreign credentials never populate active viewer snapshot');
 x=setup();p=x.fetch(url('getAttendanceMonthData','&month=2026-10'),{cache:'no-store'});x.requests[0].resolve(response({ok:true,month:'2026-10',records:[{id:'R1'}]}));await p;await settle();for(const sys of ['attendance','workhours'])assert(x.api.testMemory.has('QA@admin|system|'+sys+'|2026-10'));
 const historyUrl=url('historyGetMonthData','&type=attendance&month=2026-10');await x.api.put({key:x.api.testKey(historyUrl),kind:'api',savedAt:Date.now()-86400000,size:100,data:{ok:true,month:'2026-10',records:[{id:'H1'}]}}).catch(()=>{});
 assert((await x.api.getHistoryPreview(historyUrl)).sourceLabel.includes('本機歷史快取'));assert.equal(await x.api.getHistoryPreview(url('historyGetMonthData','&type=attendance&month=2026-11')),null);
 // Execute production selectors; they must not mutate business arrays or invoke render/write routines.
 for(const [file,name,system] of [['attendance/index.html','p79PreviewAttendanceFolder','attendance'],['work-hours/index.html','p79PreviewAttendanceFolder','workhours'],['leave/index.html','p79PreviewLeave','leave'],['hr/index.html','p79TryLoadHrCache','hr'],['aqc-efficiency/index.html','p79PreviewEfficiencyFolder','efficiency']]){
  const html=fs.readFileSync(file,'utf8'),a=html.indexOf('function '+name+'('),end=html.indexOf('\n}',a)+2,original=[];let captured;
  const c={window:{Port79DataCache:{showStartupPreview:o=>{captured=o;return true}}},records:original,employees:original,shipMasters:original,adminSession:{},leaveAccess:'manage',session:{},hrAccess:'manage',gcToken:'TOKEN',getRequestedAttendanceCloudMonth:()=> '2026-10',canReadAdminCloudData:()=>true,canCurrentAdminViewDataRow:()=>true,attendanceRecordMonthKey:r=>r.month,requireEfficiencyAccess:()=>true};vm.createContext(c);vm.runInContext(html.slice(a,end),c);c[name]();assert.equal(captured.system,system);assert(captured.canShow());
  const data={ok:true,records:[{month:'2026-10',name:'QA'},{month:'2026-11',name:'other'}],employees:[{empId:'QA',name:'QA'}],leaveRecords:[{name:'QA'}],shipMasters:[{workingNo:'W1',vesselName:'Fixture'}]};const serialized=JSON.stringify(data);const model=captured.select(data,{});assert(model.rows.length);if(['attendance','workhours'].includes(system))assert.equal(model.rows.length,1);assert.equal(JSON.stringify(data),serialized);assert.equal(c.records,original);assert.equal(c.employees,original);assert.equal(c.shipMasters,original);
 }
 assert(fs.readFileSync('work-hours/index.html','utf8').includes("document.addEventListener('DOMContentLoaded',async function(ev)"));
 assert(!fs.readFileSync('aqc-efficiency/index.html','utf8').includes("window.addEventListener('load',async()=>{"));
 console.log('PASS all-system preview selectors preserve business state; escaped read-only DOM; disk-independent fresh reads; monthly persistence; account/token/late-disk guards; old exact-month history cache; DOM-ready startup');
})().catch(e=>{console.error(e);process.exitCode=1});
