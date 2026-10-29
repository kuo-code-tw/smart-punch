'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');
const styleStart=html.indexOf('<style id="p79-overtime-planned-matched-font-20261028">');
const styleEnd=html.indexOf('</style>',styleStart);
assert(styleStart>=0&&styleEnd>styleStart,'planned dialog scoped stylesheet exists');
const css=html.slice(styleStart,styleEnd);
const findRule=selector=>{
 const start=css.indexOf(selector+'{');
 assert(start>=0,'missing selector '+selector);
 return css.slice(start,css.indexOf('}',start)+1);
};
const headerRule=findRule('#adminContentOvertime #p79OvertimePlannedDialog #p79OvertimePlannedStickyHeader');
assert.match(headerRule,/position:sticky!important/,'header sticks to scroll port');
assert.match(headerRule,/top:0!important/,'header remains at top');
assert.match(headerRule,/z-index:100!important/,'heading remains above scrolling table');
assert.match(headerRule,/background:#f8faff!important/,'opaque background keeps close legible');
const closeRule=findRule('#adminContentOvertime #p79OvertimePlannedDialog .p79-ot-planned-close');
assert.match(closeRule,/min-height:34px!important/,'visible, usable close button');
assert.match(closeRule,/font-size:13px!important/,'clear close label');
assert.match(closeRule,/cursor:pointer!important/);
assert.match(html,/<div id="p79OvertimePlannedStickyHeader"[^>]+>[\s\S]*?<h4 id="p79OvertimePlannedHeading"/,
 'close and heading share sticky toolbar');
const view=html.slice(html.indexOf('<dialog id="p79OvertimePlannedDialog"'),
 html.indexOf('</dialog>',html.indexOf('<dialog id="p79OvertimePlannedDialog"'))+9);
assert(view.includes('onclick="p79CloseOvertimePlannedDialog()"'),'visible button invokes existing safe close');
assert(view.includes('aria-label="關閉預排待核對視窗"'),'close remains keyboard accessible');
assert(view.includes('✕ 關閉'),'close text visible');
const begin=html.indexOf('function p79SyncOvertimePlannedDialogState(){');
const end=html.indexOf('// 每月未休加班讀取後',begin);
assert(begin>=0&&end>begin);
const code=html.slice(begin,end);
const attrs=new Map(),toggle={setAttribute:(k,v)=>attrs.set(k,v),title:''};
const dialog={open:false,showModal(){this.open=true},close(){this.open=false}};
const ctx={p79PlannedAttendanceModalAnchors:new Map(),document:{getElementById:id=>id==='p79OvertimePlannedDialog'?dialog:id==='p79OvertimePlannedToggle'?toggle:null}};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.p79ToggleOvertimePlanned();
assert.equal(dialog.open,true);
ctx.p79CloseOvertimePlannedDialog();
assert.equal(dialog.open,false,'existing close returns to overtime manager');
assert.equal(attrs.get('aria-expanded'),'false');
assert.doesNotMatch(code,/location\.href|location\.replace|localStorage\.clear|sessionStorage\.clear|saveOvertimeReportDirect/,
 'close cannot navigate, logout, clear session, or write declarations');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
 if(match[1].trim())new vm.Script(match[1]);
console.log('PASS sticky top close visible during scroll, actual close works, no navigation/login/save side effects, scripts parse');
