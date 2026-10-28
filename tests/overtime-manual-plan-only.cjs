'use strict';
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8'),monthly=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const block=html.slice(html.indexOf('        const p79MonthlyRestDraftsByMonth='),html.indexOf('        function p79OvertimePlannedVisibleRows('));
const modes={p79PlanModeManual:{checked:true},p79PlanModeAuto:{checked:false}},automatic=[];
const opened=[],ctx={document:{getElementById:id=>modes[id]},P79MonthlyRest:{open:o=>automatic.push(o)},window:null,Map,renderOvertimeStats(){},p79CanReportOvertime:()=>true,p79CloseOvertimePlannedDialog(){},P79Overtime:{openReport:o=>opened.push(o)}};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(block,ctx);
ctx.p79UpdateMonthlyRestPlans('2026-10',[{empId:'E1',planned:true,date:'2026-10-30'}],[{empId:'E1'}]);
a.equal(vm.runInContext('p79MonthlyRestDraftsByMonth.size',ctx),0,'reading quota must not create or preserve automatic proposals');
modes.p79PlanModeAuto.checked=true;ctx.p79ChoosePlanningMode('auto');a.equal(automatic.length,1);a.equal(automatic[0].autoPlan,true);a.equal(modes.p79PlanModeManual.checked,false);
ctx.p79ChoosePlanningMode('manual');a.equal(modes.p79PlanModeManual.checked,true);a.equal(modes.p79PlanModeAuto.checked,false);
ctx.p79OpenManualOvertimePlan();a.equal(opened.length,1);a.equal(opened[0].manualPlan,true,'only the explicit add button starts manual planning');
a(monthly.includes('plan(snapshot,loadedPeople,loadedMonth,rules,{manualOnly:!autoPlan})'));
a(monthly.includes('plan(latest,loadedPeople,loadedMonth,rules,{manualOnly:!autoPlan})'),'post-save refresh cannot repopulate automatic plans');
const save=html.slice(html.indexOf('async function p79SaveWorkOvertimeDraft('),html.indexOf('window.p79OvertimeContext='));
async function attempt({date='2026-10-29',existing=null,ack=true}={}){
 const posts=[],roster={empId:'E1',schedule:{[date]:'早',__meta:existing?{[date]:{overtimeReport:existing}}:{}}};
 const c={Date,Intl,Map,JSON,Number,String,Array,TypeError,AbortController,setTimeout,clearTimeout,currentPort79SsoToken:()=> 'T',p79CanReportOvertime:()=>true,getActiveGasUrl:()=> 'https://fixture.invalid',
 buildDailyAttendanceRows:()=>[{clockIn:{id:'IN',timeStr:date+' 08:00:00'},clockOut:{id:'OUT',timeStr:date+' 16:00:00'}}],
 p79DirectAttendanceTimestamp:r=>Date.parse(r.timeStr.replace(' ','T')+'+08:00'),P79Overtime:{overtimeMinutes:()=>480,ruleAttendanceIssue:()=>''},
 p79WorkOvertimeMonths:new Map(),p79OvertimeCalculationCache:null,renderOvertimeStats(){},localStorage:{setItem(){}},
 fetch:async(url,opts)=>{if(opts.method==='POST'){const body=JSON.parse(opts.body);posts.push(body);return {ok:true,json:async()=>({ok:true,directOvertimeSaved:true,id:body.id,report:{id:body.id,category:body.category,code:body.code,planned:ack}})}}return {ok:true,json:async()=>({ok:true,revision:1,schedules:[roster],records:[{empId:'E1'}]})}}};c.window=c;vm.createContext(c);vm.runInContext(save,c);
 const draft={manualPlan:true,empId:'E1',id:'PLAN',date,rule:{category:'國',code:'國08-16',declaredHours:8,convertedHours:8}};
 let error='';try{await c.p79SaveWorkOvertimeDraft(draft)}catch(e){error=e.message}return {posts,error};
}
(async()=>{
 // Freeze the effective Taipei day through an Intl formatter, independent of test-run date.
 const original=Intl.DateTimeFormat;
 Intl.DateTimeFormat=function(){return {format:()=> '2026-10-29'}};
 try{
  const saved=await attempt();a.equal(saved.error,'');a.equal(saved.posts.length,1);a.equal(saved.posts[0].planned,true,'manual plan remains unconfirmed even if a matching punch pair exists');
  const past=await attempt({date:'2026-10-28'});a.match(past.error,/過去日期/);a.equal(past.posts.length,0);
  const existing=await attempt({existing:{id:'FORMAL',category:'國',code:'國08-16'}});a.match(existing.error,/已有申報或預排/);a.equal(existing.posts.length,0,'manual add cannot overwrite another formal report');
  const bad=await attempt({ack:false});a.match(bad.error,/雲端未確認儲存為預排/);
 }finally{Intl.DateTimeFormat=original;}
 console.log('PASS explicit manual add only, no auto proposals, today plan kept pending, past/overwrite rejection and cloud planned ACK');
})().catch(e=>{console.error(e);process.exitCode=1});
