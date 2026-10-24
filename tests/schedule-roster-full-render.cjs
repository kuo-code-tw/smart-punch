const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const start=html.indexOf('    function renderRoleScheduleView()');
const end=html.indexOf('\n    function p79SetScheduleSaving(',start);
assert(start>=0&&end>start,'real monthly roster renderer must be present');
const source=html.slice(start,end);
assert(!/\btyphoonNoPunch\b|\btyphoonProvisional\b/.test(source),'obsolete tooltip variables must never return');
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
 monthlyScheduleData:{E:{'2026-10-23':'晚','2026-10-25':'早'}},
 monthlyScheduleMeta:{E:{}},leaveCoverAssignments:[],leaveRecords:[],NATIONAL_HOLIDAYS:{},
 p79DisposeRosterScroll(){},p79ScheduleHasOfficialData:()=>true,currentScheduleMonthKey:()=> '2026-10',
 p79ScheduleRestClient:()=>({status:()=>({evidence:{complete:true,days:{}}})}),
 p79UpdateTyphoonDayButton(){},getDaysInMonth:()=>31,
 scheduleMonthBounds:()=>['2026-10-01','2026-10-31'],updateScheduleDateRangeSummary(){},
 p79TyphoonDates:()=>['2026-10-23'],scheduleTaipeiTodayKey:()=> '2026-10-31',
 scheduleEmployeeEligibleForMonth:()=>true,getGroupPriority:()=>0,getRolePriority:()=>0,compareScheduleEmployeeOrder:()=>0,
 isScheduleRoleRosterCollapsed:()=>false,applyScheduleAccessUi(){},sortedScheduleGroups:()=>['A組'],
 p79ScheduleGroupStyle:()=>'',p79AutomaticRestMetadata:()=>({}),
 p79ScheduleRestBalance:()=>({ledger:[]}),p79EmployeeDateEligible:()=>true,
 approvedLeaveForEmployee:()=>null,p79ScheduleNoPunchRest:()=>false,p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=>'',getSubstituteRecommendation:()=>'',p79ScheduleLeaveExportCode:()=>'',scheduleLeaveTypeText:()=>'',p79LeaveCoverBadge:()=>'',p79LeaveCoverOnDay:()=>[],
 p79ScheduleSpecialNoPunchCode:(id,date)=>date==='2026-10-23'?'颱':date==='2026-10-25'?'選':'',
 canManageSchedule:()=>false,p79OvertimePeriodLabel:()=>'',scheduleCanEditNow:()=>false,p79ScheduleRestCountCells:()=>'<td>0</td><td>0</td><td>0</td>',
 p79RefreshRoleTabColors(){},p79ConnectRosterScroll(){}
};
vm.createContext(c);
vm.runInContext(source,c);
c.renderRoleScheduleView();
assert(main.innerHTML.includes('測試員工'),'a populated roster must render, not just its header');
assert(main.innerHTML.includes('data-display-shift="颱"'),'typhoon no-punch cell must render');
assert(main.innerHTML.includes('data-display-shift="選"'),'election no-punch cell must render');
assert(main.innerHTML.includes('颱風停班日：已核對整班無上下班紀錄'),'typhoon tooltip should not raise ReferenceError');
assert(main.innerHTML.includes('選舉日：已核對整班無上下班紀錄'),'election tooltip should not raise ReferenceError');
console.log('PASS full 31-day roster renders real employee cells, typhoon/election labels and tooltips with no missing variables');
