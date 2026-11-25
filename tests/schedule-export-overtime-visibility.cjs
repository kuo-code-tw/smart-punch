const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const asset=fs.readFileSync('assets/port79-schedule-transfer-roles.js','utf8');
const start=html.indexOf('    function p79ScheduleExportCellCode(');
const end=html.indexOf('    function p79ScheduleOvertimeExportRows_(',start);
assert(start>=0&&end>start);
const c={};vm.createContext(c);vm.runInContext(html.slice(start,end),c);
const cases=[
 ['早＋延16-20','早','早','早'],['晚＋延04-08','晚','晚','晚'],
 ['延16-20','早','早','早'],['休08-16','早','休','休'],
 ['例08-16','例','例','例'],['國08-16','國','國','國'],
 ['休08-16','晚','晚','晚'],['休08-16','休08-16','休08-16','休'],
 ['代08-16','中','中','中'],['延16-20','延16-20','延16-20','待排班'],
 ['早','早','早','早'],['打卡待核','打卡待核','早','打卡待核'],
 ['年','年','早','年'],['','', '', ''],['颱08-16','颱','颱','颱']
];
for(const [visibleCode,shownShift,rosterShift,expected] of cases){
 const selected={visibleCode,shownShift,rosterShift};
 assert.equal(c.p79ScheduleExportCellCode(selected,false),expected);
 assert.equal(c.p79ScheduleExportCellCode(selected,true),visibleCode);
 assert.equal(c.p79ScheduleExportCellCode(selected),visibleCode);
}
assert(asset.includes("mode==='export'&&includeOvertimeOption"));
assert(asset.includes('data-show-overtime checked'));
assert.equal((asset.match(/querySelectorAll\('\[data-role-index\]'\)/g)||[]).length,2);
assert(html.includes('row[String(d)]=p79ScheduleExportCellCode(selected,showOvertime)'));
assert(html.includes("'加班申報明細'")&&html.includes("'個人加班小計'"));
console.log('PASS: regular-only schedule export, full export, role selection isolation, report retention');
