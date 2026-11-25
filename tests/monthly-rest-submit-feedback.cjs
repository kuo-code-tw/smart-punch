'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const dashboard=fs.readFileSync('assets/port79-monthly-rest-dashboard.js','utf8');
const controller=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
new vm.Script(dashboard);new vm.Script(controller);
const context={window:{},document:{}};
vm.createContext(context);vm.runInContext(dashboard,context);
const {submissionMessage,dailyPendingRows}=context.window.P79MonthlyRestDashboard;
assert.equal(submissionMessage('正在重新核對未休額度與已申報紀錄…','已配對可申報',true),'正在重新核對未休額度與已申報紀錄…');
const failure='本次已核對成功 0 筆；後續停止：員工A 2026-11-23 出勤不完整';
assert.equal(submissionMessage(failure,'已配對可申報',true),failure);
assert.equal(submissionMessage('雲端申報已核對 1 筆','已配對可申報',true),'雲端申報已核對 1 筆');
assert.equal(submissionMessage('已讀取','請先勾選待核對資料',false),'請先勾選待核對資料');
const person={kind:'roster',id:'A',name:'測試員工',role:'測試',reviewType:'deficit',due:1,suggestions:[{date:'2026-11-23',category:'休',period:'休08-16'},{date:'2026-11-24',category:'休',period:'休08-16'}]};
const prior=[{empId:'A',date:'2026-11-23',status:'已核對出勤'}];
const pending=dailyPendingRows({ready:[],planned:[],prior,roster:[person]});
assert(!pending.some(r=>r.date==='2026-11-23'),'confirmed cloud date is not regenerated as a suggestion');
assert(pending.some(r=>r.date==='2026-11-24'),'other dates remain visible');
const uncertain=dailyPendingRows({ready:[],planned:[],prior:[{...prior[0],status:'預排待核'}],roster:[person]});
assert(uncertain.some(r=>r.date==='2026-11-23'),'unconfirmed report is not classified as completed');
assert(controller.includes('verifiedSnapshot=verified;'));
assert(controller.includes('const latest=verifiedSnapshot||await a.snapshot(loadedMonth,true,false,true);'));
assert(controller.includes('report?.id===r.id&&report.planned!==true&&report.category===r.category'));
assert(controller.includes('if(!fullDayEvidence(fresh,r.empId,r.date,attendance[0]))'));
const refusalStart=controller.indexOf('function isExplicitScheduleEditRefusal(');
const refusalEnd=controller.indexOf('function showSubmissionResult(',refusalStart);
vm.runInContext(controller.slice(refusalStart,refusalEnd),context);
assert.equal(context.isExplicitScheduleEditRefusal(Error('班表正在編輯，請待儲存完成後再申報')),true);
assert.equal(context.isExplicitScheduleEditRefusal(Error('排班讀取等候 8 秒後仍未取得鎖')),false);
assert.equal(context.isExplicitScheduleEditRefusal(Error('寫入結果尚未確認：班表正在編輯，請待儲存完成後再申報')),false);
assert(controller.includes('!hadUnconfirmedAttempt&&isExplicitScheduleEditRefusal(error)'));
assert(controller.includes("r.attempted=false;r.checked=true;r.status='班表編輯中，本次未送出成功'"));
const start=controller.indexOf('function showSubmissionResult(');
const end=controller.indexOf('async function open(',start);
const elements=new Map();
let opened=0,removed=0;
const dialog={
 style:{},setAttribute(){},
 querySelector(selector){if(!elements.has(selector))elements.set(selector,{});return elements.get(selector);},
 addEventListener(event,listener){assert.equal(event,'close');this.close=listener;},
 showModal(){opened++;},remove(){removed++;}
};
context.document.createElement=tag=>{assert.equal(tag,'dialog');return dialog;};
vm.runInContext(controller.slice(start,end),context);
const parent={appendChild(child){assert.equal(child,dialog);}};
context.showSubmissionResult(parent,[{saved:true},{saved:true}],'');
assert.equal(elements.get('h2').textContent,'申報完成');
assert.match(elements.get('#mrSubmissionResultSummary').textContent,/確認 2 筆/);
dialog.close();assert.equal(removed,1);
context.showSubmissionResult(parent,[{saved:true},{acknowledged:true}],'雲端讀回逾時');
assert.equal(elements.get('h2').textContent,'部分申報完成');
assert.match(elements.get('#mrSubmissionResultSummary').textContent,/確認 1 筆.*另有 1 筆/);
assert.equal(elements.get('[data-reason]').textContent,'雲端讀回逾時');
context.showSubmissionResult(parent,[{acknowledged:true}],'');
assert.equal(elements.get('h2').textContent,'申報尚未確認完成');
assert.equal(opened,3);
console.log('PASS monthly rest submit feedback, confirmed-date suppression, cloud readback source, and existing official guards');
