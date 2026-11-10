'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const style=fs.readFileSync(path.join(root,'assets/port79-reference-dashboard.css'),'utf8');
const importerHTML=fs.readFileSync(path.join(root,'gate-import/index.html'),'utf8');
const importer=fs.readFileSync(path.join(root,'assets/port79-gate-import.js'),'utf8');
const backend=fs.readFileSync(path.join(root,'backend/gate-stats-daily-import.gs'),'utf8');
new vm.Script(importer);
new vm.Script(backend);
assert(!style.includes('min-width:565px!important'),'remove original forced 565px ranking width');
const flip=html.indexOf('p79d-ranking p79d-gate-flip');
const gate=html.indexOf('id="p79HomeGatePanel"',flip);
const nextPanel=html.indexOf('p79d-ship-schedule',flip);
assert(flip>0&&gate>flip&&gate<nextPanel,'gate statistics live in the latest-vessel small card');
assert(!html.includes('id="p79HomeStatTabs"'),'no full-homepage tab switch');
const efficiency=fs.readFileSync(path.join(root,'aqc-efficiency/index.html'),'utf8');
assert(!html.includes('id="p79GateImportLink"'),'homepage is read-only');
assert(efficiency.includes('data-tab="gate"')&&efficiency.includes('id="view-gate"'),'Gate import lives in vessel system');
assert(efficiency.includes('data-src="../gate-import/?embed=1&v=20261110-parent-dialog-v5"'),'vessel-system Gate tab embeds the import manager');
assert(importerHTML.includes('id="gateFile"')&&importerHTML.includes('id="gateSave"'));
assert(importerHTML.includes('cdn.sheetjs.com/xlsx-0.20.3'),'pinned official Excel parser');
assert(backend.includes('LockService.getScriptLock()'),'server import locked');
assert(backend.includes('incoming.has(r[0])'),'reject duplicate input dates');
assert(backend.includes('index.get(date)'),'server upserts existing date');
class Element{
 constructor(id){this.id=id;this.children=[];this.dataset={};this.attrs={};this.hidden=false;this.disabled=false;this.files=[];this.listeners={};this.value='';this._text='';}
 set textContent(v){this._text=v;if(v==='')this.children=[];}
 get textContent(){return this._text;}
 addEventListener(k,fn){this.listeners[k]=fn;}
 appendChild(x){this.children.push(x);return x;}
 remove(){}
 click(){if(this.listeners.click)return this.listeners.click();}
}
const ids=new Map(), el=id=>{
 if(!ids.has(id))ids.set(id,new Element(id));return ids.get(id);
};
const doc={getElementById:el,createElement:tag=>new Element(tag),body:new Element('body')};
const matrix=Array.from({length:16},()=>Array(4).fill(''));
matrix[0][2]='2026-11-01';matrix[0][3]='2026-11-02';
const source=[
 [0,166],[31,294],[2,0],[182,204],[215,664],
 [37,164],[6,141],[0,0],[116,216],[159,521],
 [374,1185]
];
const labels=['交空櫃','交重櫃','交空櫃','交重櫃','','領空櫃','領重櫃','領空櫃','領重櫃'];
source.forEach((values,i)=>{matrix[i+1][2]=values[0];matrix[i+1][3]=values[1];matrix[i+1][1]=labels[i]||'';});
matrix[14][0]='本日進站卡車數';matrix[14][2]=263;matrix[14][3]=981;
const book={SheetNames:['KHHGate'],Sheets:{KHHGate:{}}};
const win={document:doc,XLSX:{read:()=>book,utils:{sheet_to_json:()=>matrix}},sessionStorage:{getItem:()=>null},setTimeout(){}};
el('gateFile').files=[{name:'gate.xlsx',size:1200,arrayBuffer:async()=>new ArrayBuffer(8)}];
vm.runInNewContext(importer,{window:win,URL});
(async()=>{
 await el('gateFile').listeners.change();
 el('gatePreview').listeners.click();
 assert.equal(el('gatePreviewRows').children.length,2,'preview both dates');
 assert.equal(el('gateDe').textContent,'168');
 assert.equal(el('gatePe').textContent,'201');
 assert.equal(el('gateDl').textContent,'711');
 assert.equal(el('gatePl').textContent,'479');
 assert.equal(el('gateTotal').textContent,'1,559');
 assert.equal(el('gateTruck').textContent,'1,244');
 assert.equal(el('gateSave').disabled,true,'cloud save cannot be enabled without a verified live Gate backend');
 assert(el('gateMessage').textContent.includes('PORT79 管理員帳號'), 'missing login leaves preview available but disables write');
 // A configured user still must not be allowed to POST until the backend route exists.
 win.sessionStorage.getItem=(k)=>{
  if(k==='port79_user_session')return JSON.stringify({role:'superadmin',empId:'ADMIN'});
  if(k==='port79_user_token')return 'TEST-TOKEN';
  if(k==='port79_gas_url')return 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
  return null;
 };
 win.fetch=async()=>({ok:true,json:async()=>({ok:false,error:'未知操作: [gateStatsReadYear]。請檢查前端 action 參數'})});
 el('gatePreview').listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(el('gateSave').disabled,true,'unknown GAS action must prevent cloud POST');
 assert(el('gateMessage').textContent.includes('尚未部署 Gate 匯入服務'),'explain actual missing GAS route');
 // After the official backend publishes a confirmed read route, save becomes available.
 win.fetch=async()=>({ok:true,json:async()=>({
  ok:true,source:'port79-gate-daily',year:'2026',rows:[]
 })});
 el('gatePreview').listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(el('gateSave').disabled,false,'deployed GAS enables upload');
 assert(el('gateMessage').textContent.includes('正式 Gate 雲端查詢服務已驗證'));

 console.log('PASS: Gate preview, missing backend blocks upload, authenticated backend enables upload');
})().catch(error=>{console.error(error);process.exitCode=1;});
