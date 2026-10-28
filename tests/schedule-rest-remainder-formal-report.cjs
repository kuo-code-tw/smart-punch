'use strict';
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');
const c={window:null,Date,Intl,console};c.window=c;vm.createContext(c);
for(const name of ['rest-allocation','rest-attendance','overtime-reason','monthly-rest-overtime','schedule-rest-summary'])vm.runInContext(fs.readFileSync('assets/port79-'+name+'.js','utf8'),c);
const html=fs.readFileSync('schedule/index.html','utf8'),start=html.indexOf('    function p79ScheduleRestCountCells('),end=html.indexOf('    function p79RefreshScheduleRestCounts(',start);
c.scheduleEscapeHtml=x=>String(x||'');vm.runInContext(html.slice(start,end),c);
const month='2026-10',dates=Array.from({length:31},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
for(let i=0;i<83;i++)for(const nationalOff of [0,1]){
 const emp={id:'E'+i,name:'測試'+i,jobTitle:['F/L','AQC','ARMG','領班','指揮手'][i%5]};
 const roster=Object.fromEntries(dates.map(d=>[d,'早']));
 dates.slice(0,4).forEach(d=>roster[d]='例');dates.slice(4,9).forEach(d=>roster[d]='休');
 if(nationalOff)roster[dates[9]]='國';
 const meta={};for(let n=0;n<2-nationalOff;n++)meta[dates[11+n]]={overtimeReport:{id:emp.id+'-R'+n,category:'國',code:'國08-16'}};
 const snapshot={attendanceEvidence:{complete:true,days:Object.fromEntries(dates.map(d=>[emp.id+'|'+d,{state:['例','休','國'].includes(roster[d])?'rest':'worked'}]))}};
 const selected={例:dates.slice(0,4),休:dates.slice(4,9),國:nationalOff?[dates[9]]:[]};
 c.p79DailyRestCount=()=>({counts:{例:4,休:5,國:nationalOff},dates:{例:['01','02','03','04'],休:['05','06','07','08','09'],國:nationalOff?['10']:[]}});
 c.p79ScheduleRestBalance=()=>c.P79ScheduleRestSummary.summary(emp,roster,meta,month,snapshot,'');
 c.P79ScheduleRestSummary.clear();c.P79ScheduleRestSummary.acceptRows([{empId:emp.id,schedule:{...roster,__meta:meta}}],month);
 const before=JSON.stringify({roster,meta,snapshot});
 const rendered=c.p79ScheduleRestCountCells(emp,month,meta,[],[],selected);
 const national=rendered.match(/<td data-rest-category="國"[\s\S]*?<\/td>/)[0];
 a.match(national,new RegExp('<span>'+nationalOff+'/0</span>'),'formal reports consume the rest quota once');
 a.match(national,new RegExp('正式已報 '+(2-nationalOff)+' 天'));
 a.equal(JSON.stringify({roster,meta,snapshot}),before,'counter does not edit attendance, roster or reports');
 c.P79ScheduleRestSummary.clear();
 const unknown=c.p79ScheduleRestCountCells(emp,month,meta,[],[],selected);
 a.match(unknown,/雲端申報額度待核/,'no cloud confirmation must not claim a verified zero');
 // A confirmed revocation releases the quota again without changing visible days.
 for(const m of Object.values(meta)){m.overtimeExcluded=true;m.overtimeRevocations=[{confirmed:true,reportId:m.overtimeReport.id}];}
 c.P79ScheduleRestSummary.acceptRows([{empId:emp.id,schedule:{...roster,__meta:meta}}],month);
 const revoked=c.p79ScheduleRestCountCells(emp,month,meta,[],[],selected).match(/<td data-rest-category="國"[\s\S]*?<\/td>/)[0];
 a.match(revoked,new RegExp('<span>'+nationalOff+'/'+(2-nationalOff)+'</span>'),'revoked reports no longer occupy remaining quota');
}
console.log('PASS 83 people x 2 report/rest distributions: visible numerator retained, cloud-confirmed remainder, revocations and unknown evidence; no writes');
