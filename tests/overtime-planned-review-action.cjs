'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');
const reportScript=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const start=html.indexOf('function p79OpenPlannedOvertimeReview('),end=html.indexOf('\n        }',start);
assert(start>=0&&end>start,'review function must be present');
const opened=[],alerts=[];
const row={empId:'A-1',dateKey:'2026/10/28',rosterDate:'2026-10-28',reportVerified:true,
 overtimeReport:{id:'R-501',planned:true,code:'休08-16',category:'休',typeName:'休息日加班',note:'原預排'},
 clockIn:{timeStr:'2026/10/28 08:00:00',id:'IN501'},
 clockOut:{timeStr:'2026/10/28 16:00:00',id:'OUT501'}};
let permitted=true,issue='';
const ctx={console,Date,Number,Math,String,Array,
 window:null,alerts,opened,
 p79OvertimePlannedDisplayedRows:[row],
 p79CanReportOvertime:()=>permitted,
 normalizeScheduleDateKey:x=>String(x||'').replaceAll('/','-'),
 p79DirectAttendanceTimestamp:x=>Date.parse(String(x.timeStr).replaceAll('/','-').replace(' ','T')+'+08:00'),
 p79OvertimeAttendanceIssue:()=>issue,
 p79WorkOvertimeRoster:(emp,date)=>({'2026-10-28':'休',__meta:{}}),
 alert:x=>alerts.push(x),
 P79Overtime:{openReport:x=>{opened.push(x);return x}}
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(html.slice(start,end+10),ctx);
const outcome=ctx.p79OpenPlannedOvertimeReview(0);
assert.equal(opened.length,1,'click opens one review form');
assert.equal(outcome.reportId,'R-501','existing cloud report ID reused');
assert.equal(outcome.lockOriginal,true,'original employee/date must stay locked');
assert.equal(outcome.savedReport,true);
assert.equal(outcome.plannedReview,true);
assert.equal(outcome.code,'休08-16');
assert.equal(outcome.category,'休');
assert.equal(outcome.note,'原預排');
assert(outcome.attendance.end>outcome.attendance.start);
assert(!html.slice(start,end).includes('saveOvertimeReportDirect'),'click never directly submits a report');
ctx.p79OvertimePlannedDisplayedRows=[{...row,clockOut:null}];
ctx.p79OpenPlannedOvertimeReview(0);
assert.equal(opened.length,1,'one punch cannot confirm');
ctx.p79OvertimePlannedDisplayedRows=[{...row,p79RestDraft:true}];
ctx.p79OpenPlannedOvertimeReview(0);
assert.equal(opened.length,1,'future draft cannot confirm');
ctx.p79OvertimePlannedDisplayedRows=[{...row,reportVerified:false}];
ctx.p79OpenPlannedOvertimeReview(0);
assert.equal(opened.length,1,'unknown cloud ID cannot confirm');
ctx.p79OvertimePlannedDisplayedRows=[row];issue='原始打卡待核';
ctx.p79OpenPlannedOvertimeReview(0);
assert.equal(opened.length,1,'invalid punch must be corrected first');
issue='';permitted=false;ctx.p79OpenPlannedOvertimeReview(0);
assert.equal(opened.length,1,'insufficient permission must not open form');
assert(alerts.length>=4,'blocked actions show a reason');
assert(html.includes('(!draft.plannedReview||existingReport.planned!==true)&&existingReport.category'),'actual review must re-save unchanged planned report, but future draft retry stays idempotent');
assert(html.includes("if(draft.plannedReview===true&&result.report?.planned!==false)"),'final save checks unplanned result from cloud');
assert(reportScript.includes("prefill.plannedReview===true?'確認正式申報'"),'original editor shows explicit confirmation button');
assert(reportScript.includes('plannedReview:editingExisting&&prefill.plannedReview===true'),'save carries review intent');
assert(reportScript.includes("if(draft.plannedReview===true&&result?.report?.planned!==false)"),'dialog never reports success on still-planned cloud state');
for(const tag of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(tag[1].trim())new vm.Script(tag[1]);
new vm.Script(reportScript);
console.log('PASS click-to-review reuses original ID, checks attendance and permissions, requires cloud planned=false, prevents false success and duplication');
