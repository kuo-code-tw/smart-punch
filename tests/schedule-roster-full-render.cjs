const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const start=html.indexOf('    function renderRoleScheduleView()');
const end=html.indexOf('\n    function p79SetScheduleSaving(',start);
assert(start>=0&&end>start,'real monthly roster renderer must be present');
const source=html.slice(start,end);
assert(!/\btyphoonNoPunch\b|\btyphoonProvisional\b/.test(source),'obsolete tooltip variables must never return');
const day=n=>'2026-10-'+String(n).padStart(2,'0');
const month=Object.fromEntries(Array.from({length:31},(_,i)=>[day(i+1),'早']));
const allocatedDates=[2,13,19,27];
allocatedDates.forEach(n=>month[day(n)]='休');
month[day(23)]='晚';month[day(25)]='早';
const meta=Object.fromEntries(allocatedDates.map(n=>[day(n),{restCategory:'例',restAllocationSource:'auto-v1'}]));
const main={innerHTML:'',firstElementChild:null};
const picker={value:'2026-10'};
const window={
 scrollY:0,scrollTo(){},
 P79OfficialCalendar:{get:()=>null},
 P79SpecialOvertime:{electionDates:()=>['2026-10-25']},
 P79RestAttendance:{state:()=> 'rest'}
};
const c={
 window,Date,Set,Math,String,Object,Array,Number,
 document:{getElementById:id=>id==='app-main-container'?main:id==='month-picker'?picker:null},
 activeRoleTab:'ARMG',activeGroupFilter:'ALL',
 employees:[{id:'E',name:'測試員工',role:'ARMG',group:'A組',lockType:'ROTATION'}],
 monthlyScheduleData:{E:month},
 monthlyScheduleMeta:{E:{}},leaveCoverAssignments:[],leaveRecords:[],NATIONAL_HOLIDAYS:{},
 p79DisposeRosterScroll(){},scheduleEscapeHtml:v=>String(v??''),p79ScheduleHasOfficialData:()=>true,currentScheduleMonthKey:()=> '2026-10',
 p79ScheduleRestClient:()=>({status:()=>({evidence:{complete:true,days:{}}})}),
 p79UpdateTyphoonDayButton(){},getDaysInMonth:()=>31,
 scheduleMonthBounds:()=>['2026-10-01','2026-10-31'],updateScheduleDateRangeSummary(){},
 p79TyphoonDates:()=>['2026-10-23'],scheduleTaipeiTodayKey:()=> '2026-10-31',
 scheduleEmployeeEligibleForMonth:()=>true,getGroupPriority:()=>0,getRolePriority:()=>0,compareScheduleEmployeeOrder:()=>0,
 isScheduleRoleRosterCollapsed:()=>false,applyScheduleAccessUi(){},sortedScheduleGroups:()=>['A組'],
 p79ScheduleGroupStyle:()=>'',p79AutomaticRestMetadata:()=>meta,
 p79ScheduleRestBalance:()=>({ledger:[]}),p79EmployeeDateEligible:()=>true,
 approvedLeaveForEmployee:(_,d)=>d===day(27)?{leaveType:'颱風假'}:null,p79ScheduleNoPunchRest:()=>false,p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=>'',getSubstituteRecommendation:()=>'',p79ScheduleLeaveExportCode:x=>x==='颱風假'?'颱':'',scheduleLeaveTypeText:x=>x.leaveType||'',p79LeaveCoverBadge:()=>'',p79LeaveCoverOnDay:()=>[],
 p79ScheduleSpecialNoPunchCode:(id,date)=>date==='2026-10-23'?'颱':date==='2026-10-25'?'選':'',
 p79ScheduleTyphoonHasWork:()=>false,
 p79RestQuota:()=>({counts:{例:4,休:5,國:2},days:31}),
 p79DailyRestCount:()=>({counts:{例:4,休:0,國:0},dates:{例:['02','13','19','27'],休:[],國:[]}}),
 canManageSchedule:()=>false,p79OvertimePeriodLabel:()=>'',scheduleCanEditNow:()=>false,
 p79RefreshRoleTabColors(){},p79ConnectRosterScroll(){}
};
vm.createContext(c);
function extract(name){
 const a=html.indexOf('    function '+name+'('),b=html.indexOf('\n    }',a);
 assert(a>=0&&b>a,name+' missing');return html.slice(a,b+6);
}
for(const name of ['p79VisibleRestKind','p79ScheduleRestCountCells'])vm.runInContext(extract(name),c);
vm.runInContext(source,c);
c.renderRoleScheduleView();
assert(main.innerHTML.includes('測試員工'),'a populated roster must render, not just its header');
assert(main.innerHTML.includes('data-display-shift="颱"'),'typhoon no-punch cell must render');
assert(main.innerHTML.includes('data-display-shift="選"'),'election no-punch cell must render');
assert(main.innerHTML.includes('颱風停班日：已核對整班無上下班紀錄'),'typhoon tooltip should not raise ReferenceError');
assert(main.innerHTML.includes('選舉日：已核對整班無上下班紀錄'),'election tooltip should not raise ReferenceError');
assert(main.innerHTML.includes('<span>3/1</span>'),'visible 3 例 must show 3/1 even if metadata claims 4');
assert.equal((main.innerHTML.match(/data-rest-visible="例"/g)||[]).length,3);
assert(main.innerHTML.includes('data-rest-date="2026-10-27" data-rest-visible=""'),'approved typhoon leave hides the fourth example');

console.log('PASS 31-day full roster: allocated 4 例, one approved typhoon overlay gives exactly 3 visible 例 and counter 3/1; full special day tooltips');
