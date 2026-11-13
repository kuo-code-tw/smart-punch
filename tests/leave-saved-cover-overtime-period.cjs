'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('leave/index.html','utf8');
const start=html.indexOf('function p79LeaveSavedOvertimePeriod(');
const end=html.indexOf('let p79SavedCoverReportBusy=false;',start);
assert(start>0&&end>start,'saved overtime detail period formatter must exist');
const context={String,Number,Object,Math};
vm.createContext(context);
vm.runInContext(html.slice(start,end),context);
const show=record=>context.p79LeaveSavedOvertimePeriod(record);
const before={id:'cloud-id-existing',category:'延',typeName:'平日延時加班',
 code:'延20-08',position:'before',normalStart:'24',normalEnd:'08',
 overtimeStart:'20',overtimeEnd:'24',declaredHours:4,convertedHours:6.02,planned:true};
const raw=JSON.stringify(before);
const resolved=show(before);
assert.equal(resolved.label,'延20-24','show four-hour overtime rather than full 20-08 shift');
assert.equal(resolved.originalCode,'延20-08','retain exact verified cloud report code for audit');
assert.equal(resolved.warning,'');
assert.equal(JSON.stringify(before),raw,'never write or mutate the original cloud overtime report');
const after=show({...before,code:'延16-04',position:'after',normalStart:'16',normalEnd:'24',
 overtimeStart:'24',overtimeEnd:'04'});
assert.equal(after.label,'延24-04','after-shift overnight extension excludes normal hours');
assert.equal(after.originalCode,'延16-04');
const early=show({...before,code:'延04-16',normalStart:'08',normalEnd:'16',
 overtimeStart:'04',overtimeEnd:'08'});
assert.equal(early.label,'延04-08','before-shift extension excludes following normal shift');
assert.equal(early.originalCode,'延04-16');
const same=show({...before,code:'延20-24'});
assert.equal(same.label,'延20-24');
assert.equal(same.originalCode,'','do not redundantly repeat a correct code');
const noOriginal=show({...before,code:'',planned:false});
assert.equal(noOriginal.label,'延20-24');
assert.equal(noOriginal.originalCode,'');
const mismatch=show({...before,overtimeEnd:'08'});
assert.equal(mismatch.label,'延20-08','never present 20-24 when saved overtime metadata says 20-08');
assert.match(mismatch.warning,/與原申報時數不符/);
const wrongHours=show({...before,declaredHours:12});
assert.equal(wrongHours.label,'延20-08');
assert.match(wrongHours.warning,/與原申報時數不符/);
const unknown=show({...before,overtimeEnd:null});
assert.equal(unknown.label,'延20-08');
assert.match(unknown.warning,/缺少可核對/);
assert.equal(show({...before,category:'休',code:'休20-08'}).label,'休20-08','non-extension reports remain unchanged');
assert.equal(show({...before,position:'full'}).label,'延20-08','unknown extension position is never inferred');
assert(html.includes('const period=p79LeaveSavedOvertimePeriod(report);'),'actual saved cover dialog must use formatter');
assert(html.includes("period.originalCode?'原申報代碼 '"),'traceable cloud code displayed separately');
assert(html.includes('period.warning||'), 'mismatched reports require explicit warning');
assert(html.includes('const report=employeeRow.schedule?.__meta?.[entry.date]?.overtimeReport;'),
 'dialog must read authenticated cloud report before formatting');
assert(html.includes("cell.textContent=(report.planned===true?'已儲存預排｜':'已正式申報｜')"),
 'planned and formal identity must be preserved');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))
 if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
console.log('PASS leave saved overtime: 20-08 full-work code yields verified 延20-24 actual 4h, original cloud code retained, no incorrect auto-fix, night shifts and immutable reports');
