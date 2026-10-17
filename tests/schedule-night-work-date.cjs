const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('schedule/index.html','utf8');
function fn(src,name,indent='    '){let start=src.indexOf('function '+name+'(');if(src.slice(start-6,start)==='async ')start-=6;return src.slice(start,src.indexOf('\n'+indent+'}',start)+indent.length+2)}
const c={Date,Intl};vm.createContext(c);vm.runInContext(fn(html,'scheduleNightRosterDate'),c);
for(const [time,expected] of [['2026-10-17T23:35:00+08:00','2026-10-17'],['2026-10-18T00:00:00+08:00','2026-10-17'],['2026-10-18T07:59:59+08:00','2026-10-17'],['2026-10-18T08:00:00+08:00','2026-10-18'],['2026-11-01T00:10:00+08:00','2026-10-31'],['2027-01-01T07:00:00+08:00','2026-12-31']])assert.equal(c.scheduleNightRosterDate(new Date(time)),expected,time);
const elements=Object.fromEntries(['todayScheduleDate','todayScheduleSummary','todayScheduleCounts','todayScheduleDetail','todayScheduleLeaveSummary'].map(id=>[id,{textContent:'',innerHTML:'',classList:{add(){},toggle(){}}}]));
Object.assign(c,{p79EmployeeDateEligible:()=>true,applyScheduleAttendanceMonthScope:()=>true,document:{getElementById:id=>elements[id]},scheduleTaipeiTodayKey:()=> '2026-10-18',scheduleNightRosterDate:()=> '2026-10-17',currentScheduleMonthKey:()=> '2026-10',monthlyScheduleData:{N:{'2026-10-17':'晚','2026-10-18':'休'},T:{'2026-10-17':'休','2026-10-18':'晚'},D:{'2026-10-18':'早'}},monthlyScheduleMeta:{},employees:[{id:'N',name:'昨天晚班',role:'AQC'},{id:'T',name:'今晚人員',role:'AQC'},{id:'D',name:'今天早班',role:'AQC'}],approvedLeaveForEmployee:()=>null,scheduleLeaveTypeText:()=>'',scheduleLeavePillClass:()=>'',scheduleEscapeHtml:s=>s,todayScheduleExpanded:true,scheduleDutyBadge:(shift,id,flag,date)=>`[badge:${id}:${date}]`});
vm.runInContext(fn(html,'scheduleNightRosterSource')+'\n'+fn(html,'scheduleRosterLeaveLabel')+'\n'+fn(html,'renderTodaySchedulePanel'),c);c.renderTodaySchedulePanel();
const detail=elements.todayScheduleDetail.innerHTML,night=detail.slice(detail.indexOf('晚班 ·'),detail.indexOf('休假</span>'));
assert(night.includes('2026/10/17（前一日跨日）'));assert(night.includes('昨天晚班'));assert(!night.includes('今晚人員'));assert(night.includes('[badge:N:2026-10-17]'));assert(detail.includes('今天早班'));
Object.assign(c,{isScheduleEmployeeClockedIn:()=>true,scheduleTaipeiDutyShift:()=> '晚'});vm.runInContext(fn(html,'scheduleDutyBadge'),c);assert(c.scheduleDutyBadge('早','D',true,'2026-10-18').includes('當班'));assert.equal(c.scheduleDutyBadge('早','D',true,'2026-10-17'),'');assert(c.scheduleDutyBadge('晚','N',true,'2026-10-17').includes('當班'));assert.equal(c.scheduleDutyBadge('晚','T',true,'2026-10-18'),'');
for(const file of ['attendance/index.html','work-hours/index.html']){
 const s=fs.readFileSync(file,'utf8');const ctx={Date,getAttendanceDateKey:v=>String(v||'').split(' ')[0].replaceAll('-','/'),getAttendanceTimestamp:r=>Date.parse(r.timeStr.replaceAll('/','-').replace(' ','T')),getScheduleShiftLabelForPunch:(emp)=>emp?.shift||'',inferShiftFromCompletedSession:()=> '晚班'};vm.createContext(ctx);vm.runInContext(fn(s,'p79AttendanceSessionWorkDate','        '),ctx);
 assert.equal(ctx.p79AttendanceSessionWorkDate({timeStr:'2026/10/17 23:35'},null,{}),'2026/10/17');
 assert.equal(ctx.p79AttendanceSessionWorkDate({timeStr:'2026/10/18 00:10'},null,{}),'2026/10/17');
 assert.equal(ctx.p79AttendanceSessionWorkDate({timeStr:'2026/11/01 00:10'},null,{}),'2026/10/31');
 assert.equal(ctx.p79AttendanceSessionWorkDate({timeStr:'2026/10/18 07:35'},null,{shift:'早班'}),'2026/10/18');
 assert.equal(ctx.p79AttendanceSessionWorkDate({timeStr:'2026/10/18 06:00'},null,{shift:'晚班'}),'2026/10/17');
 assert.equal(ctx.p79AttendanceSessionWorkDate(null,{timeStr:'2026/10/18 08:00'},{}),'2026/10/18');
 for(const m of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
}
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
console.log('PASS Taipei midnight / 08:00, month/year boundaries, previous-night roster, date-scoped badges, accounting day and morning exceptions');
