'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const shared=fs.readFileSync('assets/port79-management-workspace.css','utf8');
const home=fs.readFileSync('assets/port79-home-original-shell.css','utf8');
const leave=fs.readFileSync('assets/port79-leave-unified-sidebar.css','utf8');
const schedule=fs.readFileSync('assets/port79-schedule-reference-design.css','utf8');
const js=fs.readFileSync('assets/port79-management-workspace.js','utf8');

const pages=[
 'index.html','attendance/index.html','schedule/index.html','aqc-efficiency/index.html',
 'hr/index.html','work-hours/index.html','leave/index.html','history-data/index.html'
];

// Every system must load the exact same sidebar and toggle implementation.
for(const path of pages){
 const html=fs.readFileSync(path,'utf8');
 assert(html.includes('port79-management-workspace.css'),path+' needs shared sidebar CSS');
 assert(html.includes('port79-management-workspace.js'),path+' needs shared hamburger behavior');
}
assert(js.includes("d.body.classList.toggle('p79-nav-collapsed')"),
 'desktop button toggles the same collapse class used by all systems');
assert(js.includes("d.body.classList.toggle('p79-nav-open')"),
 'mobile button continues to use a separate drawer state');

// The body padding, topbar left offset, and sidebar width all derive from
// the same CSS variable. Removing the variable must widen the whole viewport.
assert(shared.includes('padding:78px 0 0 var(--p79-w-width)!important'),
 'shared desktop body padding must follow sidebar width');
assert(shared.includes('left:var(--p79-w-width)!important;right:0!important'),
 'topbar must follow sidebar width');
assert(shared.includes('width:var(--p79-w-width)!important'),
 'sidebar width must use shared variable');
const desktop=shared.match(/@media screen and \(min-width:901px\)\s*\{([\s\S]*?)\n\}/g)||[];
assert(desktop.some(rule=>rule.includes('p79-nav-collapsed{--p79-w-width:0px!important}')),
 'desktop collapse must release reserved width');
assert(desktop.some(rule=>rule.includes('p79-nav-collapsed')&&rule.includes('display:none!important')),
 'collapsed desktop sidebar must be fully hidden, not merely translated');
assert(!shared.includes('p79-nav-collapsed{--p79-w-width:230px!important}'),
 'never retain an invisible 230px gutter');

// Page-specific themes must not reintroduce fixed-width collapse.
assert(home.includes('body.p79-workspace:has(#systems.show).p79-nav-collapsed{--p79-w-width:0px!important}'),
 'home dashboard overrides its more specific fixed-width rule');
assert(leave.includes('body.p79-workspace[data-p79-system="leave"].p79-nav-collapsed{') &&
       leave.includes('--p79-w-width:0px!important;padding-left:0!important'),
 'leave form overrides its own explicit 230px body padding');
assert(schedule.includes('body.p79-workspace[data-p79-system="schedule"].p79-nav-collapsed{') &&
       schedule.includes('--p79-w-width:0px!important'),
 'schedule reference theme overrides its fixed-width sidebar');

// The mobile slide-out must remain independent of the desktop collapse.
assert(shared.includes('max-width:900px'),'mobile drawer breakpoint retained');
assert(shared.includes('p79-nav-open')&&shared.includes('transform:translateX(0)!important'),
 'mobile drawer must still open and close');
assert(js.includes("if(mobile){d.body.classList.remove('p79-nav-collapsed')"),
 'mobile never inherits desktop collapse');
assert(js.includes("else{d.body.classList.remove('p79-nav-open')"),
 'desktop never inherits mobile drawer');

console.log('PASS hamburger full-width restoration across home and 7 systems, desktop and mobile');
