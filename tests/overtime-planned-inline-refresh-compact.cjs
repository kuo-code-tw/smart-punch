'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');
const cut=name=>{
 const i=html.indexOf('function '+name+'(');
 const e=html.indexOf('\n        }',i);
 assert(i>0&&e>i,'missing function '+name);
 return html.slice(i,e+10);
};
assert(html.includes('id="p79PlannedPunchNotice" role="status"'),'cloud status is visible inside native planned dialog');
assert(html.includes('class="p79-planned-actions"'),'planned operation buttons render in their own action row');
assert(html.includes('flex-wrap:nowrap!important'),'planned action row must stay on one line');
assert(html.includes('#p79OvertimePlannedBody .p79-planned-actions button'),'buttons have compact targeted styling');
assert(html.includes('font-size:11px!important;'),'action text is compact');
assert(!html.includes('p-3 min-w-[235px]"><div class="flex flex-wrap items-center justify-center gap-2"'),'old wrapped large action buttons removed');
assert(html.includes('p79OvertimeCalculationCache=null;\n                if(fromPlanned'),'locally edited punch refreshes planned cache BEFORE painting');
assert(html.includes("if(!p79MountAttendanceModalInPlannedDialog('editRecordModal'))"),'never fall back to main screen when editor cannot mount');
assert(html.includes('if(!mounted){p79PlannedPunchNotice('),'missing punch never falls through to main page');
const dialog={open:true},months=[],loaded=[],notices=[],readback=[],main=[],planned=[];
let sameToken='SSO-A';
const c={document:{getElementById:k=>k==='p79OvertimePlannedDialog'?dialog:null},
 Set,Promise,String,Array,
 p79OvertimeCalculationCache:{stale:true},
 currentPort79SsoToken:()=>sameToken,
 normalizeScheduleDateKey:s=>String(s).replaceAll('/','-'),
 getAttendanceDateKey:s=>String(s).slice(0,10),
 p79QueueConfirmedRosterRecheck:m=>months.push(m),
 p79RenderOnlyVisibleAttendanceView:()=>main.push('main-refresh'),
 loadAttendanceMonthFromCloud:async m=>{loaded.push(m);return true},
 renderOvertimeStats:()=>planned.push(dialog.open),
 p79PlannedPunchNotice:(msg,tone)=>readback.push({msg,tone}),
 showToast:(msg,tone)=>notices.push({msg,tone})};
vm.createContext(c);
vm.runInContext(cut('p79RefreshLinkedOvertimeAfterAttendanceCloudSave'),c);
(async()=>{
 c.p79RefreshLinkedOvertimeAfterAttendanceCloudSave('2026/10/28 23:26','2026/10/28 23:38');
 await Promise.resolve();await Promise.resolve();
 assert.equal(dialog.open,true,'save keeps native planned dialog open');
 assert.deepEqual(months,['2026-10'],'linked roster rechecks only modified month');
 assert.deepEqual(loaded,['2026-10'],'authoritative attendance re-read after successful cloud write');
 assert.equal(main.length,1,'shared visible renderer used once, no main-page navigation');
 assert.equal(planned.length,1,'planned table directly repaints after cloud readback');
 assert.equal(readback.at(-1).tone,'success');
 assert.match(readback.at(-1).msg,/已更新/);
 assert.equal(c.p79OvertimeCalculationCache,null,'stale overtime derived rows discarded');
 // Never return to an abandoned dialog or reinstate another account's token.
 dialog.open=false;c.p79RefreshLinkedOvertimeAfterAttendanceCloudSave('2026/10/28 23:26');
 await Promise.resolve();await Promise.resolve();
 assert.equal(loaded.length,1,'closed planned list does not launch hidden background re-read');
 dialog.open=true;c.loadAttendanceMonthFromCloud=async()=>false;
 c.p79RefreshLinkedOvertimeAfterAttendanceCloudSave('2026/10/28 23:26');
 await Promise.resolve();await Promise.resolve();
 assert.equal(readback.at(-1).tone,'warning','no false cloud-success if new read fails');
 assert.equal(notices.at(-1).tone,'warning');
 console.log('PASS inline planned edit: compact one-line controls, in-dialog validation, cloud-confirmed refresh and failure warning');
})().catch(e=>{console.error(e);process.exitCode=1});
