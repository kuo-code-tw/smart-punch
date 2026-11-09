'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
function extract(name,until){
 const start=html.indexOf('    function '+name+'('),end=html.indexOf('    function '+until+'(',start+1);
 assert(start>=0&&end>start,'function '+name+' -> '+until+' must exist');
 return html.slice(start,end);
}
const ctx={
 window:{},p79ScheduleAllowedEditShift:v=>['早','中','晚','休','例','國','年','事','病','公','喪','離'].includes(v),
 p79ScheduleDisplayDay:(emp,date)=>({visibleCode:({
  '2026-11-07':'延04-08','2026-11-08':'早','2026-11-09':'早＋延04-08',
  '2026-11-10':'中','2026-11-11':'晚','2026-11-12':'休',
  '2026-11-13':'例','2026-11-14':'國','2026-11-15':'延20-24',
  '2026-11-16':'颱08-16','2026-11-17':'打卡待核','2026-11-18':'年'
 })[date]||''})
};
vm.createContext(ctx);
vm.runInContext(extract('normalizeImportedScheduleShift','findImportColumnKey'),ctx);
vm.runInContext(extract('p79ScheduleExcelShiftCode','p79ScheduleExportDay'),ctx);
vm.runInContext(extract('p79ScheduleExportDay','p79ScheduleOvertimeExportRows_'),ctx);
const cases={
 '2026-11-07':'延04-08',
 '2026-11-08':'08-16',
 '2026-11-09':'08-16＋延04-08',
 '2026-11-10':'16-24',
 '2026-11-11':'24-08',
 '2026-11-12':'休',
 '2026-11-13':'例',
 '2026-11-14':'國',
 '2026-11-15':'延20-24',
 '2026-11-16':'颱08-16',
 '2026-11-17':'打卡待核',
 '2026-11-18':'年'
};
for(const [date,expected] of Object.entries(cases))
 assert.equal(ctx.p79ScheduleExportDay({id:'E1'},date),expected,date+' exported code');
assert.equal(ctx.p79ScheduleExcelShiftCode('中＋延20-24'),'16-24＋延20-24');
assert.equal(ctx.p79ScheduleExcelShiftCode('晚＋休00-08'),'24-08＋休00-08');
assert.equal(ctx.p79ScheduleExcelShiftCode('代04-08'),'代04-08','never manufacture or rename stored overtime');
assert.equal(ctx.p79ScheduleExcelShiftCode('早班'),'早班','only actual three short shift codes are transformed');
for(const [label,expected] of Object.entries({
 '08-16':'早','08:00-16:00':'早','16-24':'中','16:00-24:00':'中',
 '24-08':'晚','24:00-08:00':'晚','早':'早','中':'中','晚':'晚',
 '休':'休','例':'例','國':'國'})){
 assert.equal(ctx.normalizeImportedScheduleShift(label),expected,
  'import of generated Excel shift '+label+' must be reversible');
}
for(let emp=0;emp<83;emp++){
 for(let n=1;n<=31;n++){
  const shifts=['早','中','晚'];
  const input=shifts[(emp+n)%3];
  const expected={早:'08-16',中:'16-24',晚:'24-08'}[input];
  assert.equal(ctx.p79ScheduleExcelShiftCode(input),expected,
   '83-person monthly Excel shift conversion: employee '+emp+' day '+n);
 }
}
assert.equal(ctx.normalizeImportedScheduleShift('08-16＋延04-08'),null,
 'combined overtime must not silently become a roster edit');
assert.equal(ctx.normalizeImportedScheduleShift('延04-08'),null,
 'overtime codes are never imported as unapproved ordinary shift');
assert(html.includes("row[String(d)]=p79ScheduleExcelShiftCode(selected.visibleCode)"),
 'Excel writer must use the time conversion');
assert(html.includes("text:'颱日：原班別仍為 '+row[String(d)]"),
 'Excel notes must match the displayed Excel value');
console.log('PASS 83 employees × 31 days; Excel 早→08-16 中→16-24 晚→24-08; Nov7 延04-08 / Nov8 08-16; combined reports, leaves, statuses, reimport and cloud safety');
