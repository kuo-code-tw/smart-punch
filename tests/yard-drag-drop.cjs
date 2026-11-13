/* Browser-event simulation for drag-and-drop Yard Excel import.
 * Uses synthetic non-private inventory only, never cloud writes.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'yard-dashboard/yard-dashboard.js'),'utf8');
const html=fs.readFileSync(path.join(root,'yard-dashboard/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'yard-dashboard/yard-dashboard.css'),'utf8');
const parent=fs.readFileSync(path.join(root,'aqc-efficiency/index.html'),'utf8');
function createBrowser(authorized=true){
 const handlers=new Map(),nodes=new Map(),store=new Map();
 let matrix=null,allowOverwrite=false,confirmCount=0,readCount=0;
 function on(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);}
 function node(id){
  if(!nodes.has(id))nodes.set(id,{
   id,hidden:true,disabled:false,textContent:'',innerHTML:'',value:'',dataset:{},style:{},
   addEventListener(){},setAttribute(){},
   classList:{add(){},remove(){},toggle(){}},
   parentElement:{classList:{add(){},remove(){}}},
   querySelector:part=>node(id+' '+part)
  });
  return nodes.get(id);
 }
 const document={
  readyState:'loading',getElementById:node,
  addEventListener:on,querySelectorAll:()=>[],
  documentElement:{classList:{add(){}}}
 };
 const window={
  document,location:{search:''},
  sessionStorage:{getItem:key=>{
   if(!authorized)return null;
   if(key==='port79_user_session')return JSON.stringify({empId:'TEST-ADMIN',adminRole:'superadmin'});
   if(key==='port79_user_token')return 'TEST-TOKEN';
   return null;
  }},
  localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
  XLSX:{
   SSF:{parse_date_code:()=>null},
   utils:{sheet_to_json:sheet=>sheet.matrix},
   read:()=>{readCount++;return {SheetNames:['Yard'],Sheets:{Yard:{matrix}}};}
  },
  confirm:()=>{confirmCount++;return allowOverwrite;},
  addEventListener:on,
 };
 window.parent=window;
 vm.runInNewContext(source,{window,URLSearchParams,console},{timeout:5000});
 const listeners=handlers.get('DOMContentLoaded')||[];
 assert.equal(listeners.length,1);
 listeners[0]();
 function event(files,types=['Files']){
  const ev={dataTransfer:{types,files,dropEffect:'none'},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
  return ev;
 }
 function emit(name,ev){for(const fn of handlers.get(name)||[])fn(ev);return ev;}
 return {window,nodes,store,event,emit,node,api:window.P79YardDashboard,
  setMatrix:m=>{matrix=m;},setOverwrite:b=>{allowOverwrite=b;},
  get confirmCount(){return confirmCount;},get readCount(){return readCount;}
 };
}
function workbook(fieldRows,import20=1){
 const matrix=Array.from({length:77},()=>Array(3).fill(null));
 matrix[0][2]='2026-11-13';
 matrix[1][0]='重櫃';matrix[2][0]='進口櫃';
 matrix[28][0]='空櫃';matrix[76][0]='Long-Stay 合計';
 const data=Object.fromEntries(Object.keys(fieldRows).map(k=>[k,0]));
 Object.assign(data,{
  imp20:import20,impTeu:1,heavyTotal:1,heavyCap:100,heavyPct:1,
  heavyPlug20Cap:10,heavyPlug40Cap:10,
  emptyTotal:0,emptyCap:100,emptyPct:0,
  pti20Cap:10,pti40Cap:10
 });
 for(const [key,row] of Object.entries(fieldRows))matrix[row-1][2]=data[key];
 return matrix;
}
const excel={name:'yard.xlsx',size:1024,arrayBuffer:async()=>new ArrayBuffer(8)};
const flush=async()=>{for(let n=0;n<6;n++)await new Promise(done=>setTimeout(done,0));};
(async()=>{
 assert.match(html,/yardDropOverlay/,'drop feedback overlay available');
 assert.match(html,/yardDropHint/,'visible drop instruction available');
 assert.match(html,/yard-dashboard\.js\?v=20261113-home-size-cards-v1/,'script cache revision');
 assert.match(html,/yard-dashboard\.css\?v=20261113-home-size-cards-v1/,'style cache revision');
 assert.match(css,/yard-drop-overlay\[hidden\]\{display:none!important\}/,'hidden overlay does not block page');
 assert.match(parent,/20261113-yard-home-size-cards-v1/,'embedded iframe refreshes cached Yard page');

 const b=createBrowser();
 b.setMatrix(workbook(b.api.fieldRows));
 const drag=b.emit('dragenter',b.event([]));
 assert.equal(drag.defaultPrevented,true,'browser must not navigate to dragged workbook');
 assert.equal(b.node('yardDropOverlay').hidden,false,'dragging file activates overlay');
 const over=b.emit('dragover',b.event([]));
 assert.equal(over.defaultPrevented,true);
 assert.equal(over.dataTransfer.dropEffect,'copy');
 const leave=b.emit('dragleave',b.event([]));
 assert.equal(b.node('yardDropOverlay').hidden,true,'leaving page clears overlay');
 const textDrag=b.emit('dragenter',b.event([],['text/plain']));
 assert.equal(textDrag.defaultPrevented,false,'ordinary text dragging remains intact');

 b.emit('dragenter',b.event([]));
 const dropped=b.emit('drop',b.event([excel]));
 assert.equal(dropped.defaultPrevented,true);
 assert.equal(b.node('yardDropOverlay').hidden,true);
 await flush();
 assert.match(b.node('yardStatus').textContent,/已匯入 1 天/);
 assert.equal(b.readCount,1);
 let saved=JSON.parse([...b.store.values()][0]);
 assert.equal(saved.rows.length,1);
 assert.equal(saved.rows[0].imp20,1,'validated private data kept browser-local');
 assert.match(b.node('yardSource').textContent,/僅目前瀏覽器，非雲端同步/);

 const wrong=b.emit('drop',b.event([{...excel,name:'yard.txt'}]));
 assert.equal(wrong.defaultPrevented,true);
 assert.match(b.node('yardStatus').textContent,/僅支援/);
 assert.equal(b.readCount,1,'invalid extension must not reach parser');
 b.emit('drop',b.event([excel,excel]));
 assert.match(b.node('yardStatus').textContent,/每次只能拖入一個/);
 assert.equal(b.readCount,1,'multiple workbooks must not silently pick first');
 b.emit('drop',b.event([{...excel,size:13*1024*1024}]));
 assert.match(b.node('yardStatus').textContent,/12 MB/);
 assert.equal(b.readCount,1,'oversized workbook must not be parsed');

 b.setMatrix(workbook(b.api.fieldRows,2));
 b.emit('drop',b.event([excel]));
 await flush();
 assert.equal(b.confirmCount,1,'different saved date requires overwrite confirmation');
 assert.match(b.node('yardStatus').textContent,/已取消覆蓋/);
 saved=JSON.parse([...b.store.values()][0]);
 assert.equal(saved.rows[0].imp20,1,'cancel must keep old data');
 b.setOverwrite(true);
 b.emit('drop',b.event([excel]));
 await flush();
 saved=JSON.parse([...b.store.values()][0]);
 assert.equal(saved.rows[0].imp20,2,'confirmed overwrite replaces same day, never adds twice');
 assert.equal(saved.rows.length,1);
 assert.equal(b.confirmCount,2);

 let release;
 const pending=new Promise(resolve=>{release=resolve;});
 const slow={...excel,arrayBuffer:()=>pending};
 b.emit('drop',b.event([slow]));
 b.emit('drop',b.event([excel]));
 assert.match(b.node('yardStatus').textContent,/Excel 正在匯入與核對中/);
 assert.equal(b.readCount,3,'concurrent dropped workbook must not start a second parse');
 release(new ArrayBuffer(8));
 await flush();
 assert.equal(b.readCount,4,'first in-flight workbook completes');

 const locked=createBrowser(false);
 locked.setMatrix(workbook(locked.api.fieldRows));
 assert.equal(locked.node('yardImport').disabled,true);
 const unauthorized=locked.emit('drop',locked.event([excel]));
 assert.equal(unauthorized.defaultPrevented,true);
 assert.match(locked.node('yardStatus').textContent,/請先登入/);
 assert.equal(locked.readCount,0);
 assert.equal(locked.store.size,0,'unauthorized drag cannot save private inventory');
 console.log('PASS Yard drag-drop: overlay, import, authentication, types, single-file, limit, busy guard, overwrite confirmation, local-only storage, embed cache');
})().catch(err=>{console.error(err);process.exitCode=1;});
