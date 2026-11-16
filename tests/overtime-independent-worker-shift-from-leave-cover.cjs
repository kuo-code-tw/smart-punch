'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const suggest=fs.readFileSync('assets/port79-leave-cover-suggest.js','utf8');
const leave=fs.readFileSync('leave/index.html','utf8'),root={};
vm.runInNewContext(suggest,{window:root,Map,Set,Date,Intl});
vm.runInNewContext(source,{window:root,Map,Set,Date,Intl});
const api=root.P79Overtime,date='2026-11-14';
const valid=['延','延16-20',4,6.02,'08','16','16','20','after','平日延時加班'];
const other=['延','延24-04',4,6.02,'16','24','24','04','after','平日延時加班'];
assert.equal(api.independentShiftOvertimeIssue('早',valid),'','07:45–20:00 employee has early 08–16 + 16–20 extension');
assert.match(api.independentShiftOvertimeIssue('中',valid),/16-24/,'never change mid shift into early');
assert.match(api.independentShiftOvertimeIssue('晚',valid),/24-08/);
assert.match(api.independentShiftOvertimeIssue('休',valid),/無法依本人班別/);
assert.match(api.independentShiftOvertimeIssue('',valid),/未排班/);
assert.match(api.independentShiftOvertimeIssue('早',other),/08-16/);
assert.match(api.independentShiftOvertimeIssue('早',['休','休08-16',8,12.7,'','','08','16','full','休息日加班']),/只能選/);
const plan={
 leaveCoverAssignments:[{leaveId:'L-14',leaveEmpId:'LEAVER',startDate:date,endDate:date,mode:'two',workerIds:['WORKER','SECOND']}],
 schedules:[{empId:'LEAVER',schedule:{[date]:'晚'}},{empId:'WORKER',schedule:{[date]:'早'}},{empId:'SECOND',schedule:{'2026-11-15':'早'}}]};
const linked=api.resolveLeaveCoverReport(plan,{id:'L-14'},{
 date,coverDate:date,overtimeDate:date,empId:'WORKER',forEmpId:'LEAVER'
});
assert.equal(linked.workdayShiftMismatch,true,'linked cover still rejects 08–16 as replacement for 16–24/24–04');
assert.equal(linked.actualNormalShift,'早','UI shows actual cloud roster shift');
assert.equal(linked.expectedNormalShift,'中');
assert.equal(linked.expectedSplitRule.overtimeStart,'24');
assert.equal(linked.expectedSplitRule.overtimeEnd,'04');
const button=source.match(/el\.querySelector\('#p79OtOwnShiftReport'\)\.onclick=\(\)=>\{([\s\S]*?)\n    \};/);
assert(button,'linked leave dialog offers an independent own-shift filing action');
const openCalls=[],prefill={date,workDate:date,empId:'WORKER',forEmpId:'LEAVER',coverDate:date,overtimeDate:date,leaveHandoffId:'L-14'};
vm.runInNewContext('(function(){'+button[1]+'})()',{
 prefill,selectedRow:()=>valid,openReport:input=>openCalls.push(input),String
});
assert.equal(openCalls.length,1,'button only opens one new form and never writes');
assert.equal(openCalls[0].independentOvertime,true);
assert.equal(openCalls[0].date,date);
assert.equal(openCalls[0].empId,'WORKER');
assert.equal(openCalls[0].code,'延16-20');
assert(!openCalls[0].leaveHandoffId&&!openCalls[0].forEmpId,'source leave link not used for actual-shift overtime');
assert.match(openCalls[0].note,/原請假代班預排另行核對/);
const begin=source.indexOf('   let submissionBusy=false;'),finish=source.indexOf('\n   };',begin);
assert(begin>=0&&finish>begin);
const handler=source.slice(begin,finish)+'\n   };';
async function submit({officialShift='早',selected=valid}={}){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false});return nodes.get(id);};
 const el={isConnected:true,open:true,querySelector:node};
 let writes=0,validated=0,resultDraft=null;
 const ctx={Error,Promise,Date,Math,Number,String,Boolean,Object,JSON,
  console:{warn(){}},crypto:{randomUUID:()=> 'UNIQUE-INDEPENDENT'},
  el,editingOriginal:false,prefill:{date,empId:'WORKER',independentOvertime:true},
  dateInput:node('#p79OtDate'),empSelect:node('#p79OtEmp'),kind:node('#p79OtKind'),select:node('#p79OtCode'),forSelect:node('#p79OtForEmp'),
  selectedRow:()=>selected,verifyPlannedReviewSelection:()=>{},
  prepareSaveValidation:async request=>{validated++;assert.equal(request.leaveHandoffId,'');assert.equal(request.overtimeDate,date);
   return{cloud:{revision:'rev',schedules:[{empId:'WORKER',schedule:{[date]:officialShift,__meta:{}}}]},
    rules:{rows:[selected],config:{}}};},
  independentShiftOvertimeIssue:api.independentShiftOvertimeIssue,
  ruleType:()=> '平日延時加班',activeReportRows:rows=>rows,
  typeOptions:()=>[{name:'平日延時加班'}],specialTypes:[],
  report:row=>({category:row[0],code:row[1],declaredHours:row[2],convertedHours:row[3],
   normalStart:row[4],normalEnd:row[5],overtimeStart:row[6],overtimeEnd:row[7],position:row[8],typeName:row[9]}),
  validateLeaveLinkedOvertimeDate:()=>{},ruleAttendanceIssue:()=>null,
  reportPair:(cat,emp,forEmp)=>{assert.equal(forEmp,'');return{forEmpId:'',forName:''};},
  people:[{empId:'WORKER'}],approvedDates:[],
  auth:()=>({url:'test'}),sessionStorage:{getItem:()=>null,setItem:(key,value)=>{resultDraft=JSON.parse(value)},removeItem:()=>{}},KEY:'independent-overtime',
  awaitOvertimeSaveConfirmation:task=>task,verifySavedReport:(draft,resp)=>assert.equal(draft.id,resp.id),
  closeConfirmedReportDialog:node=>{node.isConnected=false;node.open=false},
  global:{p79OvertimeContext:{saveReport:async draft=>{writes++;assert.equal(draft.leaveHandoffId,'');assert.equal(draft.forEmpId,'');assert.equal(draft.overtimeDate,date);
   return{ok:true,directOvertimeSaved:true,id:draft.id,report:{id:draft.id,overtimeDate:date}};}},dispatchEvent:()=>{}}
 };
 node('#p79OtDate').value=date;node('#p79OtEmp').value='WORKER';node('#p79OtForEmp').value='';
 node('#p79OtNote').value='依本人正式班別延時加班';node('#p79OtKind').value='平日延時加班';node('#p79OtCode').value='0';
 vm.createContext(ctx);vm.runInContext(handler,ctx);
 await node('#p79OtStage').onclick();
 return {writes,validated,resultDraft,status:node('#p79OtStatus').textContent,el};
}
(async()=>{
 let result=await submit();
 assert.equal(result.writes,1,'valid 08–16 + 16–20 can be saved once independently');
 assert.equal(result.validated,1,'fresh official roster preflight required');
 assert.equal(result.resultDraft?.rule.code,'延16-20');
 assert.equal(result.el.open,false);
 result=await submit({officialShift:'中'});
 assert.equal(result.writes,0,'mismatched current roster cannot POST');
 assert.equal(result.validated,1);
 assert.match(result.status,/正式班表為「中」班/);
 result=await submit({selected:other});
 assert.equal(result.writes,0,'24–04 is not an extension from an early shift');
 assert.match(result.status,/08-16/);
 assert(source.includes("forSelect.value='';forSelect.disabled=true;"),'independent mode clears leave person');
 assert(source.includes("leaveHandoffId:prefill.independentOvertime?'':"),'no leave handoff in preflight');
 assert(source.includes("leaveHandoffId:validationRequest.leaveHandoffId"),'draft cannot reattach prior leave');
 assert(source.includes('調整正式班表')&&source.includes('href="../schedule/"'),'roster editing is separately explicit');
 assert(leave.includes('if(previous?.id&&String(previous.id)!==String(draft.id))'),'host refuses overwriting another same-day report');
 assert(leave.includes('P79Overtime.ruleAttendanceIssue'),'host validates actual punches and selected time');
 new vm.Script(source);
 console.log('PASS independently file 08–16/16–20 overtime without false night-cover attribution; live roster and punch guards maintained');
})().catch(error=>{console.error(error);process.exitCode=1;});
