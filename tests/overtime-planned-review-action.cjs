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
 P79Overtime:{openReport:x=>{opened.push(x);return x},reportRules:()=>[
  ['休','休08-16',8,12.7,'','','08','16','full','休息日加班'],
  ['休','休16-24',8,12.7,'','','16','24','full','休息日加班']
 ]}
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('assets/port79-overtime-shift-match.js','utf8'),ctx);
const helperStart=html.indexOf('function p79ResolvePlannedOvertimePeriod(');
const helperEnd=html.indexOf('\n        }',helperStart);
assert(helperStart>=0&&helperEnd>helperStart,'shared planned-period resolver exists');
vm.runInContext(html.slice(helperStart,helperEnd+10),ctx);
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
assert.equal(outcome.originalReportCode,'休08-16');
assert.equal(outcome.requirePeriodSelection,false);
// 宋文豪案例：完整早班打卡必須取代舊 16-24 畫面預設，原申報 ID 留在同一筆。
const oldPeriod={...row,clockIn:{...row.clockIn,timeStr:'2026/10/28 07:45:00'},
 clockOut:{...row.clockOut,timeStr:'2026/10/28 15:48:00'},
 overtimeReport:{...row.overtimeReport,code:'休16-24'}};
ctx.p79OvertimePlannedDisplayedRows=[oldPeriod];
const corrected=ctx.p79OpenPlannedOvertimeReview(0);
assert.equal(corrected.code,'休08-16','07:45-15:48 must open 08-16, not old 16-24');
assert.equal(corrected.originalReportCode,'休16-24','original cloud code retained only as concurrency baseline');
assert.equal(corrected.reportId,'R-501','correction must use same cloud ID');
assert.equal(corrected.requirePeriodSelection,false,'confirmed attendance has unique 08-16 period');
ctx.p79OvertimePlannedDisplayedRows=[row];
assert(outcome.attendance.end>outcome.attendance.start);
assert(!html.slice(start,end).includes('saveOvertimeReportDirect'),'click never directly submits a report');
ctx.p79OvertimePlannedDisplayedRows=[{...row,clockOut:null}];
ctx.p79OpenPlannedOvertimeReview(0);
assert.equal(opened.length,2,'one punch cannot confirm');
ctx.p79OvertimePlannedDisplayedRows=[{...row,p79RestDraft:true}];
ctx.p79OpenPlannedOvertimeReview(0);
assert.equal(opened.length,2,'future draft cannot confirm');
ctx.p79OvertimePlannedDisplayedRows=[{...row,reportVerified:false}];
ctx.p79OpenPlannedOvertimeReview(0);
assert.equal(opened.length,2,'unknown cloud ID cannot confirm');
ctx.p79OvertimePlannedDisplayedRows=[row];issue='原始打卡待核';
ctx.p79OpenPlannedOvertimeReview(0);
assert.equal(opened.length,2,'invalid punch must be corrected first');
issue='';permitted=false;ctx.p79OpenPlannedOvertimeReview(0);
assert.equal(opened.length,2,'insufficient permission must not open form');
assert(alerts.length>=4,'blocked actions show a reason');
assert(html.includes('(!draft.plannedReview||existingReport.planned!==true)&&existingReport.category'),'actual review must re-save unchanged planned report, but future draft retry stays idempotent');
assert(html.includes("if(draft.plannedReview===true&&result.report?.planned!==false)"),'final save checks unplanned result from cloud');
assert(reportScript.includes("prefill.plannedReview===true?'確認正式申報'"),'original editor shows explicit confirmation button');
assert(reportScript.includes('plannedReview:editingExisting&&prefill.plannedReview===true'),'save carries review intent');
assert(reportScript.includes("if(draft.plannedReview===true&&result?.report?.planned!==false)"),'dialog never reports success on still-planned cloud state');
for(const tag of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(tag[1].trim())new vm.Script(tag[1]);
new vm.Script(reportScript);
console.log('PASS click-to-review reuses original ID, checks attendance and permissions, requires cloud planned=false, prevents false success and duplication');
