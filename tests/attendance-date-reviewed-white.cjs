'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('assets/port79-attendance-date-overtime-menu.js','utf8');
new vm.Script(code);
assert(!code.includes('paintReviews'), '人工查核不得改寫正式日期背景');
assert(!code.includes('::after'), '日期不應被人工查核加入勾號');
assert(!code.includes('日期變白色'), '人工查核不能宣稱一定變成白色');
const date='2026-10-28',key='p79.attendance.date.reviewed.v1';
const stored=new Map(),alerts=[];
function boot(){
 const nodes=[],listeners={},windowListeners={};
 function element(tag){
  return {tag,style:{},children:[],isConnected:true,offsetWidth:230,offsetHeight:170,
   addEventListener(type,fn){(this.listeners??={})[type]=fn},
   append(...items){this.children.push(...items)},
   appendChild(item){this.children.push(item)},
   remove(){this.isConnected=false}};
 }
 const document={
  body:{appendChild:e=>nodes.push(e)},
  createElement:element,
  getElementById:id=>nodes.find(x=>x.id===id&&x.isConnected)||null,
  addEventListener:(k,fn)=>{listeners[k]=fn}
 };
 const window={localStorage:{
  getItem:k=>stored.get(k)||null,
  setItem:(k,v)=>stored.set(k,v)
 },addEventListener:(k,fn)=>{windowListeners[k]=fn},
 P79AttendanceOvertimeExport:{openReported(){}}};
 vm.runInNewContext(code,{document,window,location:{href:'https://example.test/attendance/'},
  URL,innerWidth:1200,innerHeight:800,setTimeout(){},MutationObserver:class{},alert:x=>alerts.push(x)});
 function rightclick(){
  const b={getAttribute:k=>k==='data-p79-attendance-date'?date:null};
  b.closest=s=>s.includes('p79AttendanceDateStrip')?b:null;
  let prevented=false;
  listeners.contextmenu({target:b,preventDefault(){prevented=true},stopPropagation(){},clientX:40,clientY:40});
  assert(prevented);
  return nodes.at(-1);
 }
 return {nodes,rightclick};
}
let page=boot(),menu=page.rightclick();
let review=menu.children.find(x=>String(x.textContent).includes('標記已查核'));
assert(review,'右鍵仍可標記人工查核');
assert(menu.children.some(x=>String(x.textContent).includes('已申報')),'保留正式申報查詢');
assert(menu.children.some(x=>String(x.textContent).includes('列印／匯出')),'保留正式匯出');
review.listeners.click();
assert.deepEqual(JSON.parse(stored.get(key)),[date],'只保存人工查核日期');
page=boot();menu=page.rightclick();
review=menu.children.find(x=>String(x.textContent).includes('取消已查核'));
assert(review,'重新進入仍保留人工查核狀態');
review.listeners.click();
assert.deepEqual(JSON.parse(stored.get(key)),[],'可取消人工查核');
assert.deepEqual(alerts,[],'沒有本機儲存失敗');
console.log('PASS: 人工查核可保存/取消，但不覆蓋白綠黃紅申報顏色、不加勾號');
