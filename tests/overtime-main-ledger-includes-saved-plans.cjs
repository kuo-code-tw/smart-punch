'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync('work-hours/index.html','utf8');
const start=page.indexOf('        function p79OvertimeMainLedgerRows(');
const end=page.indexOf('        function buildOvertimeStatisticsRows()',start);
assert(start>0&&end>start,'main overtime ledger merger should exist');
const candidate=page.slice(start,end);
const isPlanned=row=>row?.planned===true||row?.overtimeReport?.planned===true;
const isOfficial=row=>!!String(row?.id||'').trim();
const fn=vm.runInNewContext('(function(){'+candidate+'return p79OvertimeMainLedgerRows})()',{
 p79WorkOvertimeIsUnconfirmedPlan:isPlanned,p79WorkOvertimeOfficialReport:isOfficial
});
const item=(emp,date,id,planned,verified=true)=>({
 empId:emp,dateKey:date,rosterDate:date,sortTime:Date.parse(date),planned,
 reportVerified:verified,overtimeReport:id?{id,planned}:null
});
const official=[item('A','2026-11-02','one',false),item('B','2026-11-03','two',false)];
const planned=[
 item('C','2026-11-04','three',true),item('D','2026-11-07','four',true),
 item('B','2026-11-03','two',false),item('E','2026-11-08','',true),
 item('F','2026-11-09','invalid',true,false)
];
const result=fn(official,planned);
assert.equal(result.length,4,'two completed + two saved plans only');
assert.equal(result.filter(r=>r.overtimeReport?.id==='two').length,1,'duplicate report ID must not appear twice');
assert(result.some(r=>r.empId==='C'&&isPlanned(r)),'saved planned report must be visible');
assert(result.some(r=>r.empId==='D'&&isPlanned(r)),'future plan with cloud ID must be visible');
assert(!result.some(r=>r.empId==='E'||r.empId==='F'),'unverified or ID-less plan must not be mistaken for filed');
assert(page.includes('const allOvertimeRows=p79OvertimeMainLedgerRows(formalRows,plannedRows)'),'main table consumes both datasets');
assert(page.includes('const completedJobRows=jobTitleRows.filter(row=>!p79WorkOvertimeIsUnconfirmedPlan(row))'),'completed totals exclude saved plans');
assert(page.includes('const completedRows=rows.filter(row=>!p79WorkOvertimeIsUnconfirmedPlan(row))'),'filtered completed totals exclude saved plans');
assert(page.includes("const savedPlan=p79WorkOvertimeIsUnconfirmedPlan(row)"),'rows carry visible planned status');
assert(page.includes("已儲存申報｜預排未出勤"),'saved future plans explicitly labeled');
assert(page.includes('p79OpenMainPlannedOvertimeRow('),'saved plan buttons route into existing management');
assert(page.includes('不需要先核准'),'main screen does not gate saved reports on approval');
assert(page.includes('row.reportVerified||row.coverCandidate||row.coverAlreadyArranged'),'existing delete action is preserved');
const scripts=[...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m=>! /\bsrc=|application\/json|importmap/.test(m[1]));
for(const script of scripts)new vm.Script(script[2]);
console.log('PASS saved overtime and cloud-identified plans visible on main page, report ID dedup, no approval gate, completed hours isolated');
