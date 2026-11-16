'use strict';
// Read-only regression of cross-day credit versus actual attendance, for every staff member.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');
function between(a,b){
 const start=html.indexOf(a),end=html.indexOf(b,start+a.length);
 assert(start>=0&&end>start,'expected production code: '+a);
 return html.slice(start,end);
}
const monthCode=between('function p79WorkOvertimeLedgerMonth(row){','function initOvertimeFilters(');
const context={
 p79WorkOvertimeIsUnconfirmedPlan:row=>row?.planned===true||row?.overtimeReport?.planned===true,
 p79WorkOvertimeOfficialReport:report=>!!report?.id&&!report?.revoked,
};
vm.createContext(context);
vm.runInContext('function p79WorkOvertimeLedgerMonth(row){'+monthCode.split('function p79WorkOvertimeLedgerMonth(row){')[1],context);
const month=context.p79WorkOvertimeLedgerMonth;
const report={id:'R1',category:'延',overtimeDate:'2026-11-30',planned:false};
assert.equal(month({monthKey:'2026-12',reportVerified:true,overtimeReport:report}),'2026-11',
 'Nov 30 credit is counted in November even with Dec 1 actual workday');
assert.equal(month({monthKey:'2026-12',reportVerified:false,coverCandidate:true,overtimeDate:'2026-11-30',overtimeReport:{...report,id:''}}),'2026-12',
 'unconfirmed cover proposal cannot change official accounting month');
assert.equal(month({monthKey:'2026-12',reportVerified:true,overtimeReport:{...report,planned:true}}),'2026-12',
 'saved preplans are never credited as completed overtime');
assert.equal(month({monthKey:'2026-12',reportVerified:true,overtimeReport:{...report,attendanceReview:'待核'}}),'2026-12');
assert.equal(month({monthKey:'2026-12',reportVerified:true,overtimeReport:{...report,revoked:true}}),'2026-12');
assert.equal(month({monthKey:'2026-12',reportVerified:true,overtimeReport:{...report,overtimeDate:''}}),'2026-12');

const labelCode=between('const p79Attribution=String(row.overtimeDate','const p79OvertimeConversionFull=');
const inspect=new Function('row','p79WorkOvertimeIsUnconfirmedPlan','escapeHtml','normalizeScheduleDateKey','p79DirectAttendanceTimestamp',
 labelCode+';return {confirmed:p79AttributionConfirmed,text:p79AttributionText,cell:p79AttributionCell,issue:p79CrossDayPunchNotice};');
const asTime=r=>Date.parse(String(r.timeStr).replaceAll('/','-').replace(' ','T')+':00+08:00');
const check=row=>inspect(row,context.p79WorkOvertimeIsUnconfirmedPlan,x=>x,x=>String(x).replaceAll('/','-'),asTime);
const wong={dateKey:'2026-11-15',rosterDate:'2026-11-15',overtimeDate:'2026-11-14',
 reportVerified:false,clockIn:{timeStr:'2026/11/15 07:39'},clockOut:{timeStr:'2026/11/15 15:52'},
 overtimeReport:{category:'延',code:'延04-16',overtimeStart:'04',overtimeEnd:'08'}};
const pending=check(wong);
assert.equal(pending.confirmed,false);
assert.match(pending.text,/預排歸屬 2026-11-14/);
assert.match(pending.text,/未申報／待核/);
assert.match(pending.issue,/04-08打卡不符/);
assert.match(pending.cell,/2026-11-14/);
const huang=check({...wong,dateKey:'2026-11-08',rosterDate:'2026-11-08',overtimeDate:'2026-11-07',
 reportVerified:true,clockIn:{timeStr:'2026/11/08 03:38'},clockOut:{timeStr:'2026/11/08 15:53'},
 overtimeReport:{...wong.overtimeReport,id:'R-HUANG',overtimeDate:'2026-11-07',planned:false}});
assert.equal(huang.confirmed,true);
assert.match(huang.text,/加班歸屬 2026-11-07（已申報）/);
assert.equal(huang.issue,'');
assert(!html.includes('跨日歸入上班日期。'),'old misleading all-cross-day tooltip must be removed');
assert(html.includes('p79WorkOvertimeLedgerMonth(row) === monthEl.value'),'filter must use confirmed credit month');
assert(html.includes('p79WorkOvertimeLedgerMonth(row) === month)'),'daily ledger month must use confirmed credit month');
assert(html.includes('上班日期／加班歸屬'),'show distinct actual and credit dates');
for(const script of html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/g)){
 if(!/\\bsrc=|application\\/json|importmap/.test(script[1])&&script[2].trim())new vm.Script(script[2]);
}
console.log('PASS staff-wide overtime date display, Nov/Dec official credit, unreported mismatch, saved plans and previous-day proper reports');
