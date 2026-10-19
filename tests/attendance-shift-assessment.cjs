const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
function fn(name){const start=html.indexOf('        function '+name+'(');assert(start>=0,name);return html.slice(start,html.indexOf('\n        }',start)+10)}
const states=new Map(),loads=[];
const c={Date,Map,Set,Number,String,Array,Math,console,p79AttendanceOvertimeMonths:states,
  getAttendanceTimestamp:r=>new Date(r.timeStr.replaceAll('/','-').replace(' ','T')).getTime(),
  getAttendanceEmployeeMasterToken:()=> 'session',p79LoadAttendanceOvertimeMonth:m=>loads.push(m)};
vm.createContext(c);
for(const name of ['scheduleDateKey','p79AttendanceScheduleAssessment','p79MarkAttendanceDateConflicts','p79AttendanceRowAssessment','p79FilterAttendanceStatus'])vm.runInContext(fn(name),c);
function roster(schedule,extra={}){states.set('2026-10',{ready:true,token:'session',rows:[{empId:'E1',schedule}],covers:[],...extra})}
function row(start,end){return{empId:'E1',clockIn:{timeStr:start},clockOut:{timeStr:end}}}
const day=(a,b)=>row('2026/10/17 '+a,'2026/10/17 '+b);
let passed=0;function test(name,run){run();passed++;console.log('PASS '+name)}
test('removed schedule mismatch rule no longer flags complete midnight pair',()=>{roster({'2026-10-17':'早'});assert.equal(c.p79AttendanceRowAssessment(day('00:00','15:45')).kind,'NORMAL')});
test('normal early shift and exact-hour seconds stay normal',()=>{for(const t of ['05:00','07:31','07:59','08:00:59'])assert.equal(c.p79AttendanceRowAssessment(day(t,'15:45')).kind,'NORMAL')});
test('removed schedule timing rule does not flag late complete pairs',()=>assert.equal(c.p79AttendanceRowAssessment(day('08:45','15:45')).kind,'NORMAL'));
test('IN minutes 01–30 no longer create warnings',()=>{assert.equal(c.p79AttendanceRowAssessment(day('07:15','15:45')).kind,'NORMAL');assert.equal(c.p79AttendanceRowAssessment(day('07:45','15:30')).kind,'NORMAL')});
test('real midnight night shift stays normal',()=>{roster({'2026-10-16':'晚','2026-10-17':'晚'});assert.equal(c.p79AttendanceRowAssessment(day('00:00','07:45')).kind,'NORMAL')});
test('night shift can check in the previous evening',()=>{assert.equal(c.p79AttendanceRowAssessment(row('2026/10/16 23:45','2026/10/17 07:45')).kind,'NORMAL')});
test('middle shift crossing midnight stays normal',()=>{roster({'2026-10-17':'中'});assert.equal(c.p79AttendanceRowAssessment(row('2026/10/17 15:45','2026/10/18 00:00')).kind,'NORMAL')});
test('approved midnight overtime start is accepted on an early shift',()=>{roster({'2026-10-17':'早',__meta:{'2026-10-17':{overtime:true,overtimeStart:'00:00',overtimeEnd:'08:00'}}});assert.equal(c.p79AttendanceRowAssessment(day('00:00','15:45')).kind,'NORMAL')});
test('second split substitute uses noon rather than 08:00',()=>{roster({'2026-10-17':'早'},{covers:[{startDate:'2026-10-17',endDate:'2026-10-17',workerIds:['E0','E1'],mode:'two'}]});assert.equal(c.p79AttendanceRowAssessment(day('11:45','15:45')).kind,'NORMAL')});
test('roster loading does not mark a valid complete attendance pair abnormal',()=>{states.clear();assert.equal(c.p79AttendanceRowAssessment(day('07:45','15:45')).kind,'NORMAL')});
test('cross-month midnight night shift uses previous workday roster',()=>{roster({'2026-10-31':'晚'});states.set('2026-11',{ready:true,token:'session',rows:[{empId:'E1',schedule:{'2026-11-01':'休'}}],covers:[]});assert.equal(c.p79AttendanceRowAssessment(row('2026/11/01 00:00','2026/11/01 07:45')).kind,'NORMAL');assert.equal(loads.length,0)});
test('manual minute exemption does not hide a schedule mismatch',()=>{roster({'2026-10-17':'早'});const r=day('00:00','15:45');r.clockIn.manuallyEdited=true;assert.equal(c.p79AttendanceRowAssessment(r).kind,'NORMAL')});
test('minute-only cases stay out of abnormal filter and remain normal',()=>{const rows=[day('07:15','15:45'),day('07:45','15:45')];assert.equal(c.p79FilterAttendanceStatus(rows,'ABNORMAL').length,0);assert.equal(c.p79FilterAttendanceStatus(rows,'NORMAL').length,2);assert.equal(rows[0].clockIn.timeStr,'2026/10/17 07:15')});
test('missing and impossible punch pairs keep existing assessments',()=>{assert.equal(c.p79AttendanceRowAssessment(day('16:00','15:45')).status,'班次時間異常');const r=day('07:45','15:45');delete r.clockIn;assert.equal(c.p79AttendanceRowAssessment(r).status,'缺少簽到')});
test('all inline scripts parse',()=>{for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1])});
console.log(JSON.stringify({passed,failed:0}));

const inverted=[{empId:'E1',clockIn:{empId:'E1',timeStr:'2026/10/09 23:36'}},{empId:'E1',clockOut:{empId:'E1',timeStr:'2026/10/09 07:48'}}];
const marked=c.p79MarkAttendanceDateConflicts(inverted);
assert(marked.every(r=>c.p79AttendanceRowAssessment(r).status==='補卡日期待核對'));
assert(!inverted.some(r=>r.dateConflict),'source records must not mutate');
assert.equal(marked[1].clockOut.timeStr,'2026/10/09 07:48');
const unrelated=[inverted[0],{empId:'E2',clockOut:{empId:'E2',timeStr:'2026/10/09 07:48'}}];assert(!c.p79MarkAttendanceDateConflicts(unrelated).some(r=>r.dateConflict));
