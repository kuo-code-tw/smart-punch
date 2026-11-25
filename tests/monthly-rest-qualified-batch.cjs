'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:null,document:{},Date,Intl};
context.window=context;
vm.createContext(context);
for(const name of ['monthly-rest-overtime','monthly-rest-dashboard']){
 vm.runInContext(fs.readFileSync('assets/port79-'+name+'.js','utf8'),context);
}
const dashboard=context.P79MonthlyRestDashboard, planner=context.P79MonthlyRest;
const reviewRows=Array.from({length:37},(_,i)=>({
 kind:'reference',id:'EMP'+i,empId:'EMP'+i,date:'2026-11-26',category:'休',
 period:['08:00 – 16:00','16:00 – 24:00','24:00 – 08:00'][i%3],
 eligible:false,eligibilityIssue:'原排正常班，沒有已確認的休假別'
}));
const eligible={...reviewRows[0],id:'VALID',empId:'VALID',eligible:true};
const selected=new Set();
for(const row of [...reviewRows,eligible])assert.equal(dashboard.markForReview(selected,row,true),true);
assert.equal(selected.size,38,'reference rows remain available for inspection');
assert.equal(dashboard.selectedDatedReferences(reviewRows,selected,'plan','2026-11-25').length,0);
assert.deepEqual(Array.from(dashboard.selectedDatedReferences([...reviewRows,eligible],selected,'plan','2026-11-25'),r=>r.id),['VALID']);
assert.equal(dashboard.selectedDatedReferences(reviewRows,selected,'formal','2026-11-27').length,0);
const employee={kind:'roster',id:'EMP0',reviewType:'deficit',due:1,canPreplan:true,suggestions:[
 {date:'2026-11-26',category:'休',period:'08:00 – 16:00',referenceOnly:true,eligible:false}
]};
const pending=dashboard.dailyPendingRows({roster:[employee],ready:[],planned:[],prior:[]});
assert(pending.some(r=>r.residualOnly&&r.due===1&&r.canPreplan),'informational dates leave the deficit open');
assert.equal(planner.restPeriodMatches(['00','08'],['24:00','08:00']),true);
console.log('PASS 37 informational days excluded from write actions; eligible date and unresolved deficit retained');
