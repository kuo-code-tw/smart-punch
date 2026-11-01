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

/* The homepage and all internal pages must show the same seven real modules.
   'Reports' and 'Settings' used to be misleading homepage-only aliases. */
const navigation=fs.readFileSync('assets/port79-management-workspace.js','utf8');
const seven=fs.readFileSync('assets/port79-seven-top.js','utf8');
const orderMatch=navigation.match(/const order=\[([^\]]+)\]/);
assert(orderMatch,'canonical order declared');
const homeOrder=orderMatch[1].split(',').map(t=>t.replace(/['"\s]/g,''));
const expected=['attendance','schedule','efficiency','hr','workhours','leave','history'];
assert.deepEqual(homeOrder,expected,'home canonical ordering');
const navBlock=seven.slice(seven.indexOf('const NAV=['),seven.indexOf('const SYSTEMS=',seven.indexOf('const NAV=[')));
const internal=[...navBlock.matchAll(/\['([^']+)','[^']+','([^']+)','[^']+'\]/g)].map(x=>({key:x[1],name:x[2]}));
assert.deepEqual(internal.map(x=>x.key),expected,'system sidebar must use exact homepage order');
const labels={attendance:'考勤管理',schedule:'排班管理',efficiency:'船舶作業管理',
 hr:'人資管理',workhours:'工時與加班管理',leave:'請假管理',history:'歷史資料庫'};
assert.deepEqual(internal.map(x=>x.name),expected.map(k=>labels[k]));
for(const key of expected)assert(navigation.includes(key+':['+JSON.stringify(labels[key]).replace(/"/g,"'")),key+' label comes from one shared metadata record');
assert(!navigation.includes("const aliases="),'fake homepage-only report/settings shortcuts removed');
assert(!navigation.includes("alias=x.dataset.p79Alias"),'homepage special sorting removed');
assert(navigation.includes('return key?order.indexOf(key):order.length;'),'both menus use shared canonical ordering');
assert(navigation.includes('source.click();'),'homepage links retain existing permission checks and SSO navigation');
assert(navigation.includes('function homeNavAllowed(key,source)'),'home menu must not filter by transient disabled/hidden card state');
assert(navigation.includes('window.launchSystem(key)'),'home menu must use the original permission-checked SSO path');
assert(navigation.includes("attributeFilter:['hidden','disabled','style']"),'home sidebar must update when permissions refresh');
for(const page of ['index.html','attendance/index.html','work-hours/index.html','schedule/index.html','aqc-efficiency/index.html','hr/index.html','leave/index.html','history-data/index.html']){
 const html=fs.readFileSync(page,'utf8');
 assert(html.includes('port79-management-workspace.js?v='+(page==='index.html'?'20261101-home-overtime-leave-v4':'20261101-unified-sidebar-v2')),page+' refreshes the shared nav script');
 if(page!=='index.html')
  assert(html.includes('port79-seven-top.js?v=20261101-unified-sidebar-v2'),page+' refreshes the permission-controlled nav');
}

// Work-hours had TWO older viewport break-out rules applied with :has(), which
// outranked the shared CSS and moved the whole report beneath the fixed sidebar.
// These are not allowed in either overtime or attendance-statistics tabs.
const whSource=fs.readFileSync('work-hours/index.html','utf8');
for(const kind of ['Stats','Overtime']){
 const rule='body.p79-work-hours-page #viewAdmin:has(#adminContent'+kind+':not(.hidden))';
 assert(whSource.includes(rule),'workhours responsive layout exists: '+kind);
}
assert(!whSource.includes('margin-left:calc(50% - 50vw + 12px)'),
  'no negative full-viewport centering that slides report under persistent sidebar');
const whMonthCss=whSource.slice(whSource.indexOf('<style id="p79-monthly-attendance-wider'),whSource.indexOf('</style>',whSource.indexOf('<style id="p79-monthly-attendance-wider')));
const whOvertimeCss=whSource.slice(whSource.indexOf('<style id="p79-overtime-wide'),whSource.indexOf('</style>',whSource.indexOf('<style id="p79-overtime-wide')));
for(const css of [whMonthCss,whOvertimeCss]){
 assert(css.includes('width:100%!important'),'main report width follows content container');
 assert(css.includes('margin-left:0!important'),'main report has no negative centering');
 assert(css.includes('box-sizing:border-box!important'),'report does not overflow from padding');
 assert(!css.includes('100vw - 24px'),'report never expands beyond sidebar-adjusted content width');
}
console.log('PASS workhours 2 visible tabs: no viewport-wide negative margins or full-page horizontal overlap');

console.log('PASS homepage/subsystems share same actual seven modules, labels, order, permissions and cache version');

console.log('PASS presentation isolation: employee login/punch untouched, no API/storage writes, final stylesheet precedence on all eight pages');
