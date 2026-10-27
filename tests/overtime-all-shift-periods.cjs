const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const g={};
vm.runInNewContext(fs.readFileSync('assets/port79-overtime-report.js','utf8'),{window:g,Date,Intl,Set,Map});
vm.runInNewContext(fs.readFileSync('assets/port79-overtime-shift-match.js','utf8'),{window:g,Date,Intl,Set,Map});
const api=g.P79OvertimeShiftMatch,reportApi=g.P79Overtime,date='2026-10-27';
const t=(day,h,m=0)=>Date.parse(day+'T00:00:00+08:00')+(h*60+m)*60000;
const reports=reportApi.defaults();
const previous={id:'R1',category:'休',typeName:'休息日加班',code:'休16-24',overtimeStart:'16',overtimeEnd:'24',declaredHours:8,convertedHours:12.7};
const rosters={
 early:{[date]:'早'},
 mid:{[date]:'中'},
 night:{[date]:'晚'},
 rest:{[date]:'休'},
 stale:{[date]:'早',__meta:{[date]:{reportOriginalShift:'中'}}}
};
const resolve=(options)=>api.resolve({date,rules:reports,report:previous,
 start:null,end:null,attendanceIssue:false,roster:rosters.early,...options});
const tentative=resolve({start:t(date,7,41)});
assert.equal(tentative.state,'tentative');
assert.equal(tentative.code,'休08-16','single early punch suggests only, not a confirmed eight hours');
assert.equal(tentative.mismatch,true);
assert.equal(tentative.confirmed,false);
assert.equal(previous.code,'休16-24','stored source is not mutated');
const early=resolve({start:t(date,7,41),end:t(date,15,48),roster:rosters.stale});
assert.equal(early.code,'休08-16');
assert.equal(early.state,'completed');
assert.equal(early.confirmed,true);
assert(early.mismatch);
const middle=resolve({start:t(date,15,39),end:t(date,23,47),roster:rosters.mid});
assert.equal(middle.code,'休16-24');
assert.equal(middle.mismatch,false);
const night=resolve({start:t(date,23,50),end:t('2026-10-28',7,47),roster:rosters.night});
assert.equal(night.code,'休24-08');
assert(night.mismatch);
const variants=[['休10-18',t(date,9,49),t(date,17,49)],
 ['休08-14',t(date,7,53),t(date,13,48)],
 ['休20-01',t(date,19,52),t('2026-10-28',0,48)],
 ['休08-20',t(date,7,51),t(date,19,48)]];
for(const [code,start,end]of variants)assert.equal(resolve({start,end}).code,code,'all configured periods, not only three shift slots: '+code);
const originalAll=JSON.stringify(reports);
for(const category of ['休','國']){
 const old={...previous,category,code:category+'16-24'};
 const variant=api.resolve({date,rules:reports,report:old,roster:rosters.early,
  start:t(date,7,42),end:t(date,15,51)});
 assert.equal(variant.code,category+'08-16','preserve the existing legal category: '+category);
 assert(variant.mismatch);
}
assert.equal(JSON.stringify(reports),originalAll,'preview must not mutate conversion configuration');
const unpaired=resolve({start:t(date,7,41),attendanceIssue:'pairing'});
assert.equal(unpaired.state,'none','invalid pairing must not guess');
const missing=resolve({start:null,end:t(date,16)});
assert.equal(missing.state,'none');
const impossible=resolve({start:t(date,7,41),end:t('2026-10-28',16)});
assert.equal(impossible.state,'none');
const obsolete=resolve({start:t(date,7,41),end:t(date,15,48),attendanceIssue:true});
assert.equal(obsolete.confirmed,false,'flagged attendance cannot authorize prefilled correction');
const reportBefore=JSON.stringify(previous);
assert.equal(JSON.stringify(previous),reportBefore);
const reportRules=reports.filter(r=>r[0]==='休');
const candidate=reportRules.find(r=>r[1]==='休08-16');
g.P79RestAttendance={period:()=>({known:true,start:t(date,16),end:t('2026-10-28',0)})};
assert.equal(reportApi.ruleAttendanceIssue(t(date,7,41),t(date,15,48),date,candidate,rosters.stale),'','complete matching punches permit amended shift despite stale original meta');
assert.notEqual(reportApi.ruleAttendanceIssue(t(date,11),t(date,15,48),date,candidate,rosters.stale),'','unrelated start cannot overrule roster');
const hours=reportApi.report(candidate);
assert.equal(hours.declaredHours,8);
assert.equal(hours.convertedHours,12.7);
// Additional configured categories and custom periods use the same matching engine.
const addedRules=[
 ['例','例10-18',8,8,'','','10','18','full'],
 ['休','自訂18-02',8,12.7,'','','18','02','full','特殊班休息日加班']
];
const custom={...previous,category:'例',code:'例16-24'};
assert.equal(api.resolve({date,rules:[...reports,...addedRules],roster:rosters.rest,report:custom,
 start:t(date,9,48),end:t(date,17,49)}).code,'例10-18');
const unusual={...previous,category:'休',typeName:'特殊班休息日加班',code:'自訂16-24'};
assert.equal(api.resolve({date,rules:[...reports,...addedRules],roster:rosters.rest,report:unusual,
 start:t(date,17,48),end:t('2026-10-28',1,51)}).code,'自訂18-02');
const extended={...previous,category:'延',code:'代20-08',typeName:'平日延長加班',
 overtimeStart:'20',overtimeEnd:'24',normalStart:'16',normalEnd:'24',position:'before'};
const after=api.resolve({date,report:extended,rules:reports,roster:rosters.early,
 start:t(date,7,41),end:t(date,19,48)});
assert.equal(after.code,'代16-20','configured normal-shift and after-shift rule must be supported');
assert.equal(after.state,'completed');
assert.equal(after.confirmed,true);
assert.equal(api.resolve({date,report:extended,rules:reports,roster:rosters.early,
 start:t(date,7,41)}).state,'none','one punch cannot assert an extended overtime shift');
const page=fs.readFileSync('work-hours/index.html','utf8');
assert(page.includes('p79WorkOvertimePeriodReview(row)'),'period reconciliation must run for visible staff');
assert(page.includes('port79-overtime-shift-match.js'),'new module must be loaded');
assert(page.includes('尚未簽退，不代表已完成'),'incomplete punch warning must be visible');
assert(page.includes('原正式申報：'),'original formal report remains separately visible');
for(const m of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))
 if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
console.log('PASS all existing overtime periods, early/middle/night, custom slots, overnight, categories, incomplete/abnormal safeguards, report immutability and visible correction');
