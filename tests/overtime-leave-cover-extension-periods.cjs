'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const win={};vm.runInNewContext(source,{window:win,Date,Intl,Map,Set,TextEncoder});
const api=win.P79Overtime;
const begin=source.indexOf(' function p79AddLeaveSupportPeriods(source){');
const end=source.indexOf(' function reportRules(){',begin);
assert(begin>0&&end>begin,'leave-cover template helper exists');
const add=new Function('validate',source.slice(begin,end)+';return p79AddLeaveSupportPeriods;')(api.validate);
const original=api.defaults(),snapshot=JSON.stringify(original);
const first=add(original);
assert.equal(first.added,4);
const expected=[
 ['延16-04','16','24','24','04','after'],
 ['延04-16','08','16','04','08','before'],
 ['延24-12','24','08','08','12','after'],
 ['延12-24','16','24','12','16','before']
];
for(const [code,normalStart,normalEnd,otStart,otEnd,position] of expected){
 const r=first.rows.find(x=>x[1]===code);
 assert(r,code+' exists');
 assert.deepEqual(r.slice(4,9),[normalStart,normalEnd,otStart,otEnd,position]);
 assert.equal(r[0],'延','reuse existing extension type');
 assert.equal(Number(r[2]),4,'each person gets four hours, not 12 total working hours');
 assert.equal(Number(r[3]),6.02,'inherit the unique existing four-hour extension conversion');
 assert.equal(api.report(r).convertedHours,6.02,'conversion is available after saving rule');
}
assert.equal(JSON.stringify(original),snapshot,'no changes to original configuration or saved reports');
const second=add(first.rows);
assert.equal(second.added,0,'reopening must not insert duplicate rows');
assert.equal(second.rows.length,first.rows.length);
const custom=[...original,['延','自訂04-16','4','8.88','08','16','04','08','before']];
const kept=add(custom);
assert.equal(kept.added,3,'same actual overtime period is never duplicated');
assert(kept.rows.find(x=>x[1]==='自訂04-16'),'existing custom rule remains intact');
assert.equal(kept.rows.find(x=>x[1]==='自訂04-16')[3],'8.88','existing conversion cannot be overwritten');
assert(kept.rows.filter(x=>x[0]==='延'&&x[4]==='08'&&x[6]==='04'&&x[7]==='08').length===1);
assert.equal(kept.rows.find(x=>x[1]==='延16-04')[3],'','conflicting existing extension conversions require manual review');
assert(source.includes('loadedRows=JSON.stringify(validate(loaded.rows));'),'cloud snapshot remains unmodified until explicit Save');
assert(source.includes('const support=activeSupportPeriods(activeReportRows(loaded.rows,loaded.config),loaded.config);'),'deleted builtins do not regenerate automatic periods');
assert(source.includes('請核對換算值後按「儲存加班類型與出勤時段」寫入雲端'),'user sees truthful save requirement');
assert(source.includes('const draft=validate(getRows()),fresh=await loadRules(),deleted=[...removedBuiltinNames]'),'cloud concurrency and delete-state verification remain');
console.log('PASS four night/morning leave coverage periods, 4h conversion reuse, no duplicate, custom overrides retained, save only on confirmation');
