const fs=require('fs'),vm=require('vm'),a=require('assert/strict');
const date='2026-10-23',start=Date.parse(date+'T07:32:00+08:00'),end=Date.parse(date+'T11:23:00+08:00');
const employee={empId:'E1',name:'測試',jobTitle:'ARMG'},row={clockIn:{id:'IN',empId:'E1',at:start},clockOut:{id:'OUT',empId:'E1',at:end}};
function setup({failPost=false,missingRule=false,dayCode='早',special=true}={}){
 const calls=[],messages=[],prefills=[],table={scrollTop:321,scrollLeft:50};let renders=0;
 const rules=[['國','颱08-12',4,4,'','','08','12','full','颱風日加班'],...missingRule?[]:[['國','颱08-11',3,3,'','','08','11','full','颱風日加班']]];
 const cloud={ok:true,revision:'REV1',schedules:[{empId:'E1',schedule:{[date]:dayCode,__meta:{}}}],records:[row.clockIn,row.clockOut]};
 const c={Date,Intl,Map,Set,URLSearchParams,AbortController,setTimeout,clearTimeout,JSON,sysConfig:{},document:{getElementById:()=>table},saveConfig(){},getActiveGasUrl:()=> 'https://example.test/exec',getAttendanceEmployeeMasterToken:()=> 'TOKEN',p79CanReportOvertime:()=>true,p79CanManageOvertime:()=>true,getAdminVisibleEmployees:()=>[employee],getAttendanceTimestamp:r=>r.at,buildDailyAttendanceRows:()=>[row],p79AttendanceOvertimeMonths:new Map([['2026-10',{token:'TOKEN',rows:[{empId:'E2',schedule:{}}]}]]),localStorage:{setItem(){}},renderAdminRecordsTable(){renders++;table.scrollTop=0},showToast:m=>messages.push(m),P79SpecialOvertime:{forShift:()=>special?[{kinds:[{code:'颱'}]}]:[]}};
 c.fetch=async(url,options)=>{const body=options?.body?JSON.parse(options.body):null,action=body?.action||new URL(url).searchParams.get('action');calls.push({action,body});if(action==='getOvertimeConfig')return {ok:true,json:async()=>({ok:true,config:{overtimeConversionRowsV1:rules}})};if(action==='getOvertimeReportContext')return {ok:true,json:async()=>cloud};if(action==='saveOvertimeReportDirect')return {ok:!failPost,json:async()=>failPost?{ok:false,error:'雲端拒絕'}:{ok:true,directOvertimeSaved:true,id:body.id,report:{...c.P79Overtime.report(rules.at(-1)),id:body.id}}};throw Error(action)};
 c.window=c;vm.createContext(c);
 for(const p of ['assets/port79-rest-attendance.js','assets/port79-overtime-report.js','assets/port79-attendance-overtime.js'])vm.runInContext(fs.readFileSync(p,'utf8'),c);
 c.P79Overtime.showReportLoading=()=>({close(){},remove(){}});c.P79Overtime.openReport=async prefill=>prefills.push(prefill);
 return {c,calls,messages,prefills,table,renders:()=>renders,rules};
}
(async()=>{
 const x=setup();await x.c.P79AttendanceOvertime.open({row,employee,date});a.equal(x.prefills.length,1);a.equal(x.prefills[0].code,'颱08-11');a.equal(x.prefills[0].preferredType,'颱風日加班');a.equal(x.prefills[0].requirePeriodSelection,false);
 const draft={id:'D1',empId:'E1',date,rule:x.c.P79Overtime.report(x.rules.at(-1))};await x.c.P79AttendanceOvertime.save(draft);a.equal(x.renders(),1);a.equal(x.table.scrollTop,321);a.equal(x.calls.filter(c=>c.body).length,1);a.equal(x.calls.at(-1).body.expectedRevision,'REV1');a.equal(x.calls.at(-1).body.attendanceOutId,'OUT');a.equal(x.c.p79AttendanceOvertimeMonths.get('2026-10').rows.length,2,'other employees remain in the month cache');
 const z=setup();await a.rejects(z.c.P79AttendanceOvertime.save({...draft,rule:z.c.P79Overtime.report(z.rules[0])}),/45/);a.equal(z.calls.filter(c=>c.body).length,0,'four-hour declaration is blocked before sending');
 const failure=setup({failPost:true});await a.rejects(failure.c.P79AttendanceOvertime.save(draft),/雲端拒絕/);a.equal(failure.renders(),0,'failed save must not show updated attendance');
 const missing=setup({missingRule:true});await missing.c.P79AttendanceOvertime.open({row,employee,date});a.equal(missing.prefills[0].code,'');a.equal(missing.prefills[0].requirePeriodSelection,true,'missing three-hour rule cannot silently select four hours');
 for(const category of ['國','休','例']){const plain=setup({dayCode:category,special:false});await plain.c.P79AttendanceOvertime.open({row,employee,date});a.equal(plain.prefills[0].category,category,'official roster leave category must be respected for all staff');}
 const html=fs.readFileSync('attendance/index.html','utf8'),begin=html.indexOf('        function p79OpenAdminAttendanceOvertime(index)'),fn=html.slice(begin,html.indexOf('\n        }',begin)+10);a(!fn.includes('location.'));a(fn.includes('P79AttendanceOvertime.open'));a(!html.includes("target.searchParams.set('attendanceOvertimeReport'"));
 console.log('PASS attendance stays on page, auto-selects typhoon 08-11, validates fresh punches, preserves scrolling/cache, and reports save failures');
})().catch(e=>{console.error(e);process.exitCode=1});
