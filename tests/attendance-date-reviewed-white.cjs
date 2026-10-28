'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('assets/port79-attendance-date-overtime-menu.js','utf8');
new vm.Script(code);
assert(!code.includes('paintReviews'),'查核不得強制改白色');
assert(!code.includes('::after'),'查核不得附加勾號');
const date='2026-10-12',alerts=[],marks=new Set(),calls=[];
function boot(){
 const nodes=[],listeners={};
 function element(tag){
  return {tag,style:{},children:[],isConnected:true,offsetWidth:230,offsetHeight:170,
   addEventListener(type,fn){(this.listeners??={})[type]=fn},
   append(...items){this.children.push(...items)},
   appendChild(item){this.children.push(item)},
   remove(){this.isConnected=false}};
 }
 const document={body:{appendChild:e=>nodes.push(e)},createElement:element,
  getElementById:id=>nodes.find(x=>x.id===id&&x.isConnected)||null,
  addEventListener:(k,fn)=>{listeners[k]=fn}};
 const window={addEventListener(){},P79AttendanceOvertimeExport:{openReported(){}},
  P79AttendanceOvertimeDayStatus:{
   isReviewed:d=>marks.has(d),
   markReviewed(d,checked){calls.push([d,checked]);if(checked)marks.add(d);else marks.delete(d);return true;}
  }};
 vm.runInNewContext(code,{document,window,location:{href:'https://example.test/attendance/'},
  URL,innerWidth:1200,innerHeight:800,setTimeout(){},MutationObserver:class{},alert:x=>alerts.push(x)});
 function rightclick(){
  const b={getAttribute:k=>k==='data-p79-attendance-date'?date:null};
  b.closest=s=>s.includes('p79AttendanceDateStrip')?b:null;
  let prevented=false;
  listeners.contextmenu({target:b,preventDefault(){prevented=true},stopPropagation(){},clientX:40,clientY:40});
  assert(prevented);return nodes.at(-1);
 }
 return {rightclick};
}
let page=boot(),menu=page.rightclick();
let review=menu.children.find(x=>String(x.textContent).includes('已查核'));
assert(review.textContent.includes('有效申報顯示綠色'));
assert(menu.children.some(x=>String(x.textContent).includes('已申報')),'保留正式申報查詢');
assert(menu.children.some(x=>String(x.textContent).includes('列印／匯出')),'保留報表匯出');
review.listeners.click();
assert(marks.has(date));
page=boot();menu=page.rightclick();
review=menu.children.find(x=>String(x.textContent).includes('取消已查核'));
assert(review);
review.listeners.click();
assert(!marks.has(date));
assert.deepEqual(calls,[[date,true],[date,false]]);
assert.deepEqual(alerts,[]);
console.log('PASS: 右鍵查核會綁定目前正式版本，取消可復原，不強制白底或加勾');
