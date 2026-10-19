const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
const start=html.indexOf('        function p79GetUnresolvedPriorClockIn('),end=html.indexOf('        function getOpenClockInShift(',start);
let rows=[],now=Date.parse('2026-10-19T09:34:00+08:00');
const c={currentEmp:{empId:'E1'},Date:{now:()=>now},getEmployeePunchRecords:()=>[],buildDailyAttendanceRows:()=>rows,getAttendanceTimestamp:r=>Date.parse(r.timeStr),getPunchChannel:()=> 'REGULAR',getPunchTypeFromStatus:s=>s==='上班簽到'?'IN':'OUT',getLatestEmployeePunchState:()=>null,getOpenClockInShift:()=>null,formatDateTime:s=>s,P79_PUNCH_DUPLICATE_WINDOW_MS:86400000};vm.createContext(c);vm.runInContext(html.slice(start,end),c);
const old={clockIn:{timeStr:'2026-10-17T07:35:00+08:00'}};rows=[old];assert.equal(c.validateEmployeePunchSequence('上班簽到').ok,false);assert.match(c.validateEmployeePunchSequence('上班簽到').message,/管理員補齊/);
// A later completed shift cannot silently clear an older missing signout.
rows=[old,{clockIn:{timeStr:'2026-10-18T07:35:00+08:00'},clockOut:{timeStr:'2026-10-18T17:35:00+08:00'}}];assert.equal(c.validateEmployeePunchSequence('上班簽到').ok,false);
rows=[{...old,clockOut:{timeStr:'2026-10-17T17:35:00+08:00'}}];assert.equal(c.validateEmployeePunchSequence('上班簽到').ok,true);
rows=[{clockIn:{timeStr:'2026-10-18T23:00:00+08:00'}}];assert.equal(c.p79GetUnresolvedPriorClockIn(),null,'overnight shift remains governed by existing 24h signout guard');
assert(html.includes('!openShift&&!unresolvedPrior'));console.log('PASS old missing signout blocks new IN until repaired, preserves completed and overnight shifts');
