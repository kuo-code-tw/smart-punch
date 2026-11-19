'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const page=fs.readFileSync('leave/index.html','utf8');
const fix=fs.readFileSync('assets/port79-leave-unified-sidebar.css','utf8');
const shared=fs.readFileSync('assets/port79-management-workspace.css','utf8');
const top=fs.readFileSync('assets/port79-seven-top.js','utf8');
new vm.Script(top,{filename:'port79-seven-top.js'});
const oldVisual=page.indexOf('port79-leave-reference-visual.css');
const oldExact=page.indexOf('port79-leave-exact-reference.css');
const override=page.indexOf('port79-leave-unified-sidebar.css?');
assert(oldVisual>=0&&oldExact>oldVisual&&override>oldExact,
 'leave-only reference skins must load before shared-sidebar correction');
assert.equal(page.match(/port79-leave-unified-sidebar\.css\?/g)?.length,1,
 'only one final sidebar override may be loaded');
assert(fix.includes('body.p79-workspace[data-p79-system="leave"]'),
 'only the leave management page may receive the sidebar correction');
for(const part of ['#p79SevenTop.p79-workspace-sidebar','#p79SevenNav a',
 '#p79SevenNav a:is(.active,[aria-current="page"],:hover)',
 '#p79SevenTop .p79-workspace-brand:after','#p79SevenTop .p79-workspace-brand strong',
 '#p79SevenTop .p79-workspace-brand small','#p79SevenTop .p79-port-mark',
 '#p79SevenTop .p79-sidebar-footer','.p79-nav-open','.p79-nav-collapsed'])
 assert(fix.includes(part),'expected common sidebar selector: '+part);
assert(fix.includes('content:none!important'),
 'the leave-only fake 排班考勤系統 brand must disappear');
assert(fix.includes('display:block!important;color:#16385f'),
 'the real common brand text must be displayed');
assert(fix.includes('width:230px!important')&&fix.includes('padding-left:230px!important'),
 'leave admin must align with the 230px shared desktop sidebar');
assert(shared.includes('--p79-w-width:230px!important'),
 'the unified sidebar must match the shared workspace width');
assert(fix.includes('--p79-w-width:0px!important;padding-left:0!important;'),
 'leave page must remove the reserved desktop gutter on hamburger collapse');
assert(shared.includes('background:#d8ebff!important;color:#0667b3!important'),
 'the shared light active state must exist');
assert(shared.includes('background:#26496e!important;color:#ffffff!important'),
 'the shared dark active state must exist');
assert(fix.includes('background:#d8ebff!important;color:#0667b3!important')&&
       fix.includes('background:#26496e!important;color:#fff!important'),
 'leave selected-link colors must match other systems in both themes');
assert(fix.includes('width:min(230px,84vw)!important')&&
       fix.includes('transform:translateX(0)!important'),
 'mobile sidebar must slide in at the same width as the shared drawer');
assert(/\['leave','📝','請假管理','\.\.\/leave\/'\]/.test(top),
 'original permission-filtered navigation path for leave must remain');
assert(top.includes("n[0]===system?'active':''"),
 'the selected page, not a hard-coded leave highlight, determines active state');
for(const name of ['attendance','schedule','efficiency','hr','workhours','leave','history'])
 assert(top.includes("['"+name+"'"),'preserve all seven routes: '+name);
assert(!/(?:fetch\(|localStorage|sessionStorage|saveLeave|deleteLeave|submitLeave|dispatchEvent)/.test(fix),
 'styles must not change leave data or application behavior');
console.log('PASS leave sidebar parity: same seven-system header, desktop/mobile width, dark/light active state, navigation, permissions and untouched leave workflows');
