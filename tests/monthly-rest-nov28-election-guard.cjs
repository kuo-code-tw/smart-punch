'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8'),html=fs.readFileSync('work-hours/index.html','utf8');
const date='2026-11-28',other='2026-11-27',month='2026-11';
const window={P79SpecialOvertime:{kindsForDate:()=>[],electionDates:()=>[]},P79OfficialCalendar:{get:()=>null}};
new Function('window',src)(window);
const api=window.P79MonthlyRest;
assert(api.monthlyRestElectionDay(date));assert(!api.monthlyRestElectionDay(other));
const general={planned:true,category:'休',code:'休16-24'};
const report=(id,extra={})=>({...general,id,...extra});
const make=(empId,meta,day=date)=>({empId,schedule:{...Object.fromEntries(Array.from({length:30},(_,i)=>[month+'-'+String(i+1).padStart(2,'0'),'中'])),[day]:'休16-24',__meta:{[day]:{reportOriginalShift:'中',overtimeAssignedShift:'休16-24',...meta}}}});
const rows=[
 make('A',{overtimeReport:report('a',{note:'每月未休假加班預排（正式配休）'})}),
 make('B',{overtimeReport:report('b'),restQuotaOvertime:true,restCategory:'休'}),
 make('C',{overtimeReport:report('c',{code:'選16-24',category:'國',note:'選舉日加班'})}),
 make('D',{overtimeReport:report('d',{note:'每月未休假加班',planned:false})}),
 make('E',{overtimeReport:report('e',{note:'每月未休假加班'})},other),
 make('F',{overtimeReport:report('f',{note:'每月未休假加班',approvedAt:'2026-11-26'})}),
 make('G',{overtimeReport:report('g',{note:'每月未休假加班'}),reportOriginalShift:''}),
 make('H',{overtimeReport:report('h',{note:'每月未休假加班'})}),
 make('I',{overtimeReport:report('i',{note:'每月未休假加班',leaveId:'LEAVE'})})
];
const result=api.abnormalMonthlyRestPlans({schedules:rows,approvedLeaves:[{empId:'H',start:date,end:date}]},rows.map(({empId})=>({empId})),month);
assert.equal(result.repair.map(x=>x.empId).join(','),'A,B');assert.equal(result.review.map(x=>x.empId).sort().join(','),'D,F,G,H,I');
const draft={date,rule:general,note:'每月未休假加班'};
assert(api.electionMonthlyRestWriteIssue(draft));
assert(api.electionMonthlyRestWriteIssue({...draft,note:'',monthlyRestPlanMonth:month}));
assert(api.electionMonthlyRestWriteIssue({...draft,note:''},{restQuotaOvertime:true,restCategory:'休'}));
assert(!api.electionMonthlyRestWriteIssue({...draft,date:other}));
assert(!api.electionMonthlyRestWriteIssue({...draft,rule:{category:'國',code:'選16-24'}}));
assert(api.electionMonthlyRestWriteIssue({...draft,date:other,overtimeDate:date}));
const start=html.indexOf('async function p79SaveWorkOvertimeDraft('),end=html.indexOf(' const token=currentPort79SsoToken()',start);
assert(start>=0&&end>start);
const guard=new Function('window','p79AssertDirectReportActive',html.slice(start,end)+'return "reached network";}\nreturn p79SaveWorkOvertimeDraft;')(window,()=>{});
async function main(){let blocked=false;try{await guard(draft)}catch(e){blocked=String(e.message).includes('選舉日')}assert(blocked);assert.equal(await guard({...draft,date:other}),'reached network');assert(html.includes('electionMonthlyRestWriteIssue?.(draft,existingMeta)'));console.log('PASS confirmed Nov 28 election guard, all groups, legacy quota metadata, write rejection, protected formal/leave/special reports, Nov 27 unchanged');}
main().catch(e=>{console.error(e);process.exitCode=1;});
