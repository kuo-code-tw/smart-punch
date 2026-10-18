const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
function fn(name){const a=html.indexOf('        function '+name+'(');assert(a>=0,name);return html.slice(a,html.indexOf('\n        }',a)+10)}
const c={Number,Math,getAttendanceTimestamp:r=>new Date(String(r.timeStr).replaceAll('/','-').replace(' ','T')+'+08:00').getTime()};vm.createContext(c);
for(const n of ['formatDurationMinutes','attendanceRowAttendanceMinutes','attendanceRowAttendanceText'])vm.runInContext(fn(n),c);
const row=(a,b)=>({clockIn:{timeStr:a},clockOut:{timeStr:b}});
assert.equal(c.attendanceRowAttendanceText(row('2026/10/18 07:39','2026/10/18 15:57')),'8 小時 18 分');
assert.equal(c.attendanceRowAttendanceText(row('2026/10/17 23:35','2026/10/18 07:51')),'8 小時 16 分');
assert.equal(c.attendanceRowAttendanceMinutes(row('2026/10/17 23:59','2026/10/18 00:00')),1);
assert.equal(c.attendanceRowAttendanceMinutes(row('2026/10/17 00:00','2026/10/18 00:00')),1440);
for(const r of [{}, {clockIn:{timeStr:'2026/10/18 07:39'}},row('2026/10/18 16:00','2026/10/18 07:00'),row('2026/10/17 00:00','2026/10/18 01:00'),row('2026/10/18','2026/10/18 07:00')])assert.equal(c.attendanceRowAttendanceText(r),'—');
const a=html.indexOf('<div id="adminRecordsTableContainer"'),b=html.indexOf('</thead>',a),headers=[...html.slice(a,b).matchAll(/<th\b[^>]*>([^<]*)<\/th>/g)].map(x=>x[1]);assert.equal(headers.length,13);assert(!headers.includes('工作日'));assert.equal(headers.indexOf('出勤時數')+1,headers.indexOf('加班時數'));
console.log('PASS elapsed attendance duration, overnight/midnight/24-hour boundaries, incomplete/invalid punches, and requested column order');
