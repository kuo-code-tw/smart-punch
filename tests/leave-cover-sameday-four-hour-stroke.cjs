'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const date='2026-11-14';
const root={};
const context={window:root,Date,Intl,Map,Set,Error,TextEncoder};
vm.runInNewContext(fs.readFileSync('assets/port79-leave-cover-suggest.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('assets/port79-smart-cover-picker.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('assets/port79-overtime-report.js','utf8'),context);

const api=root.P79LeaveCoverSuggest;
const first=api.coverWorkday(date,'晚','two',0,'same-day');
const second=api.coverWorkday(date,'晚','two',1,'same-day');
assert.equal(first.workDate,date);assert.equal(first.overtimeDate,date);
assert.equal(second.workDate,date);assert.equal(second.overtimeDate,date);
assert.equal(first.period,'16-20');assert.equal(second.period,'20-24');
assert.equal(first.declaredHours,4);assert.equal(second.declaredHours,4);
assert.equal(api.coverWorkday(date,'晚','two',1).workDate,'2026-11-15',
 'historical cross-day reports remain interpretable without rewriting them');

const people=[
 {empId:'L',name:'請假者',jobTitle:'F/L',dept:'79',employmentStatus:'active'},
 {empId:'A',name:'陳五',jobTitle:'F/L',dept:'79',employmentStatus:'active'},
 {empId:'B',name:'王二',jobTitle:'F/L',dept:'79',employmentStatus:'active'},
 {empId:'C',name:'張四',jobTitle:'F/L',dept:'79',employmentStatus:'active'},
 {empId:'D',name:'李三',jobTitle:'F/L',dept:'79',employmentStatus:'active'}
];
const rosters=new Map(people.map(p=>[p.empId,{[date]:p.empId==='L'?'晚':'休'}]));
const picker=root.P79SmartCoverPicker;
assert.equal(picker.period(people[0],date,rosters,'two',0),'16:00–20:00');
assert.equal(picker.period(people[0],date,rosters,'two',1),'20:00–24:00');
const html=picker.render({people,target:people[0],date,rosters,mode:'two',selected:[]});
const slots=[...html.matchAll(/<select data-smart-action="slot" data-smart-slot="[01]"[^>]*>[\s\S]*?<\/select>/g)];
assert.equal(slots.length,2);
for(const slot of slots){
 const content=slot[0];
 assert(content.indexOf('王二')<content.indexOf('李三'));
 assert(content.indexOf('李三')<content.indexOf('張四'));
 assert(content.indexOf('張四')<content.indexOf('陳五'));
}
assert(html.includes('第一位代班（早班加班 4 小時）'));
assert(html.includes('第二位代班（晚班加班 4 小時）'));

const cloud={
 leaveCoverAssignments:[{leaveId:'L14',leaveEmpId:'L',workerIds:['A','B'],mode:'two',startDate:date,endDate:date}],
 schedules:[{empId:'L',schedule:{[date]:'晚'}},{empId:'A',schedule:{[date]:'早'}},{empId:'B',schedule:{[date]:'晚'}}]
};
const r1=root.P79Overtime.resolveLeaveCoverReport(cloud,{id:'L14'},{
 date,coverDate:date,overtimeDate:date,empId:'A',forEmpId:'L',periodMode:'same-day'
});
const r2=root.P79Overtime.resolveLeaveCoverReport(cloud,{id:'L14'},{
 date,coverDate:date,overtimeDate:date,empId:'B',forEmpId:'L',periodMode:'same-day'
});
assert.equal(r1.workDate,date);assert.equal(r2.workDate,date);
assert.equal(r1.expectedSplitRule.overtimeStart,'16');
assert.equal(r1.expectedSplitRule.overtimeEnd,'20');
assert.equal(r2.expectedSplitRule.overtimeStart,'20');
assert.equal(r2.expectedSplitRule.overtimeEnd,'24');
assert.throws(()=>root.P79Overtime.resolveLeaveCoverReport(cloud,{id:'L14'},{
 date:'2026-11-15',coverDate:date,empId:'B',forEmpId:'L',periodMode:'same-day'
}),/2026-11-14/);

const backend={Date,Error};
vm.runInNewContext(fs.readFileSync('backend/night-cover-dual-date-v108-core.gs','utf8'),backend);
const leaveRecords=[{id:'L14',empId:'L',status:'已核准',startDate:date,endDate:date}];
const cover=cloud.leaveCoverAssignments[0];
const firstReq={date,empId:'A',forEmpId:'L',leaveHandoffId:'L14',coverPeriodMode:'same-day'};
const secondReq={...firstReq,empId:'B'};
const firstRule=['代','代16-20',4,4,'','','16','20','full','代班加班'];
const secondRule=['代','代20-24',4,4,'','','20','24','full','代班加班'];
assert.doesNotThrow(()=>backend.p79DirectCoverCheckV107_(cloud.schedules,firstReq,firstRule,cover,leaveRecords,date));
assert.doesNotThrow(()=>backend.p79DirectCoverCheckV107_(cloud.schedules,secondReq,secondRule,cover,leaveRecords,date));
assert(fs.readFileSync('backend/night-cover-dual-date-v108-core.gs','utf8').includes("if(request.coverPeriodMode!=='same-day')schedule[date]=assigned"),'new same-day overtime must not change the official roster shift');
assert.throws(()=>backend.p79DirectCoverCheckV107_(cloud.schedules,firstReq,secondRule,cover,leaveRecords,date),/16:00–20:00/);
assert.throws(()=>backend.p79DirectCoverCheckV107_(cloud.schedules,{...secondReq,date:'2026-11-15'},secondRule,cover,leaveRecords,date),/2026-11-14/);

const page=fs.readFileSync('leave/index.html','utf8');
assert(page.includes("coverWorkday?.(coverDate,leaveShift,mode,index,'same-day')"));
assert(page.includes("coverPeriodMode:draft.coverPeriodMode||''"));
assert(page.includes("sameDayCoverFourHourV1"));
for(const m of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
 if(!/\bsrc=|application\/json|importmap/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
}
console.log('PASS same-day 14th cover 16-20 / 20-24, stroke order, wrong-date/backend guard, legacy reporting preserved');
