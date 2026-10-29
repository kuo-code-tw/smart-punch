'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');

assert.match(html,/＋ 申報加班<\/button>\s*<button id="p79OvertimePlannedToggle"/,'top toolbar modal button follows 申報加班');
assert.match(html,/<button id="p79OvertimePlannedToggle"[^>]+aria-controls="p79OvertimePlannedDialog" aria-haspopup="dialog" aria-expanded="false"/,'modal button is accessible');
assert.match(html,/<dialog id="p79OvertimePlannedDialog"[^>]+oncancel="p79PlannedDialogCancel\(event\)" onclose="p79PlannedDialogClosed\(\)"/,'native dialog protects in-progress edits and restores toolbar on close');
assert.match(html,/<section id="p79OvertimePlannedSection"/,'same original planned list remains inside modal');
assert.match(html,/#adminContentOvertime #p79OvertimePlannedDialog:not\(\[open\]\)\{display:none!important\}/,'modal is hidden until opened');
assert.match(html,/id="p79OvertimePlannedPagination"/,'list retains original pagination');
assert(html.includes("toggle.textContent='預排／待核對（'+rows.length+'）'"),'top button uses filtered count');
assert.match(html,/onclick="p79CloseOvertimePlannedDialog\(\)"[^>]+>✕ 關閉<\/button>/,'modal has a close button');
assert(!html.includes("p79CloseOvertimePlannedDialog();\n            // 原生考勤編輯器"),'editing must not jump back to main page');
assert(html.includes("p79OpenPlannedMissingPunchEditor('+index+"),'missing punch edit stays inside planned dialog');
assert(html.includes("p79OpenPlannedOvertimeReview('+index+')"),'review action remains available');

const start=html.indexOf('function p79SyncOvertimePlannedDialogState(){');
const end=html.indexOf('// 每月未休加班讀取後',start);
assert(start>0&&end>start,'modal functions exist');
const code=html.slice(start,end);
assert(!code.includes('scrollIntoView'),'modal must never scroll the page');
const attrs=new Map([['aria-expanded','false']]);
const button={setAttribute:(key,val)=>attrs.set(key,val),title:''};
let showCount=0,closeCount=0;
const dialog={
 open:false,
 showModal(){if(this.open)throw Error('already open');this.open=true;showCount++;},
 close(){if(!this.open)throw Error('already closed');this.open=false;closeCount++;}
};
const ctx={document:{getElementById:id=>id==='p79OvertimePlannedDialog'?dialog:id==='p79OvertimePlannedToggle'?button:null}};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.p79ToggleOvertimePlanned();
assert.equal(dialog.open,true,'toolbar opens centered native modal');
assert.equal(attrs.get('aria-expanded'),'true','button shows modal-open state');
ctx.p79ToggleOvertimePlanned();
assert.equal(dialog.open,false,'toolbar can close native modal');
assert.equal(attrs.get('aria-expanded'),'false','button shows modal-closed state');
ctx.p79ToggleOvertimePlanned();
ctx.p79CloseOvertimePlannedDialog();
assert.equal(dialog.open,false,'modal close button closes it');
ctx.p79ToggleOvertimePlanned();dialog.close();
ctx.p79PlannedDialogClosed();
assert.equal(attrs.get('aria-expanded'),'false','native Escape/close event resets toolbar');
assert.equal(showCount,3);
assert.equal(closeCount,3);
console.log('PASS planned review opens in independent modal, closes via button/Escape, and retains attendance/report actions');
