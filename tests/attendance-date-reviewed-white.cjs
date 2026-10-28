'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('assets/port79-attendance-date-overtime-menu.js','utf8');
new vm.Script(code);
assert(!code.includes('paintReviews'),'查核不得強制變白色');
assert(!code.includes('::after'),'查核不得附加勾號');
const day='2026-10-12',alerts=[],marks=new Set(),calls=[],responses=[];
const nodes=[],listeners={},button={getAttribute:k=>k==='data-p79-attendance-date'?day:null,
 closest:s=>s.includes('p79AttendanceDateStrip')?button:null};
function element(tag){
 return {tag,style:{},children:[],isConnected:true,offsetWidth:230,offsetHeight:170,
  addEventListener(type,fn){(this.listeners??={})[type]=fn},
  append(...items){this.children.push(...items)},appendChild(item){this.children.push(item)},
  setAttribute(){},remove(){this.isConnected=false}};
}
const strip={appendChild(x){nodes.push(x)}};
const document={body:{appendChild:e=>nodes.push(e)},createElement:element,
 getElementById:id=>id==='p79AttendanceDateStrip'?strip:nodes.find(x=>x.id===id&&x.isConnected)||null,
 addEventListener:(k,fn)=>{listeners[k]=fn}};
const win={addEventListener(){},P79AttendanceOvertimeExport:{openReported(){}},
 P79AttendanceOvertimeDayStatus:{
  isReviewed:d=>marks.has(d),
  async recheckAndMarkReviewed(d,checked){
   calls.push([d,checked]);if(checked)marks.add(d);else marks.delete(d);
   return {ok:true,message:d+' 已重新核對雲端，申報有效'};
  }
 }};
vm.runInNewContext(code,{document,window:win,location:{href:'https://example.test/attendance/'},
 URL,innerWidth:1200,innerHeight:800,setTimeout(){},MutationObserver:class{},alert:x=>alerts.push(x)});
function rightclick(){
 let prevented=false;
 listeners.contextmenu({target:button,preventDefault(){prevented=true},stopPropagation(){},clientX:40,clientY:40});
 assert(prevented);return nodes.findLast(x=>x.id==='p79AttendanceDateOvertimeMenu'&&x.isConnected);
}
(async()=>{
 let menu=rightclick(),review=menu.children.find(x=>String(x.textContent).includes('查核完成'));
 assert(review,'右鍵有明確的查核動作');
 assert(menu.children.some(x=>String(x.textContent).includes('唯讀，不變色')),'已申報查看不會誤導使用者');
 assert(menu.children.some(x=>String(x.textContent).includes('列印／匯出')),'保留匯出功能');
 await review.listeners.click();
 // Click callback intentionally does not return a promise; resolve the continuation.
 await new Promise(resolve=>setImmediate(resolve));
 assert(marks.has(day),'查核完成');
 menu=rightclick();review=menu.children.find(x=>String(x.textContent).includes('取消已查核'));
 assert(review);
 review.listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert(!marks.has(day),'取消查核');
 assert.deepEqual(calls,[[day,true],[day,false]]);
 assert.deepEqual(alerts,[]);
 assert(nodes.some(x=>x.id==='p79AttendanceReviewFeedback'&&String(x.textContent).includes('已重新核對雲端')),'查核訊息需持續顯示在日期列');
 console.log('PASS: cloud recheck on right-click; clear feedback; cancel supported; no white override or checkmark');
})().catch(e=>{console.error(e);process.exitCode=1});
