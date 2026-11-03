'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-leave-cover-suggest.js','utf8');
const page=fs.readFileSync('leave/index.html','utf8');
const global={};vm.runInNewContext(source,{window:global,Date,Map,Set,Error});
const api=global.P79LeaveCoverSuggest,day='2026-11-07';
const d=n=>api.addDays(day,n),person=(id,shift,title='指揮手')=>({empId:id,name:id,dept:'第二事業處',jobTitle:title,employmentStatus:'active',shift});
const people=[person('LEAVER','晚'),person('MID','中'),person('EARLY','早'),person('OTHER','中','F/L')];
const schedules=[
 {empId:'LEAVER',schedule:{[day]:'晚'}},
 {empId:'MID',schedule:{[d(-1)]:'中',[day]:'中',[d(1)]:'中'}},
 {empId:'EARLY',schedule:{[day]:'早',[d(1)]:'早',[d(2)]:'早'}},
 {empId:'OTHER',schedule:{[day]:'中'}}
];
const rosters=api.mergeRosters([{ok:true,schedules}]);
let result=api.suggest({people,rosters,date:day,leaveEmpId:'LEAVER'});
assert.equal(result.leaveShift,'晚');
assert.equal(result.first.empId,'MID');
assert.equal(result.second.empId,'EARLY');
assert.equal(result.slots[0].period,'16–04');assert.equal(result.slots[0].overtime,'24–04');
assert.equal(result.slots[1].period,'04–16');assert.equal(result.slots[1].overtime,'04–08');
assert.equal(api.suggest({people,rosters,date:day,leaveEmpId:'LEAVER',leaves:[{empId:'EARLY',startDate:d(1),endDate:d(1),status:'已核准'}]}).second,undefined,'leave person cannot be recommended');
assert.equal(api.suggest({people,rosters,date:day,leaveEmpId:'LEAVER',covers:[{workerIds:['MID'],startDate:day,endDate:day}]}).first,undefined,'assigned overtime worker cannot be recommended');
const conflict=api.mergeRosters([{ok:true,schedules:schedules.map(s=>s.empId==='EARLY'?{...s,schedule:{...s.schedule,[day]:'中'}}:s)}]);
assert.equal(api.suggest({people,rosters:conflict,date:day,leaveEmpId:'LEAVER'}).second,undefined,'less than 12h actual gap must prevent auto assignment');
const eDay='2026-11-08';
const eRoster=api.mergeRosters([{ok:true,schedules:[
 {empId:'LEAVER',schedule:{[eDay]:'早'}},
 {empId:'MID',schedule:{[api.addDays(eDay,-1)]:'中',[eDay]:'中',[api.addDays(eDay,1)]:'中'}},
 {empId:'EARLY',schedule:{[api.addDays(eDay,-2)]:'晚',[api.addDays(eDay,-1)]:'晚',[eDay]:'晚'}},
 {empId:'OTHER',schedule:{[eDay]:'中'}}
]}]);
result=api.suggest({people,rosters:eRoster,date:eDay,leaveEmpId:'LEAVER'});
assert.equal(result.leaveShift,'早');
assert.equal(result.first.empId,'EARLY');
assert.equal(result.second.empId,'MID');
assert.equal(result.slots[0].overtime,'08–12');
assert.equal(result.slots[1].overtime,'12–16');
assert.deepEqual(api.monthsFor('2026-11-01').sort(),['2026-10','2026-11']);
assert.throws(()=>api.mergeRosters([{ok:false,schedules:[]}]),/正式班表/);
assert(page.includes('id="adminCreateLeaveRecommendation"'),'recommendation status in original form');
assert(page.includes('p79OnCreateLeaveEmployeeChange()'),'trigger on selected leave employee');
assert(page.includes('p79OnCreateLeaveDateChange()'),'date changes refresh roster recommendation');
assert(page.includes("p79CreateCoverManual=true"),'operator selections never overwritten');
assert(page.includes('if(!recommendation.first||!recommendation.second)'),'no blind auto assignment on missing worker');
assert(page.includes("getScheduleDataSecure&gcToken="),'use authenticated roster');
assert(page.includes('port79-leave-cover-suggest.js?v='),'script loaded into leave page');
assert(page.includes('await postCloud({action:'),'existing approval workflow retained');
for(const match of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|application\/json|importmap/.test(match[1]))new vm.Script(match[2]);
console.log('PASS leave form suggests qualified same-role mid and early workers by verified roster, checks 12h gaps, leaves and cover conflicts; manual selection safe');
