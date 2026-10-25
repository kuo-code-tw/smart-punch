const fs=require('fs'),vm=require('vm'),a=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
function extract(name){
 const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',start);
 a(start>=0&&end>start,'missing '+name);return html.slice(start,end+6);
}
const month='2026-10',typhoonDate=month+'-23',people=Array.from({length:83},(_,i)=>({id:'E'+i,name:'測試'+i}));
const shifts={},meta={};
people.forEach((e,i)=>{shifts[e.id]={[typhoonDate]:i<41?'休':'早'};meta[e.id]={};});
const saved=JSON.stringify({shifts,meta}),calendar=[typhoonDate];
const c={window:null,Array,Date,Set,Map,String,Number,Math,JSON,Object,
 monthlyScheduleData:shifts,monthlyScheduleMeta:meta,
 p79RestQuota:()=>({days:31,counts:{例:4,休:5,國:2}}),
 p79TyphoonDates:()=>calendar.slice(),
 p79EmploymentStartDate:()=>'',scheduleTaipeiTodayKey:()=>month+'-25',
 p79EmployeeDateEligible:(e,date)=>e.id!=='E80',
 approvedLeaveForEmployee:(id,date)=>id==='E81'&&date===typhoonDate?'年假':null,
 p79ScheduleLeaveExportCode:text=>text==='颱風假'?'颱':'年',scheduleLeaveTypeText:x=>x,
 p79ScheduleSpecialNoPunchCode:()=>'',p79ScheduleRestClient:()=>({status:()=>({evidence:{complete:true,days:{}}})}),
 p79DailyRestCount:()=>({counts:{例:0,休:0,國:0},dates:{例:[],休:[],國:[]}}),
 scheduleEscapeHtml:x=>String(x||'')};
c.window=c;c.P79RestAttendance={state:(_snap,id,date)=>{
 if(date!==typhoonDate)return 'rest';
 if(id==='E82')return 'missing';
 if(id==='E81')return 'rest';
 return Number(id.slice(1))<41?'rest':'worked';
}};
vm.createContext(c);
for(const name of ['p79ScheduleTyphoonHasWork','p79ScheduleTyphoonDays','p79ScheduleRestCountCells'])
 vm.runInContext(extract(name),c);
let counted=0,restCounted=0,workCounted=0,skipped=[];
for(const e of people){
 const work=[],off=c.p79ScheduleTyphoonDays(e,month,work);
 const total=new Set([...off,...work]).size;
 a(total<=1,'an employee/day cannot be counted twice');
 if(total){counted++;if(Number(e.id.slice(1))<41)restCounted++;else workCounted++;}
 else skipped.push(e.id);
 const summary=c.p79ScheduleRestCountCells(e,month,{},off,work);
 a(summary.includes('data-rest-category="颱"'));
 a(summary.includes('<span>'+total+' 天</span>'));
}
a.equal(counted,80,'all active people on marked day, including original 休, are counted');
a.equal(restCounted,41,'41 originally scheduled rests count as typhoon calendar days');
a.equal(workCounted,39,'39 working shifts count as typhoon calendar days');
a.deepEqual(skipped,['E80','E81','E82'],'future hire, other approved leave, unverified single-punch excluded');
a.equal(JSON.stringify({shifts,meta}),saved,'read-only counters must preserve original shift and overtime metadata');
console.log('PASS 83 employees, typhoon day counts 41 original rests + 39 working staff, excludes three ineligible/other leave/unknown; preserves all roster data');
