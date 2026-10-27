const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const schedule=fs.readFileSync('schedule/index.html','utf8'),html=fs.readFileSync('work-hours/index.html','utf8');
const matcher=fs.readFileSync('assets/port79-overtime-shift-match.js','utf8');
const reports=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const g={};
vm.runInNewContext(reports,{window:g,Date,Intl,Set,Map});
vm.runInNewContext(matcher,{window:g,Date,Intl,Set,Map});
const date='2026-10-27',base=Date.parse(date+'T00:00:00+08:00');
const at=(h,m=0)=>base+(h*60+m)*60000;
const rules=[...g.P79Overtime.defaults(),['例','例08-16',8,8,'','','08','16','full']];
const examples=[
 ['休16-24','休08-16','休','早',at(7,41),at(15,48)],
 ['休08-16','休16-24','休','中',at(15,39),at(23,48)],
 ['國16-24','國08-16','國','早',at(7,42),at(15,51)],
 ['例16-24','例08-16','例','早',at(7,43),at(15,49)],
 ['休16-24','休24-08','休','晚',at(23,43),at(31,48)],
 ['休16-24','休20-01','休','中',at(19,43),at(24,48)],
 ['休16-24','休10-18','休','早',at(9,45),at(17,48)]
];
for(const [previous,expected,category,shift,start,end] of examples){
 const original={id:'OT-'+previous,category,code:previous,
  overtimeStart:previous.slice(-5,-3),overtimeEnd:previous.slice(-2),
  declaredHours:8,convertedHours:12.7};
 const before=JSON.stringify(original);
 const result=g.P79OvertimeShiftMatch.resolve({date,rules,report:original,roster:{[date]:shift},start,end,attendanceIssue:false});
 assert.equal(result.code,expected,previous+' -> '+expected);
 assert.equal(result.state,'completed');
 assert.equal(result.confirmed,true);
 assert(result.mismatch);
 assert.equal(JSON.stringify(original),before,'cloud report never mutated by review');
}
const one=g.P79OvertimeShiftMatch.resolve({date,rules,report:{
 id:'R',category:'休',code:'休16-24',overtimeStart:'16',overtimeEnd:'24'},
 roster:{[date]:'早'},start:at(7,41),end:NaN});
assert.equal(one.code,'休08-16');
assert.equal(one.state,'tentative');
assert.equal(one.confirmed,false,'one punch cannot approve formal correction');
assert(schedule.includes("localStorage.setItem('port79_schedule_month_saved_v1'"),'confirmed roster save must broadcast');
assert(schedule.includes('p79MarkScheduleCloudWriteConfirmed(snapshotVersion);'),'broadcast follows an acknowledged GAS save');
assert(html.includes("'port79_schedule_month_saved_v1','p79_schedule_overtime_changed_v1'"),'work-hours listens for both saved rosters and corrected report notifications');
assert(html.includes('p79WorkOvertimeMonths.delete(key)'),'old roster month is invalidated');
assert(html.includes('p79LoadWorkOvertimeMonths(records,key,true)'),'new official schedule is fetched');
assert(html.includes('if(p79WorkhoursIsEditing())'),'edits must not be overwritten by refresh');
assert(html.includes('依最新打卡與班表比對：'),'all employee overtime rows show their inferred period');
assert(html.includes('原正式申報：'),'original report remains available on anomaly hover');
assert(!html.includes('正在同步原申報時段'),'misleading automatic-sync display removed');
const warningStart=html.indexOf('const changingPeriod=!!(row.reportVerified&&periodReview?.mismatch&&periodReview.suggested);');
const warningEnd=html.indexOf('// Punch-derived overtime is available immediately.',warningStart);
assert(warningStart>=0&&warningEnd>warningStart);
const warning=new Function('row','periodReview','escapeHtml','p79OvertimePeriodLabel',html.slice(warningStart,warningEnd)+'return periodSuggestion;');
const row={reportVerified:true,overtimeReport:{category:'休',code:'休16-24'}};
const review={mismatch:true,confirmed:true,state:'completed',suggested:{code:'休08-16'},code:'休08-16',reason:'需核對'};
const resultBadge=warning(row,review,x=>String(x),r=>r.code);
assert.match(resultBadge,/⚠ 時段待核對/,'confirmed mismatch displays only compact warning');
assert.match(resultBadge,/title="依最新打卡與班表比對：休08-16/,'long explanation lives in native hover tooltip');
assert.match(resultBadge,/原正式申報：休16-24/,'original report is available in hover');
assert(!resultBadge.includes('<small')&&!resultBadge.includes('rounded-lg border'),'long warning card removed');
assert.equal(warning(row,{...review,mismatch:false},x=>String(x),r=>r.code),'','matched periods produce no warning');
assert.match(warning(row,{...review,state:'tentative',confirmed:false},x=>String(x),r=>r.code),/時段暫估/,'incomplete punch uses tentative color');
assert(html.includes('escapeHtml(p79OvertimePeriodLabel(row.overtimeReport))'),'the original cloud declaration stays in the visible summary');

assert(html.includes('尚未簽退，不代表已完成'),'incomplete punch cannot create fake full-day hours');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
for(const m of scripts)if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
console.log('PASS all employee shifts / types, overnight and configured periods; partial punch safeguards; schedule save notifications and live view refresh');
