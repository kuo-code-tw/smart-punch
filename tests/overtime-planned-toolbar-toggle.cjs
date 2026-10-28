'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');

assert.match(html,/＋ 申報加班<\/button>\s*<button id="p79OvertimePlannedToggle"/,'toolbar button follows 申報加班');
assert.match(html,/<button id="p79OvertimePlannedToggle"[^>]+aria-controls="p79OvertimePlannedSection" aria-expanded="false"/,'accessible default collapsed state');
assert.match(html,/<section id="p79OvertimePlannedSection" hidden/,'original planned section is initially hidden');
assert.match(html,/#adminContentOvertime #p79OvertimePlannedSection\[hidden\]\{display:none!important\}/,'hidden visibility enforced');
assert(html.includes("toggle.textContent='預排／待核對（'+rows.length+'）'"),'button shows filtered count');
assert.match(html,/onclick="p79ToggleOvertimePlanned\(\)"[^>]*>收合<\/button>/,'panel can be closed');
assert(html.includes("p79OpenPlannedOvertimeReview('+index+')"),'review action preserved');

const start=html.indexOf('function p79ToggleOvertimePlanned(){');
const end=html.indexOf('\n        }',start);
assert(start>0&&end>start,'toggle handler exists');
const code=html.slice(start,end+10);
const attrs=new Map([['hidden','']]);
const scrollCalls=[];
const section={
 hasAttribute:name=>attrs.has(name),
 removeAttribute:name=>attrs.delete(name),
 setAttribute:(name,value)=>attrs.set(name,value),
 scrollIntoView:options=>scrollCalls.push(options)
};
const buttonAttrs=new Map([['aria-expanded','false']]);
const button={setAttribute:(name,value)=>buttonAttrs.set(name,value),title:''};
const ctx={
 document:{getElementById:id=>id==='p79OvertimePlannedSection'?section:id==='p79OvertimePlannedToggle'?button:null}
};
vm.createContext(ctx);
vm.runInContext(code,ctx);
ctx.p79ToggleOvertimePlanned();
assert.equal(attrs.has('hidden'),false,'click reveals original panel');
assert.equal(buttonAttrs.get('aria-expanded'),'true','button reflects expanded state');
assert.equal(scrollCalls.length,1,'opening scrolls to panel');
ctx.p79ToggleOvertimePlanned();
assert.equal(attrs.has('hidden'),true,'second click collapses panel');
assert.equal(buttonAttrs.get('aria-expanded'),'false','button reflects collapsed state');
assert.equal(scrollCalls.length,1,'closing does not scroll back unexpectedly');
console.log('PASS planned review toolbar opens and closes original panel without changing report flow');
