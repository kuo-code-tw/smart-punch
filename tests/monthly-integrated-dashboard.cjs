const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const home=read('index.html'),script=read('assets/port79-monthly-dashboard.js'),css=read('assets/port79-monthly-dashboard.css');
const report=require('../assets/port79-monthly-dashboard.js');
function test(name,run){run();console.log('PASS '+name)}
test('UI uses the selected month, top vessel / bottom attendance and existing history database',()=>{
 const first=home.indexOf('class="p79d-section p79d-vessel"'),second=home.indexOf('class="p79d-section p79d-attendance"');
 assert(first>0&&second>first);
 for(const id of ['p79DashMonth','p79DashRefresh','p79DashShipCount','p79DashMoves','p79DashContainers','p79DashGph',
  'p79DashAttendancePeople','p79DashPunchRecords','p79DashPersonDays','p79DashPunchIns','p79DashPeopleRanking']){
  assert(home.includes('id="'+id+'"'),'missing '+id);
 }
 assert(home.includes("onclick=\"location.href='./history-data/'\""),'history database nav');
 assert(home.includes('id="punchLoginBtn"'),'punch button intact');
 assert(home.includes('id="manageLoginBtn"'),'manage button intact');
 assert(home.includes("onclick=\"launchSystem('attendance')\""),'original attendance route');
 assert(home.includes("onclick=\"launchSystem('efficiency')\""),'original vessel route');
});
test('UI is read-only and does not modify the databases or punch handlers',()=>{
 assert(script.includes('historyGetMonthData'),'uses original read-only service');
 assert(script.includes("data.month&&String(data.month)!==ym"),'reject mismatched months');
 assert(!script.includes("method:'POST'")&&!script.includes('historyBackupMonth'),'no write API calls');
 assert(script.includes('s.punchOnly')||script.includes('s?.punchOnly'),'punch mode access guard');
 assert(css.includes('body:has(#systems.show)'),'admin-only CSS selector');
 assert(!css.includes('#punchLoginBtn')&&!css.includes('#cardAttendance{display:none'),'never restyle the punch button');
});
test('vessel monthly totals, weighted GPH and personnel efficiency follow valid source rows',()=>{
 const d=report.analyzeVessels({shipMasters:[
 {vesselName:'船 A',workingNo:'0196',totalMoves:600,totalContainers:540,gph:25},
 {vesselName:'船 B',workingNo:'0196-2',totalMoves:200,totalContainers:230,gph:20}
 ],records:[
 {name:'員工甲',empId:'1',disc:60,load:40,timeHours:4},
 {name:'員工乙',empId:'2',disc:15,load:35,timeHours:5},
 {name:'員工丙',empId:'3',disc:10,load:20}
 ]});
 assert.equal(d.count,2);assert.equal(d.moves,800);assert.equal(d.containers,770);
 assert.equal(d.averageGph,23.75);
 assert.equal(d.people[0].name,'員工甲');assert.equal(d.people[0].efficiency,25);
 assert.equal(d.people.find(x=>x.name==='員工丙').efficiency,null);
});
test('incomplete source fields are unknown not invented zeros',()=>{
 const d=report.analyzeVessels({shipMasters:[{vesselName:'船 A'}],records:[]});
 assert.equal(d.count,1);assert.equal(d.moves,null);assert.equal(d.containers,null);assert.equal(d.averageGph,null);
 assert.throws(()=>report.analyzeVessels({shipMasters:null}));
});
test('attendance count is punch history, never a fabricated attendance rate',()=>{
 const d=report.analyzeAttendance({records:[
 {empId:'1',timeStr:'2026-10-02 08:00',type:'上班'},
 {empId:'1',timeStr:'2026-10-02 17:00',type:'下班'},
 {empId:'2',timeStr:'2026-10-09 08:00',status:'簽到'}
 ]},'2026-10');
 assert.equal(d.peopleCount,2);assert.equal(d.personDays,2);
 assert.equal(d.recordCount,3);assert.equal(d.punchIn,2);assert.equal(d.punchOut,1);
 assert.deepEqual(d.weeks,[2,1,0,0,0]);
 assert(!Object.hasOwn(d,'attendanceRate'),'no attendance rate without schedule denominator');
});
console.log('PASS full integrated dashboard scope and monthly data safeguards');
