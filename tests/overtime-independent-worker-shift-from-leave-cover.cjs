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
// The person selects 延16-20 and presses the SAME save button.
assert(!source.includes('p79OtOwnShiftReport'),'no separate action is needed to submit the chosen period');
assert(!source.includes('href="../schedule/"'),'no roster-adjustment detour in the overtime form');
assert(api.chosenMatchesLeaveSplit(valid,linked.expectedSplitRule)===false);
const linkedPeriod=['延','延16-04',4,6.02,'16','24','24','04','after','平日延時加班'];
assert(api.chosenMatchesLeaveSplit(linkedPeriod,linked.expectedSplitRule)===true);
const begin=source.indexOf('   let submissionBusy=false;'),finish=source.indexOf('\n   };',begin);
assert(begin>=0&&finish>begin);
const handler=source.slice(begin,finish)+'\n   };';
const nextStart=source.indexOf(' function advanceLeaveHandoff(draft,sourcePrefill={})');
const nextEnd=source.indexOf(' // Match the currently selected overtime TYPE',nextStart);
assert(nextStart>=0&&nextEnd>nextStart,'production queue handoff helper exists');
const nextHelper=source.slice(nextStart,nextEnd);
async function submit({officialShift='早',selected=valid}={}){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false});return nodes.get(id);};
 const el={isConnected:true,open:true,querySelector:node};
 let writes=0,validated=0,resultDraft=null;
 const queueKey='port79_leave_overtime_handoff_v1';
 const storage=new Map([[queueKey,JSON.stringify({id:'L-14',createdAt:Date.now(),pendingReports:true,
  entries:[{leaveId:'L-14',date,empId:'WORKER',forEmpId:'LEAVER',code:'延16-04'},
           {leaveId:'L-14',date:'2026-11-15',empId:'SECOND',forEmpId:'LEAVER',code:'延04-16'}]})]]);
 const jumps=[];
 const ctx={Error,Promise,Date,Math,Number,String,Boolean,Object,JSON,
  console:{warn(){}},crypto:{randomUUID:()=> 'UNIQUE-INDEPENDENT'},
  el,editingOriginal:false,prefill:{date,empId:'WORKER',workDate:date,coverDate:date,overtimeDate:date,forEmpId:'LEAVER',leaveHandoffId:'L-14',workdayShiftMismatch:true,expectedSplitRule:linked.expectedSplitRule},
  dateInput:node('#p79OtDate'),empSelect:node('#p79OtEmp'),kind:node('#p79OtKind'),select:node('#p79OtCode'),forSelect:node('#p79OtForEmp'),
  selectedRow:()=>selected,verifyPlannedReviewSelection:()=>{},
  prepareSaveValidation:async request=>{validated++;assert.equal(request.leaveHandoffId,'');assert.equal(request.overtimeDate,date);
   return{cloud:{revision:'rev',schedules:[{empId:'WORKER',schedule:{[date]:officialShift,__meta:{}}}]},
    rules:{rows:[selected],config:{}}};},
  independentShiftOvertimeIssue:api.independentShiftOvertimeIssue,chosenMatchesLeaveSplit:api.chosenMatchesLeaveSplit,
  ruleType:()=> '平日延時加班',activeReportRows:rows=>rows,
  typeOptions:()=>[{name:'平日延時加班'}],specialTypes:[],
  report:row=>({category:row[0],code:row[1],declaredHours:row[2],convertedHours:row[3],
   normalStart:row[4],normalEnd:row[5],overtimeStart:row[6],overtimeEnd:row[7],position:row[8],typeName:row[9]}),
  validateLeaveLinkedOvertimeDate:()=>{},ruleAttendanceIssue:()=>null,
  reportPair:(cat,emp,forEmp)=>{throw Error('Independently filed period must not call reportPair');},
  people:[{empId:'WORKER'}],approvedDates:[],
  auth:()=>({url:'test'}),sessionStorage:{
    getItem:key=>storage.get(key)||null,
    setItem:(key,value)=>{storage.set(key,value);if(key==='independent-overtime')resultDraft=JSON.parse(value);},
    removeItem:key=>storage.delete(key)
   },KEY:'independent-overtime',
  awaitOvertimeSaveConfirmation:task=>task,verifySavedReport:(draft,resp)=>assert.equal(draft.id,resp.id),
  closeConfirmedReportDialog:node=>{node.isConnected=false;node.open=false},
  global:{p79OvertimeContext:{saveReport:async draft=>{writes++;assert.equal(draft.leaveHandoffId,'');assert.equal(draft.forEmpId,'');assert.equal(draft.overtimeDate,date);
   return{ok:true,directOvertimeSaved:true,id:draft.id,report:{id:draft.id,overtimeDate:date}};}},dispatchEvent:()=>{},
    p79OpenLeaveOvertimeHandoff:async autoContinue=>{
      assert.equal(el.open,false,'first confirmed filing closes before the second form opens');
      assert.equal(autoContinue,true,'next person opens in automatic continuation mode');
      jumps.push(autoContinue);
      const entries=JSON.parse(storage.get(queueKey)).entries;
      assert.equal(entries[0].empId,'SECOND','next open targets the second assigned worker');
      assert.equal(entries[1].empId,'WORKER','first original approved cover remains queued for later review');
      assert.equal(entries[1].deferredAfterOwnOvertime,true,'independent extension is not false completion');
    }}
 };
 node('#p79OtDate').value=date;node('#p79OtEmp').value='WORKER';node('#p79OtForEmp').value='LEAVER';
 node('#p79OtNote').value='依本人正式班別延時加班';node('#p79OtKind').value='平日延時加班';node('#p79OtCode').value='0';
 vm.createContext(ctx);vm.runInContext(nextHelper+'\n'+handler,ctx);
 await node('#p79OtStage').onclick();
 return {writes,validated,resultDraft,status:node('#p79OtStatus').textContent,el,jumps,
   handoff:JSON.parse(storage.get(queueKey)||'null')};
}
(async()=>{
 let result=await submit();
 assert.equal(result.writes,1,'valid 08–16 + 16–20 can be saved once independently');
 assert.equal(result.validated,1,'fresh official roster preflight required');
 assert.equal(result.resultDraft?.rule.code,'延16-20');
 assert.equal(result.resultDraft?.leaveHandoffId,'');
 assert.equal(result.resultDraft?.forEmpId,'');
 assert.equal(result.el.open,false);
 assert.deepEqual(result.jumps,[true],'confirmed first employee filing must launch second automatically');
 assert.equal(result.handoff.entries.length,2,'independent filing keeps original approved cover pending');
 assert.equal(result.handoff.entries[0].empId,'SECOND');
 result=await submit({officialShift:'中'});
 assert.equal(result.jumps.length,0,'failed save must never advance to the second worker');
 assert.equal(result.writes,0,'mismatched current roster cannot POST');
 assert.equal(result.validated,1);
 assert.match(result.status,/正式班表為「中」班/);
 result=await submit({selected:other});
 assert.equal(result.writes,0,'24–04 is not an extension from an early shift');
 assert.match(result.status,/08-16/);
 assert(source.includes('const pair=independentFiling?{forEmpId:'),'automatic branch clears original leave person even though shown in the modal');
 assert(source.includes("leaveHandoffId:independentFiling?'':"),'no leave handoff in preflight for unrelated chosen period');
 assert(source.includes("leaveHandoffId:validationRequest.leaveHandoffId"),'draft cannot reattach prior leave');
 assert(source.includes('chosenMatchesLeaveSplit(chosen,expected)'),'system automatically separates original cover from chosen actual period');
 assert(leave.includes('if(previous?.id&&String(previous.id)!==String(draft.id))'),'host refuses overwriting another same-day report');
 assert(leave.includes('P79Overtime.ruleAttendanceIssue'),'host validates actual punches and selected time');
 new vm.Script(source);
 console.log('PASS independently file 08–16/16–20 overtime without false night-cover attribution; live roster and punch guards maintained');
})().catch(error=>{console.error(error);process.exitCode=1;});
