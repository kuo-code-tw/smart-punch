/* Guard the employee punch/login boundary of the new presentation-only shell. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const js=fs.readFileSync('assets/port79-management-workspace.js','utf8');
function excluded({system='',shown=false,session=null,classes=[]}){
 let creations=0;const active=new Set();const classList={toggle(k,on){on?active.add(k):active.delete(k)},remove(...ks){ks.forEach(k=>active.delete(k))}};
 const body={dataset:system?{p79System:system}:{},classList};
 const document={body,documentElement:{classList:{contains:k=>classes.includes(k)}},readyState:'complete',getElementById:id=>id==='systems'?{classList:{contains:()=>shown}}:null,createElement(){creations++;throw Error('employee/login DOM must not be rebuilt')},addEventListener(){}};
 const context={document,sessionStorage:{getItem:()=>session?JSON.stringify(session):null},MutationObserver:class{observe(){}},window:{addEventListener(){}},requestAnimationFrame(){throw Error('no layout mutation is scheduled by this fixture')}};
 vm.runInNewContext(js,context);assert.equal(creations,0);assert(!active.has('p79-workspace'));
}
excluded({});excluded({shown:true,session:{adminRole:'employee'}});excluded({shown:true,session:{adminRole:'admin',punchOnly:true}});excluded({system:'attendance'});excluded({system:'attendance',classes:['p79-punch-only','p79-attendance-management-chrome']});
assert(!/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(|\b(?:localStorage|sessionStorage)\.(?:setItem|removeItem|clear)\s*\(/.test(js),'presentation layer cannot read/write cloud records or mutate persisted session');
for(const page of ['index.html','attendance/index.html','work-hours/index.html','schedule/index.html','leave/index.html','hr/index.html','aqc-efficiency/index.html','history-data/index.html']){
 const s=fs.readFileSync(page,'utf8');const css=s.indexOf('port79-management-workspace.css'),script=s.indexOf('port79-management-workspace.js');
 assert(css>s.lastIndexOf('port79-vessel-theme.css'),page+' final presentation must override the old theme');assert(script>css&&script<s.lastIndexOf('</body>'),page+' presentation is loaded once at end of the existing page');assert.equal((s.match(/port79-management-workspace\.js/g)||[]).length,1,page);
}
// Regression: wide work-hours day tables must never horizontally scroll the
// document underneath the fixed sidebar; only table wrappers can scroll.
const workspaceCss=fs.readFileSync('assets/port79-management-workspace.css','utf8');
const scopedStart=workspaceCss.indexOf('/* Work-hours: wide 31-day grids');
assert(scopedStart>=0,'workhours sidebar overflow guard exists');
const scoped=workspaceCss.slice(scopedStart);
assert(scoped.includes('html:has(>body.p79-workspace[data-p79-system="workhours"])'),'root overflow guard restricted to workhours');
assert(scoped.includes('overflow-x:clip!important'),'page horizontal overflow is clipped');
assert(scoped.includes('padding-left:var(--p79-w-width)!important'),'body remains offset by persistent sidebar');
assert(scoped.includes('min-width:0!important'),'admin flex/grid children shrink inside viewport');
assert(scoped.includes('.p79-stats-table-wrap,.overflow-x-auto'),'wide tables keep independent horizontal scrolling');
assert(scoped.includes('overflow-x:auto!important'),'tables still horizontally scroll locally');
assert(!scoped.includes('left:-'),'workhours view never translated left beneath sidebar');
console.log('PASS presentation isolation: employee login/punch untouched, no API/storage writes, final stylesheet precedence on all eight pages');
