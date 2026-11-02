'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const paths = ['attendance/index.html', 'work-hours/index.html'];
function sourceFunction(html, name) {
  const begin = html.indexOf('        function '+name+'(');
  assert(begin >= 0, name+' exists');
  const end = html.indexOf('\n        }', begin);
  assert(end > begin, name+' ends');
  return html.slice(begin, end + 10);
}
for (const path of paths) {
  const html = fs.readFileSync(path, 'utf8');
  const raw = [
    {id:1,location:'高雄港萬海79號碼頭',timeStr:'2026/10/01 08:01'},
    {id:2,location:'高雄港高海79號碼頭',timeStr:'2026/10/01 16:01'},
    {id:3,location:'新增加班地點',timeStr:'2026/10/01 17:01'}
  ];
  const before = JSON.stringify(raw);
  const env = {sysConfig:{locationName:'高雄港萬海79號碼頭',lat:22.557128,lng:120.337712,radius:100,
    extraLocations:[{name:'新增加班地點',lat:22.61,lng:120.41,radius:150}]},
    defaultConfig:{locationName:'79號碼頭'},JSON,Array,Number,Math,String};
  vm.createContext(env);
  vm.runInContext(sourceFunction(html,'normalizeExtraLocations'),env);
  vm.runInContext(sourceFunction(html,'formatAttendanceLocationDisplay'),env);
  vm.runInContext(sourceFunction(html,'getConfiguredPunchLocations'),env);
  // Regression: old cloud name used to override the corrected display.
  assert.equal(env.formatAttendanceLocationDisplay(raw[0].location),'79號碼頭',path+' stale config');
  assert.equal(env.formatAttendanceLocationDisplay(raw[1].location),'79號碼頭',path+' alternate legacy label');
  assert.equal(env.formatAttendanceLocationDisplay('79號碼頭/10m (範圍內)'),'79號碼頭');
  assert.equal(env.formatAttendanceLocationDisplay('高雄港萬海79號碼頭/10m (範圍內)'),'79號碼頭');
  assert.equal(env.getConfiguredPunchLocations()[0].name,'79號碼頭');
  assert.equal(env.getConfiguredPunchLocations()[1].name,'新增加班地點','additional GPS site preserved');
  assert.equal(env.formatAttendanceLocationDisplay(raw[2].location),'新增加班地點');
  env.sysConfig.locationName='79號碼頭';
  assert.equal(env.formatAttendanceLocationDisplay(raw[0].location),'79號碼頭','saved config');
  env.sysConfig.locationName='改名後的正式碼頭';
  assert.equal(env.formatAttendanceLocationDisplay(raw[0].location),'改名後的正式碼頭','future primary renames');
  assert.equal(env.getConfiguredPunchLocations()[0].name,'改名後的正式碼頭');
  assert.equal(env.formatAttendanceLocationDisplay('新增加班地點'),'新增加班地點');
  assert.equal(env.formatAttendanceLocationDisplay('管理員手動補卡'),'管理員手動補卡');
  assert.equal(JSON.stringify(raw), before,'original punch records never mutated');
  // Check actual record table uses formatter at the last output point,
  // not a cached pre-built locationText string.
  assert(html.includes('formatAttendanceLocationDisplay(row.locationText)'),
    path+' record table final display');
  assert(html.includes("if (f.key === 'location') val = formatAttendanceLocationDisplay(r.location)"),
    path+' company compatible location export');
  assert(html.includes('const sheetRows = [selectedFields.map(f => f.label)]'),
    path+' existing export columns retained');
}
console.log('PASS two pages: stale primary aliases show 79號碼頭; new sites and original exports stay intact.');
