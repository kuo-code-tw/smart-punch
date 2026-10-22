const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('schedule/index.html','utf8');
function fn(name,indent='    '){let a=html.indexOf('function '+name+'(');assert(a>=0,name);return html.slice(a,html.indexOf('\n'+indent+'}',a)+indent.length+2)}
const elements=Object.fromEntries(['todayScheduleDate','todayScheduleSummary','todayScheduleCounts','todayScheduleDetail','todayScheduleLeaveSummary'].map(id=>[id,{textContent:'',innerHTML:'',classList:{add(){},toggle(){}}}]));
const emps=[{id:'OLD',name:'已報到早班',reportingDate:'2026-10-01'},{id:'TODAY',name:'今日報到',reportingDate:'2026-10-18'},{id:'FUTURE',name:'未來報到',reportingDate:'2026-10-20'},{id:'ROC',name:'民國未來報到',reportingDate:'115/10/19'},{id:'LEAVE',name:'未報到休假',reportingDate:'2026-10-20'},{id:'NIGHT',name:'已報到晚班',reportingDate:'2026-10-17'},{id:'START',name:'未來到職',startDate:'2026-11-01'}].map(e=>({...e,role:'AQC'}));
const data=Object.fromEntries(emps.map(e=>[e.id,{'2026-10-18':e.id==='LEAVE'?'休':'早','2026-10-17':'晚'}]));
const c={Date,Intl,document:{getElementById:id=>elements[id]},employees:emps,monthlyScheduleData:data,monthlyScheduleMeta:{FUTURE:{'2026-10-18':{overtime:true,type:'substitute'}}},scheduleTaipeiTodayKey:()=> '2026-10-18',scheduleNightRosterDate:()=> '2026-10-17',scheduleNightRosterSource:()=>({data,meta:{}}),applyScheduleAttendanceMonthScope:()=>true,approvedLeaveForEmployee:()=>null,scheduleLeaveTypeText:x=>x,scheduleLeavePillClass:()=>'',scheduleEscapeHtml:x=>x,scheduleDutyBadge:()=>'',todayScheduleExpanded:true};vm.createContext(c);for(const n of ['p79EmploymentStartDate','p79EmployeeDateEligible'])vm.runInContext(fn(n,''),c);for(const n of ['normalizeScheduleEmploymentStatus','scheduleEmployeeEligibleForMonth','scheduleRosterLeaveLabel','renderTodaySchedulePanel'])vm.runInContext(fn(n),c);
c.renderTodaySchedulePanel();const text=elements.todayScheduleDetail.innerHTML;
for(const name of ['未來報到','民國未來報到','未報到休假','未來到職'])assert(!text.includes(name),name);
assert(text.includes('已報到早班'));assert(text.includes('今日報到'));const night=text.slice(text.indexOf('晚班 ·'));assert(night.includes('已報到晚班'));assert(!night.includes('今日報到'));
assert.equal(c.p79EmployeeDateEligible({reportingDate:'2026-10-18'},'2026-10-17'),false);assert.equal(c.p79EmployeeDateEligible({reportingDate:'2026-10-18'},'2026-10-18'),true);assert.equal(c.p79EmployeeDateEligible({reportingDate:'2026-10-20',startDate:'2026-10-01'},'2026-10-18'),false);assert.equal(c.p79EmployeeDateEligible({},'2026-10-18'),true);
assert(!elements.todayScheduleSummary.textContent.includes('休假 1'));assert(!elements.todayScheduleSummary.textContent.includes('加班／代班 1'));assert.deepEqual(data.FUTURE,{'2026-10-18':'早','2026-10-17':'晚'});
console.log('PASS future reporting/start dates excluded from today, previous night, leave/overtime and counts; reporting day included; ROC date and existing rows preserved');

for(const n of ['normalizeScheduleEmploymentStatus','scheduleEmployeeEligibleForMonth'])vm.runInContext(fn(n),c);
for(const status of ['resigned','離職','terminated','inactive','leave']){
 assert.equal(c.scheduleEmployeeEligibleForMonth({employmentStatus:status,lastWorkDate:'2026-10-19'},'2026-10'),false);
 assert.equal(c.scheduleEmployeeEligibleForMonth({employmentStatus:status,lastWorkDate:'2026-10-19'},'2026-09'),false);
}
assert.equal(c.scheduleEmployeeEligibleForMonth({employmentStatus:'active',reportingDate:'2026-10-19'},'2026-10'),true);
assert.equal(c.scheduleEmployeeEligibleForMonth({employmentStatus:'active',reportingDate:'2026-11-01'},'2026-10'),false);
console.log('PASS resigned staff excluded from all operational month rosters, active reporting month retained');
