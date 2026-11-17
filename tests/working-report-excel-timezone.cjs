'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
process.env.TZ = 'Asia/Taipei';
const html = fs.readFileSync(path.resolve(__dirname, '../aqc-efficiency/index.html'),'utf8');
function extract(name){
  const regex = new RegExp('function '+name+'\\([^]*?\\n\\}');
  const match = html.match(regex);
  assert.ok(match,'missing helper '+name);
  return match[0];
}
const scope={Date, XLSX:{SSF:{parse_date_code:()=>null}}};
vm.runInNewContext(
  ['excelTime','excelDateTime','workingValueDatePart','workingValueTimePart','combineWorkingDateTimeValues'].map(extract).join('\n'),
  scope
);
function excelDate(y,m,d,h,minute){return new Date(Date.UTC(y,m-1,d,h,minute));}
assert.equal(scope.excelTime(excelDate(1899,12,30,9,2)),'09:02');
assert.equal(scope.excelTime(excelDate(1899,12,30,12,0)),'12:00');
assert.equal(scope.excelTime(excelDate(1899,12,30,22,0)),'22:00');
assert.equal(scope.excelTime(excelDate(1899,12,30,0,41)),'00:41');
assert.equal(scope.excelTime(0.376388888888),'09:02');
const start = scope.excelDateTime(excelDate(2026,11,7,9,2));
assert.equal(start.getHours(),9);
assert.equal(start.getDate(),7);
const next = scope.excelDateTime(excelDate(2026,11,8,0,41));
assert.equal(next.getHours(),0);
assert.equal(next.getDate(),8);
const late = scope.combineWorkingDateTimeValues([excelDate(2026,11,7,23,55)]);
assert.equal(late.getDate(),7);
assert.equal(late.getHours(),23);
assert.equal(scope.workingValueTimePart(excelDate(1899,12,30,16,0)).h,16);
console.log('PASS: WORKING REPORT / WORKING SHEET Excel local time and midnight regression');
