'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const report=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const html=fs.readFileSync('work-hours/index.html','utf8');
function cut(start,end,label){const a=src.indexOf(start),b=src.indexOf(end,a);assert(a>=0&&b>a,label);return src.slice(a,b)}
const ids=Array.from({length:84},(_,i)=>'E'+String(i+1).padStart(3,'0'));
const people=ids.map((empId,i)=>({empId,name:'測試人員'+i,companyName:i%2?'甲':'乙',dept:'部門'+i%3,groupName:'組'+i%4,jobTitle:['F/L','ARMG','AQC','領班','指揮手'][i%5]}));
const review=people.map(emp=>({emp,missing:false,remaining:{例:0,休:0,國:1}}));
const c={g:{p79RestQuota:()=>({days:31})},today:()=> '2026-10-29',cats:['國','休','例'],Number,String,Map,
 id:x=>String(x||'').trim().toUpperCase(),autoPlan:false,busy:false,
 model:{plannedRows:[]},loadedMonth:'2026-10',loadedPeople:people,
 manualPeople:new Map(),rosterReviewRows:()=>review,paint(){c.paints++},paints:0};
vm.createContext(c);
vm.runInContext(cut('function manualPlanSelectable(','function reportProgress(','manualPlanSelectable'),c);
assert(review.every(x=>c.manualPlanSelectable(x,'2026-10')),'84 people with 1 outstanding 國 can be manually checked');
assert(!c.manualPlanSelectable({...review[0],missing:true},'2026-10'),'missing roster not eligible');
assert(!c.manualPlanSelectable({...review[0],remaining:{例:0,休:0,國:0}},'2026-10'),'zero quota not eligible');
assert(!c.manualPlanSelectable(review[0],'2026-09'),'past month cannot create future preplan');
assert(!c.manualPlanSelectable(review[0],'2026-11'),'future month not open for current preplan');
const inputs={},q=x=>inputs[x]??={};
c.q=q;
vm.runInContext(cut("q('#mrNeedRows').onchange=e=>{","q('#mrPlannedRows').onchange=", 'same-table change handler'),c);
for(const n of [0,12,31]){
 const emp=people[n];
 q('#mrNeedRows').onchange({target:{classList:{contains:k=>k==='need-plan'},dataset:{emp:emp.empId},checked:true}});
}
assert.equal(c.manualPeople.size,3,'manual checkboxes select staff across companies and professions');
assert.equal(c.model.plannedRows.length,0,'selecting 3 people never fabricates automatic drafts');
q('#mrNeedRows').onchange({target:{classList:{contains:k=>k==='need-plan'},dataset:{emp:people[12].empId},checked:false}});
assert.equal(c.manualPeople.size,2,'unchecking removes only selected person');
let selected='',invocations=[];
q('#mrNewPlan').onclick=empId=>{selected=empId;invocations.push(empId)};
q('#mrManualRows').onclick({target:{closest:()=>({dataset:{emp:people[31].empId},classList:{contains:k=>k==='manual-set-date'}})}});
assert.equal(selected,people[31].empId,'manual person action opens its own form');
c.autoPlan=true;c.model.plannedRows=[{empId:'E001',checked:false,saved:false},{empId:'E002',checked:false,saved:false}];
q('#mrNeedRows').onchange({target:{classList:{contains:k=>k==='need-plan'},dataset:{emp:'E001'},checked:true}});
assert.equal(c.model.plannedRows[0].checked,true,'auto mode still selects real generated suggestion');
assert.equal(c.manualPeople.size,2,'auto mode does not rewrite manual picks');
assert(src.includes('class="need-plan manual-person-pick"'),'checkbox is visibly rendered in manual mode');
assert(src.includes("manualPeople.size?'設定勾選預排"),'footer actionable on hand-picked employees');
assert(src.includes('id="mrManualSelected"'),'selected staff appear inside the same monthly dialog');
assert(src.includes("q('#mrNewPlan').onclick(employeeId)"),'each employee has a live date/period action');
assert(src.includes("allowedEmpIds:[chosen.empId]"),'manual form restricted to selected employee');
assert(src.includes('requirePeriodSelection:true,pickDateExplicitly:true'),'must choose period and date explicitly');
assert(report.includes("if(prefill.manualPlan===true&&prefill.pickDateExplicitly===true)el.querySelector('#p79OtDate').value=''"),'no silent today default');
assert(report.includes('result.directOvertimeSaved')===false || src.includes('result?.directOvertimeSaved===true'),'save ACK checked before removing manually selected person');
assert(html.includes('manual=20261029-checkbox-in-monthly-v7'),'deployment busts old modal cache');
assert(html.includes('port79-overtime-report.js?v=20261029-auto-match-shift-all-staff-v1'),'deployment busts original report cache');
console.log('PASS 84 staff / manual checkboxes, multi-company selection, date/period workflow, no auto plans/writes, existing auto mode');
