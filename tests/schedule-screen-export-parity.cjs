const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
function extract(name){
 const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',start);
 assert(start>=0&&end>start,'missing shared function '+name);
 return html.slice(start,end+6);
}
const month='2026-10',date=n=>month+'-'+String(n).padStart(2,'0');
const people=Array.from({length:83},(_,i)=>({id:'E'+i,name:'員工'+i,role:'ARMG',group:'A組',lockType:'ROTATION'}));
const monthData={},meta={},leave={},workState={};
for(let i=0;i<people.length;i++){
 const id=people[i].id;
 monthData[id]=Object.fromEntries(Array.from({length:31},(_,n)=>[date(n+1),['早','中','晚'][n%3]]));
 monthData[id][date(1)]='休';monthData[id][date(7)]='休';monthData[id][date(8)]='休';
 monthData[id][date(22)]='早';monthData[id][date(23)]=i%3===0?'晚':'休';
 meta[id]={[date(1)]:{restCategory:'例'},[date(7)]:{restCategory:'休'},[date(8)]:{restCategory:'國'}};
 if(i%7===0){meta[id][date(23)]={overtimeReport:{id:'OT'+i,code:'颱08-16',category:'國'}};}
 if(i%7===1){meta[id][date(23)]={restCategory:'例'};}
 if(i%7===2){leave[id+'|'+date(27)]={leaveType:'特休假'};}
 if(i%7===3){leave[id+'|'+date(27)]={leaveType:'婚假'};}
 if(i%7===4){meta[id][date(30)]={overtimeReport:{id:'OT30'+i,code:'國16-24',category:'國'}};}
 if(i%7===5){monthData[id][date(25)]='颱';}
 for(let d=1;d<=31;d++)workState[id+'|'+date(d)]=d===23&&i%7!==0?'rest':d===25&&i%7!==5?'rest':'worked';
}
let exported=[],sheet=null,savedAs='';
const X={
 utils:{
  json_to_sheet:rows=>{
   exported=rows;const ws={};
   for(let i=0;i<rows.length;i++)for(let d=1;d<=31;d++)
    ws[(i+1)+':'+(d+4)]={v:rows[i][String(d)]};
   return ws;
  },
  encode_cell:({r,c})=>r+':'+c,
  book_new:()=>({}),
  book_append_sheet:(wb,ws)=>{sheet=ws;}
 },
 writeFile:(_,name)=>{savedAs=name;}
};
const main={innerHTML:'',firstElementChild:null},picker={value:month};
const window={
 scrollY:0,scrollTo(){},P79OfficialCalendar:{get:()=>null},
 P79SpecialOvertime:{electionDates:()=>[date(25)]},
 P79RestAttendance:{state:(_snapshot,id,day)=>workState[id+'|'+day]||'worked'},
 P79ScheduleTransferRoles:{select:async()=>['ARMG'],filter:people=>people.slice(),role:()=> 'ARMG'}
};
const c={
 window,XLSX:X,Date,Set,Map,Math,String,Object,Array,Number,JSON,
 document:{getElementById:id=>id==='app-main-container'?main:id==='month-picker'?picker:null},
 activeRoleTab:'ARMG',activeGroupFilter:'ALL',employees:people,
 monthlyScheduleData:monthData,monthlyScheduleMeta:meta,leaveCoverAssignments:[],leaveRecords:[],NATIONAL_HOLIDAYS:{},
 p79DisposeRosterScroll(){},scheduleEscapeHtml:v=>String(v??''),p79ScheduleHasOfficialData:()=>true,currentScheduleMonthKey:()=>month,
 p79ScheduleRestClient:()=>({status:()=>({evidence:{complete:true,days:{}}}),refreshIfStale:async()=>{}}),
 p79UpdateTyphoonDayButton(){},getDaysInMonth:()=>31,
 scheduleMonthBounds:()=>[date(1),date(31)],updateScheduleDateRangeSummary(){},
 p79TyphoonDates:()=>[date(23)],scheduleTaipeiTodayKey:()=>date(31),
 scheduleEmployeeEligibleForMonth:()=>true,getGroupPriority:()=>0,getRolePriority:()=>0,compareScheduleEmployeeOrder:()=>0,
 isScheduleRoleRosterCollapsed:()=>false,applyScheduleAccessUi(){},sortedScheduleGroups:()=>['A組'],
 p79ScheduleGroupStyle:()=>'',p79AutomaticRestMetadata:id=>meta[id],
 p79ScheduleRestBalance:()=>({ledger:[]}),p79EmployeeDateEligible:()=>true,
 approvedLeaveForEmployee:(id,d)=>leave[id+'|'+d]||null,
 p79CoverageShift:()=>'',p79LeaveCoverOnDay:()=>[],
 p79SubstituteShiftLabel:(id,d,m)=>m?.overtimeReport?.code||'',
 p79OvertimePeriodLabel:r=>r?.code||'',
 p79ScheduleConfirmedOvertime:(id,d,shift)=>meta[id]?.[d]?.overtimeReport?.code||'',
 p79ScheduleLeaveExportCode:x=>({'特休假':'年','婚假':'婚'}[x]||x),
 scheduleLeaveTypeText:x=>x?.leaveType||'',
 p79ScheduleNoPunchRest:(id,d,shift,m,approved,state)=>!approved&&!meta[id]?.[d]?.overtimeReport&&['早','中','晚'].includes(shift)&&state==='rest',
 p79ScheduleSpecialNoPunchCode:(id,d,shift,approved,state,evidence,markers,today)=>
   !approved&&!meta[id]?.[d]?.overtimeReport&&d<=today&&state==='rest'&&markers?.typhoon?.has(d)?'颱':
   !approved&&d<=today&&state==='rest'&&markers?.election?.has(d)?'選':'',
 p79ScheduleTyphoonHasWork:(id,d,m,state)=>state==='worked'||!!m?.overtimeReport,
 p79LeaveCoverBadge:()=>'',getSubstituteRecommendation:()=>'',p79OvertimePeriodLabel:r=>r?.code||'',
 p79RestQuota:()=>({days:31,counts:{例:4,休:5,國:2}}),
 p79DailyRestCount:()=>({counts:{例:0,休:0,國:0},dates:{例:[],休:[],國:[]}}),
 canManageSchedule:()=>false,scheduleCanEditNow:()=>false,
 p79RefreshRoleTabColors(){},p79ConnectRosterScroll(){}
};
vm.createContext(c);
for(const n of ['p79VisibleRestKind','p79ScheduleDisplayContext','p79ScheduleDisplayDay',
 'p79ScheduleRestCountCells','p79ScheduleExportDay'])vm.runInContext(extract(n),c);
const renderStart=html.indexOf('    function renderRoleScheduleView()');
const renderEnd=html.indexOf('\n    function p79SetScheduleSaving(',renderStart);
assert(renderStart>0&&renderEnd>renderStart);
vm.runInContext(html.slice(renderStart,renderEnd),c);
const excelStart=html.indexOf('    async function exportScheduleToExcel()');
const excelEnd=html.indexOf('\n    // 明確掛到 window',excelStart);
assert(excelStart>0&&excelEnd>excelStart);
vm.runInContext(html.slice(excelStart,excelEnd),c);
c.renderRoleScheduleView();
assert.match(main.innerHTML,/員工0/);
const matched=[...main.innerHTML.matchAll(/<tr data-p79-drag-emp="([^"]+)"[\s\S]*?<\/tr>/g)];
assert.equal(matched.length,83,'renderer must draw every person in the same scope as export');
(async()=>{
 await c.exportScheduleToExcel();
 assert.equal(exported.length,83,'export should include all 83 people, not only visible group');
 assert.equal(savedAs,'2026-10_全部職稱_排班表.xlsx');
 const mismatches=[];
 let compared=0,comments=0;
 for(const tr of matched){
  const id=tr[1],personRow=exported.find(row=>row['工號']===id);
  assert(personRow,'missing exported '+id);
  const dayCells=[...tr[0].matchAll(/<td data-display-shift="([^"]*)"[^>]*data-rest-date="(\d{4}-\d{2}-\d{2})"[\s\S]*?<\/td>/g)];
  assert.equal(dayCells.length,31,'all 31 day cells must be present '+id);
  for(const cell of dayCells){
   const day=cell[2],selected=(cell[0].match(/<option\b[^>]*\bselected\b[^>]*>([^<]*)<\/option>/)||[])[1];
   const exportedValue=personRow[String(Number(day.slice(-2)))];
   if(selected!==exportedValue)mismatches.push({id,day,selected,exportedValue});
   compared++;
  }
 }
 assert.deepEqual(mismatches.slice(0,10),[],'export must equal actual selected UI option for every worker/day');
 assert.equal(compared,83*31);
 assert(exported.some(row=>row['23']==='颱08-16'),'saved typhoon overtime remains visible');
 assert(exported.some(row=>row['27']==='年'),'approved annual leave remains visible');
 assert(exported.some(row=>row['27']==='婚'),'nonstandard leave must be selected as-is rather than defaulting to 早');
 assert(exported.some(row=>row['25']==='選'),'election no-punch selection and export agree');
 for(const cell of Object.values(sheet))if(cell.c?.[0]?.t.includes('颱日'))comments++;
 assert(comments>0,'Excel contains non-destructive typhoon-day notes');
 const before=JSON.stringify({monthData,meta,leave}); 
 await c.exportScheduleToExcel();
 assert.equal(JSON.stringify({monthData,meta,leave}),before,'export must be read-only and repeatable');
 console.log('PASS 83 employees × 31 days ('+compared+' actual selected UI cells match XLSX), typhoon, election, overtime, leave, 颱日 Excel comments and no data mutation');
})().catch(error=>{console.error(error);process.exitCode=1;});
