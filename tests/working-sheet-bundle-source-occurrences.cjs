'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const slice=(start,end)=>{
 const i=html.indexOf('function '+start+'('),j=html.indexOf('function '+end+'(',i+1);
 assert(i>=0&&j>i,'missing production parser '+start);
 return html.slice(i,j);
};
const rows=[];
const line=(name='',note='',stop='')=>{
 const a=Array(20).fill('');a[4]=name;
 if(name){a[1]='08:00';a[3]='10:00';}
 a[17]=stop;a[19]=note;return a;
};
// Regression for actual reported 19 vs 16 class: one 13-deduct Bundle plus
// two SEPARATE worksheet rows with identical 1BN/4FR (3 each).
rows.push(line('Driver A','4BN/17FR'));
rows.push(line('','1BN/4FR'));
rows.push(line('','1BN/4FR'));
rows.push(line('Driver B',''));
const c={
 num:x=>Number(x)||0,
 XLSX:{utils:{sheet_to_json:ws=>ws.rows}},
 normSheetLabel:x=>String(x||'').trim().toUpperCase(),
 gcExcelDurationMinutes:()=>0,
 isWorkingReportOperationRow:r=>Boolean(r?.[4]&&r?.[1]&&r?.[3]),
 effectiveBundleRecord:x=>x,
 Set,Array,Number,String,Map
};
vm.createContext(c);
for(const pair of [['parseBundleRemark','scanWorkbookBundleEvidence'],
 ['scanWorkbookBundleEvidence','buildBundleImportAudit'],
 ['buildBundleImportAudit','workingSheetBundleInfo'],
 ['workingReportContinuationInfo','parseWorkingReportWorkbook']])
 vm.runInContext(slice(...pair),c);
const p=c.parseBundleRemark;
const check=(text,deduct)=>assert.equal(p(text).deduct,deduct,'normalize source remark: '+text);
check('4BN/17FR',13);
check('1BN/4FR',3);
check('1BN／4FR',3);
check('1BN：4FR',3);
check('BN:1／FR:4',3);
check('1BN,4FL',3);
check('1BN 4FR',3);
check('BN2/7FL',5);
check('2BN/FL7',5);
check('FL7/2BN',5);
check('7FR/BN2',5);
check('FR40×4/1BN',3);
check('D7 1BN/4FR,1BN/4FR',6);
check('備註沒有 BN/FL 配對',0);
const col={name:4,start:1,end:3,stopItem:17,stopTime:18,remark:19};
const full=c.workingReportContinuationInfo(rows,0,col);
assert.equal(full.bundle.deduct,19,'same remarks in DIFFERENT source rows must accumulate 13+3+3=19');
assert.equal(full.bundle.items.length,3);
const book={Sheets:{'WORKING REPORT':{rows}}};
const source=c.scanWorkbookBundleEvidence(book);
assert.equal(source.reportDeduct,19,'source-scanner also counts physical rows, not unique text');
assert.equal(source.hits.length,3);
let result=c.buildBundleImportAudit(book,{bundleDeduct:19},[
 {bundleDeduct:19,bundleBn:6,bundleFl:25}
]);
assert.equal(result.ok,true,'matching independently verified 19 must pass, with no fabricated records');
const duplicate=rows.map(row=>row.slice());duplicate[1][17]='1BN/4FR';
const single=c.workingReportContinuationInfo(duplicate,0,col);
assert.equal(single.bundle.deduct,19,'same event copied into two columns of one physical row must count once');
result=c.buildBundleImportAudit(book,{bundleDeduct:19},[{bundleDeduct:16}]);
assert.equal(result.ok,false,'real source gap 19 vs 16 must still stop import');
assert(result.errors.some(x=>x.includes('19')&&x.includes('16')));
const lacking={Sheets:{'WORKING REPORT':{rows:[line('Driver A','4BN/17FR'),line('','1BN/4FR'),line('Driver B','')]}}};
assert.equal(c.scanWorkbookBundleEvidence(lacking).reportDeduct,16);
assert.equal(c.buildBundleImportAudit(lacking,{bundleDeduct:19},[{bundleDeduct:16}]).ok,false,
 'missing original source cannot be invented to force 19');
console.log('PASS Bundle autodetection: 19 vs 16 repeated-source-row repair, mixed notations, same-row dedupe, strict source audit');
