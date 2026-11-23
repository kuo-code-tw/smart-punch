'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const src=fs.readFileSync('assets/port79-monthly-rest-dashboard.js','utf8');
const official=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
new vm.Script(src);
new vm.Script(official);

// Extract the actual installed observers so the test executes production code,
// rather than only checking for the spelling of the fixed options.
const start=src.indexOf(' const observers=[];');
const end=src.indexOf(' // If an upstream request remains unresolved',start);
assert(start>=0&&end>start,'observer installation is present');
const fragment=src.slice(start,end);
const seen=[];
let renders=0;
class StrictBrowserMutationObserver {
 constructor(callback){this.callback=callback;}
 observe(node,options){
  // DOM Standard: explicitly setting attributes:false alongside
  // attributeFilter MUST throw TypeError.
  if(Object.hasOwn(options,'attributeFilter')&&options.attributes===false)
   throw new TypeError('attributeFilter may not coexist with attributes:false');
  if(Object.hasOwn(options,'attributeOldValue')&&options.attributes===false)
   throw new TypeError('attributeOldValue may not coexist with attributes:false');
  assert(options.childList||options.attributes||options.characterData,'observer has at least one event kind');
  seen.push({selector:node.selector,options,callback:this.callback});
 }
 disconnect(){}
}
const nodes=new Map(
 ['#mrRows','#mrPlannedRows','#mrExistingRows','#mrNeedRows',
  '#mrAutoSupplementRows','#mrAuditSummary','#mrStatus','#mrSave','#mrSavePlans']
  .map(selector=>[selector,{selector}])
);
const sandbox={el:{},$:(_el,selector)=>nodes.get(selector),
 MutationObserver:StrictBrowserMutationObserver,
 render:()=>{renders++;}};
vm.createContext(sandbox);
vm.runInContext(fragment,sandbox);
assert.equal(seen.length,9,'all nine observers must install without throwing');
for(const entry of seen){
 const isButton=['#mrSave','#mrSavePlans'].includes(entry.selector);
 assert.equal(entry.options.childList,true);
 if(isButton){
  assert.equal(entry.options.attributes,true,'button state is watched');
  assert.deepEqual([...entry.options.attributeFilter],['disabled']);
 }else{
  assert.equal(Object.hasOwn(entry.options,'attributeFilter'),false,
   'non-attribute observer must omit attributeFilter altogether');
 }
}
seen.find(x=>x.selector==='#mrStatus').callback([]);
seen.find(x=>x.selector==='#mrRows').callback([]);
seen.find(x=>x.selector==='#mrAuditSummary').callback([]);
assert.equal(renders,3,'loading/status and final data changes rerender KPIs');
assert(src.includes("const originalState=text(el,'#mrStatus');"),'display true load/errors');
assert(src.includes("const sourceLoaded=!!text(el,'#mrAuditSummary');"),'never invent zero when load is pending');
assert(src.includes('render();\n}'), 'initial render is reached once observers are installed');
assert(official.includes('g.P79MonthlyRestDashboard?.mount(el)'),'dashboard is mounted in the real monthly modal');
assert(official.includes('if(!fullDayEvidence(fresh,r.empId,r.date,attendance[0]))'),'8-hour official guard intact');
console.log('PASS monthly dashboard initializes all browser observers, renders initial/loading/complete/error state and retains official safeguards');
