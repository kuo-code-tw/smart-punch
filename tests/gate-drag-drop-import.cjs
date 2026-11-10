'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(base,'gate-import/index.html'),'utf8');
const js=fs.readFileSync(path.join(base,'assets/port79-gate-import.js'),'utf8');
const backend=fs.readFileSync(path.join(base,'backend/gate-stats-daily-import.gs'),'utf8');
new vm.Script(js);
assert(html.includes('id="gateDropZone"'), 'drop target available above official Gate metrics');
assert(html.indexOf('id="gateDropZone"')<html.indexOf('class="grid gate-live-metrics"'));
assert(html.includes('gate-drag-autosave-v2'),'import JS cache is refreshed');
assert(backend.includes('index.get(date)'),'back end continues date upsert instead of addition');
class Element{
 constructor(id){this.id=id;this.children=[];this.listeners={};this.dataset={};this.attrs={};
  this.disabled=false;this.hidden=false;this.files=[];this.value='';this._text='';
  this.classList={add(){},remove(){}};}
 set textContent(v){this._text=v;if(v==='')this.children=[];}
 get textContent(){return this._text;}
 addEventListener(key,cb){this.listeners[key]=cb;}
 setAttribute(k,v){this.attrs[k]=v;}
 appendChild(x){this.children.push(x);}
 click(){this.clicked=true;this.listeners.click?.();}
}
const els=new Map();
const get=id=>{if(!els.has(id))els.set(id,new Element(id));return els.get(id);};
const doc={getElementById:get,createElement:tag=>new Element(tag),body:new Element('body'),
 addEventListener(){}};
const matrix=Array.from({length:16},()=>Array(4).fill(''));
matrix[0][2]='2026-11-01';matrix[0][3]='2026-11-02';
const values=[[0,166],[31,294],[2,0],[182,204],[215,664],
 [37,164],[6,141],[0,0],[116,216],[159,521],[374,1185]];
const labels=['交空櫃','交重櫃','交空櫃','交重櫃','','領空櫃','領重櫃','領空櫃','領重櫃'];
values.forEach((v,i)=>{
 matrix[i+1][2]=v[0];matrix[i+1][3]=v[1];matrix[i+1][1]=labels[i]||'';
});
matrix[14][0]='本日進站卡車數';matrix[14][2]=263;matrix[14][3]=981;
const book={SheetNames:['GATE'],Sheets:{GATE:{}}};
let valid=true,online=true,calls=[],refreshes=0;
const token='AUTH-GATE';
const storage={
 port79_user_session:JSON.stringify({role:'superadmin',empId:'ADMIN',punchOnly:false}),
 port79_user_token:token,
 port79_gas_url:'https://script.google.com/macros/s/TEST_GATE/exec'
};
const win={
 document:doc,sessionStorage:{getItem:k=>storage[k]||null},
 XLSX:{read:()=>book,utils:{sheet_to_json:()=>valid?matrix:[[1]]}},
 P79GateLive:{refresh:async()=>{refreshes++;}},
 fetch:async (url,options)=>{
  calls.push({url:String(url),options});
  if(!options||options.method!=='POST'){
   const year=new URL(String(url)).searchParams.get('year');
   if(!online)return {ok:true,json:async()=>({ok:false,error:'未知操作: gateStatsReadYear'})};
   return {ok:true,json:async()=>({ok:true,source:'port79-gate-daily',year,rows:[]})};
  }
  const body=new URLSearchParams(options.body);
  const rows=JSON.parse(body.get('rows'));
  assert.equal(body.get('action'),'gateStatsImport');
  assert.equal(body.get('gcToken'),token);
  assert.equal(rows.length,2);
  assert.equal(rows[0].deliverEmpty,2);
  assert.equal(rows[1].truckEntries,981);
  return {ok:true,json:async()=>({ok:true,source:'port79-gate-daily',added:2,updated:0})};
 }
};
vm.runInNewContext(js,{window:win,URL,URLSearchParams,console},{timeout:4000});
const file={name:'gate.xlsx',size:1400,arrayBuffer:async()=>new ArrayBuffer(4)};
function drop(files=[file]){
 const ev={dataTransfer:{types:['Files'],files},preventDefault(){this.prevented=true;},
  stopPropagation(){this.stopped=true;}};
 get('gateDropZone').listeners.drop(ev);
 assert(ev.prevented,'drop does not navigate browser');
}
async function settle(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));}
(async()=>{
 drop();await settle();
 assert.equal(calls.filter(c=>c.options?.method==='POST').length,1,'valid drop uploads without extra click');
 assert.equal(get('gateTotal').textContent,'1,559');
 assert.equal(get('gateTruck').textContent,'1,244');
 assert(get('gateMessage').textContent.includes('已寫入正式資料庫'),'success only after POST confirmation');
 assert.equal(refreshes,1,'confirmed import refreshes official read-only view');
 drop();await settle();
 assert.equal(calls.filter(c=>c.options?.method==='POST').length,2,'reimport sends same dates for server upsert');
 valid=false;drop();await settle();
 assert.equal(calls.filter(c=>c.options?.method==='POST').length,2,'invalid workbook never posts');
 assert(get('gateMessage').textContent.includes('預覽失敗'),'invalid workbook displays a useful error');
 valid=true;online=false;drop();await settle();
 assert.equal(calls.filter(c=>c.options?.method==='POST').length,2,'unverified cloud route prevents autosave');
 assert(get('gateMessage').textContent.includes('尚未部署 Gate 匯入服務'));
 drop([file,file]);
 assert.equal(calls.filter(c=>c.options?.method==='POST').length,2,'multiple files rejected');
 assert(get('gateMessage').textContent.includes('一次只能匯入'));
 get('gateDropZone').listeners.click();
 assert(get('gateFile').clicked,'clicking the target opens the file selector');
 console.log('PASS: Gate drag/drop, automatic validated save, read-route guard, upsert-compatible repeat, refresh and errors');
})().catch(e=>{console.error(e);process.exitCode=1;});
