'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
new vm.Script(source);

const syncStart=source.indexOf('   function syncApprovedLeaveDate(){');
const syncEnd=source.indexOf('   roleSelect.onchange=',syncStart);
assert(syncStart>0&&syncEnd>syncStart,'approved-leave sync function found');
const syncCode=source.slice(syncStart,syncEnd);
function syncDate(category,editingOriginal,approved,initialDate,linkedId='AN1150006'){
 const prefill={empId:'AN1150007',forEmpId:linkedId,date:'2026-10-19',plannedReview:true,savedReport:true,lockOriginal:true,reportId:'R-7'};
 const dateInput={value:initialDate},forSelect={value:linkedId};
 const leaveDateSelect={value:'',innerHTML:''},leaveDateWrap={style:{display:''}},status={textContent:''};
 const execute=new Function(
  'forSelect','approvedLeaveDateChoices','leaveRecords','approvedDates','select','rows','editingOriginal',
  'prefill','leaveDateWrap','leaveDateSelect','dateInput','el',
  syncCode+';syncApprovedLeaveDate();'
 );
 execute(forSelect,()=>approved,[],[],{selectedIndex:0,value:'0'},[[category]],editingOriginal,
  prefill,leaveDateWrap,leaveDateSelect,dateInput,{querySelector:()=>status});
 return {date:dateInput.value,leaveDateDisplay:leaveDateWrap.style.display,status:status.textContent};
}
let r=syncDate('延',true,[],'');
assert.equal(r.date,'2026-10-19','original extension date must never be cleared by missing leave data');
assert.equal(r.leaveDateDisplay,'none','existing extension review should not show irrelevant leave-date picker');
r=syncDate('代',true,[],'');
assert.equal(r.date,'2026-10-19','even linked original leave cover must retain original report date for checking');
assert.equal(r.leaveDateDisplay,'flex','original leave-cover must still show approved-leave picker');
r=syncDate('代',false,[],'2026-10-28');
assert.equal(r.date,'','new leave-cover with no approved leave must not use today');
r=syncDate('代',false,['2026-10-19'],'2026-10-28');
assert.equal(r.date,'2026-10-19','new cover with single approved leave must use approved date');

const guardStart=source.indexOf("const originalExtensionReview=editingOriginal&&prefill.plannedReview===true&&!prefill.leaveHandoffId&&rows[Number(select.value)]");
const guardEnd=source.indexOf('     if(prefill.attendance',guardStart);
assert(guardStart>0&&guardEnd>guardStart,'narrow existing-extension validation exception exists');
const guardCode=source.slice(guardStart,guardEnd);
function guard({category='延',editing=true,review=true,empId='AN1150007',date='2026-10-19',forId='AN1150006',handoff='' }={}){
 let validations=0;
 const prefill={empId:'AN1150007',date:'2026-10-19',forEmpId:'AN1150006',plannedReview:review,leaveHandoffId:handoff};
 const execute=new Function('editingOriginal','prefill','rows','select','date','empId','forSelect','approvedDates','validateLeaveLinkedOvertimeDate',
  guardCode+';return originalExtensionReview;');
 const allowed=execute(editing,prefill,[[category]],{value:'0'},date,empId,{value:forId},[],()=>validations++);
 return {allowed,validations};
}
assert.deepEqual(guard(),{allowed:true,validations:0},'only exact original extension may retain the saved linked target');
for(const input of [
 {category:'代'},{editing:false},{review:false},{empId:'OTHER'},
 {date:'2026-10-20'},{forId:'OTHER'},{handoff:'LEAVE-ID'}
])assert.deepEqual(guard(input),{allowed:false,validations:1},'new/modified/leave-handoff link must still validate leave date');
assert(source.includes("draft={id:editingExisting?String(prefill.reportId):crypto.randomUUID()"),'review reuses original cloud report id');
console.log('PASS planned-review original date is preserved, linked person is locked, leave-cover checks remain strict');
