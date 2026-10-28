'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('assets/port79-attendance-date-overtime-menu.js','utf8');
new vm.Script(code);
const date='2026-10-28', key='p79.attendance.date.reviewed.v1';
const stored=new Map(),alerts=[];
function boot(){
 const nodes=[],listeners={},wins={},head=[];
 function element(tag){
  return {tag,style:{},children:[],isConnected:true,offsetWidth:230,offsetHeight:170,
   addEventListener(type,fn){(this.listeners??={})[type]=fn},
   append(...items){this.children.push(...items)},
   appendChild(item){this.children.push(item)},
   remove(){this.isConnected=false}};
 }
 const document={
  head:{appendChild:e=>head.push(e)},
  body:{appendChild:e=>nodes.push(e)},
  createElement:element,
  getElementById(id){return [...head,...nodes].find(x=>x.id===id&&x.isConnected)||null},
  addEventListener(k,fn){listeners[k]=fn}
 };
 const window={localStorage:{
  getItem(k){return stored.get(k)||null},
  setItem(k,v){stored.set(k,v)}
 },addEventListener(k,fn){wins[k]=fn},P79AttendanceOvertimeExport:{openReported(){}}};
 vm.runInNewContext(code,{document,window,location:{href:'https://example.test/attendance/'},
  URL,innerWidth:1200,innerHeight:800,setTimeout(){},MutationObserver:class{},alert:x=>alerts.push(x)});
 function rightclick(){
  const button={getAttribute:k=>k==='data-p79-attendance-date'?date:null};
  button.closest=sel=>sel.includes('p79AttendanceDateStrip')?button:null;
  let prevented=false;
  listeners.contextmenu({target:button,preventDefault(){prevented=true},stopPropagation(){},clientX:40,clientY:40});
  assert(prevented);
  return nodes.at(-1);
 }
 return {head,nodes,listeners,rightclick,wins};
}
let view=boot();
let menu=view.rightclick();
const review=menu.children.find(x=>String(x.textContent).includes('已查核'));
assert(review,'review action in date right-click menu');
assert(menu.children.some(x=>String(x.textContent).includes('已申報')),'existing official report lookup intact');
assert(menu.children.some(x=>String(x.textContent).includes('列印／匯出')),'existing print/export intact');
assert(review.textContent.includes('日期變白色'));
review.listeners.click();
assert.deepEqual(JSON.parse(stored.get(key)),[date],'saved date only, no GAS operations');
let css=view.head.at(-1).textContent;
assert(css.includes('background-color:#fff!important'));
assert(css.includes('[data-p79-attendance-date="'+date+'"]'));
view=boot();
menu=view.rightclick();
const cancel=menu.children.find(x=>String(x.textContent).includes('取消已查核'));
assert(cancel,'state restored after page reload');
cancel.listeners.click();
assert.deepEqual(JSON.parse(stored.get(key)),[],'review removal persists');
assert(!view.head.at(-1).textContent.includes('[data-p79-attendance-date="'+date+'"]'),'original colors restored');
assert.deepEqual(alerts,[],'storage successful');
console.log('PASS: 日期右鍵已查核/取消；白色樣式可跨重繪；同一瀏覽器重開仍保留；不改正式申報');
