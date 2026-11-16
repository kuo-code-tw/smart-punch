'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const suggest=fs.readFileSync('assets/port79-leave-cover-suggest.js','utf8');
const root={};const apiCtx={window:root,Date,Intl,Map,Set};
vm.runInNewContext(suggest,apiCtx);vm.runInNewContext(source,apiCtx);
const api=root.P79Overtime,day='2026-11-14';
const data={leaveCoverAssignments:[{leaveId:'L1',leaveEmpId:'LEAVER',mode:'two',workerIds:['FIRST','SECOND'],startDate:day,endDate:day}],
 schedules:[{empId:'LEAVER',schedule:{[day]:'晚'}},{empId:'FIRST',schedule:{[day]:'中'}},{empId:'SECOND',schedule:{'2026-11-15':'早'}}]};
const split=api.resolveLeaveCoverReport(data,{id:'L1'},{date:day,coverDate:day,overtimeDate:day,empId:'FIRST',forEmpId:'LEAVER'});
assert.deepEqual(JSON.parse(JSON.stringify(split.expectedSplitRule)),{
 normalStart:'16',normalEnd:'24',overtimeStart:'24',overtimeEnd:'04',declaredHours:4
},'first night-cover worker must extend 16–24 to 04 next day');
const next=api.resolveLeaveCoverReport(data,{id:'L1'},{date:'2026-11-15',coverDate:day,overtimeDate:day,empId:'SECOND',forEmpId:'LEAVER'});
assert.equal(next.expectedSplitRule.overtimeStart,'04');
assert.equal(next.expectedSplitRule.overtimeEnd,'08');
assert.equal(next.overtimeDate,day,'second split worker still credits original leave date');
const start=source.indexOf('   let submissionBusy=false;'),end=source.indexOf('\n   };',start);
assert(start>=0&&end>start,'production Save handler exists');
const handler=source.slice(start,end)+'\n   };';
async function simulate({code='延16-04',mode='success'}={}){
 const bad=['延','延20-24',4,6.02,'24','08','20','24','before','平日延時加班'];
 const good=['延','延16-04',4,6.02,'16','24','24','04','after','平日延時加班'];
 const chosen=code==='延20-24'?bad:good;
 const nodes=new Map(),node=x=>{if(!nodes.has(x))nodes.set(x,{value:'',textContent:'',disabled:false});return nodes.get(x);};
 const el={isConnected:true,open:true,querySelector:node},drafts=[];let validationCalls=0,postCalls=0,posts=[];
 const credentials={url:'https://fixture.invalid'};
 const ctx={Promise,Error,JSON,Math,Date,Number,String,Boolean,Object,console,
  crypto:{randomUUID:()=> 'SAME-ID'},setTimeout:callback=>{callback();return 0;},clearTimeout:()=>{},
  el,editingOriginal:false,prefill:{leaveHandoffId:'L1',date:day,workDate:day,coverDate:day,overtimeDate:day,empId:'FIRST',forEmpId:'LEAVER',expectedSplitRule:split.expectedSplitRule},
  dateInput:node('#p79OtDate'),empSelect:node('#p79OtEmp'),kind:node('#p79OtKind'),select:node('#p79OtCode'),forSelect:node('#p79OtForEmp'),
  selectedRow:()=>chosen,chosenMatchesLeaveSplit:api.chosenMatchesLeaveSplit,independentShiftOvertimeIssue:api.independentShiftOvertimeIssue,verifyPlannedReviewSelection:()=>{},approvedDates:[day],people:[{empId:'FIRST'},{empId:'LEAVER'}],
  prepareSaveValidation:async()=>{validationCalls++;return{cloud:{revision:'rev1',capabilities:{nightCoverOvertimeAccountingV1:true},schedules:[{empId:'FIRST',schedule:{[day]:'中',__meta:{}}}]},rules:{rows:[chosen],config:{}}}},
  activeReportRows:rows=>rows,typeOptions:()=>[{name:'平日延時加班'}],specialTypes:[],
  ruleType:()=> '平日延時加班',hour:value=>{const h=String(value).split(':');return Number(h[0])*60+Number(h[1]||0);},
  auth:()=>credentials,report:r=>({category:r[0],code:r[1],declaredHours:r[2],convertedHours:r[3],normalStart:r[4],normalEnd:r[5],overtimeStart:r[6],overtimeEnd:r[7],position:r[8],typeName:r[9]}),
  validateLeaveLinkedOvertimeDate:()=>{},ruleAttendanceIssue:()=>null,reportPair:()=>({forEmpId:'LEAVER',forName:'LEAVER'}),
  sessionStorage:{getItem:()=>null,setItem:(k,v)=>drafts.push(JSON.parse(v)),removeItem:()=>{}},KEY:'test',
  awaitOvertimeSaveConfirmation:x=>x,
  verifySavedReport:(d,r)=>assert.equal(d.id,r.id),
  closeConfirmedReportDialog:e=>{e.open=false;e.isConnected=false},
  global:{p79OvertimeContext:{saveReport:async d=>{
   postCalls++;posts.push(d.id);
   if(mode==='lock-then-ok'&&postCalls<3||mode==='lock-forever')throw Error('班表正在編輯，請待儲存完成後再申報');
   if(mode==='unknown')throw Error('加班寫入結果尚未確認');
   return{ok:true,directOvertimeSaved:true,id:d.id,report:{id:d.id,code:d.rule.code,overtimeDate:d.overtimeDate}};
  }},dispatchEvent:()=>{}}
 };
 ctx.dateInput.value=day;ctx.empSelect.value='FIRST';ctx.forSelect.value='LEAVER';ctx.kind.value='平日延時加班';ctx.select.value='0';node('#p79OtNote').value='';
 vm.createContext(ctx);vm.runInContext(handler,ctx);await node('#p79OtStage').onclick();
 return{ctx,el,status:node('#p79OtStatus').textContent,postCalls,validationCalls,posts,drafts};
}
(async()=>{
 let t=await simulate({code:'延20-24'});
 assert.equal(t.postCalls,0);assert.equal(t.validationCalls,1,'a different selected period must undergo fresh official roster checks');
 assert.match(t.status,/正式班表為「中」班/);
 t=await simulate({mode:'lock-then-ok'});
 assert.equal(t.postCalls,3,'only explicit no-write GAS edit lock triggers bounded retry');
 assert.deepEqual(t.posts,['SAME-ID','SAME-ID','SAME-ID'],'all safe retries preserve the idempotent report identity');
 assert.equal(t.el.open,false,'confirmed save closes after lock release');
 t=await simulate({mode:'lock-forever'});
 assert.equal(t.postCalls,3,'bounded lock retry never loops indefinitely');
 assert.equal(t.el.open,true);assert.match(t.status,/排班編輯鎖仍被占用/);
 assert.equal(t.drafts.length,1,'draft survives lock refusal');
 t=await simulate({mode:'unknown'});
 assert.equal(t.postCalls,1,'unknown write results must NEVER be submitted twice');
 assert.equal(t.el.open,true);assert.match(t.status,/結果尚未確認/);
 assert(source.includes('if(prefill.leaveHandoffId){\n     const approvedDate='),'linked handoff skips optional stale 16-second monthly lookup');
 new vm.Script(source);
 console.log('PASS linked leave handoff: correct 24–04 four-hour slot, 04–08 next-day credit, skip redundant leave abort; pre-write edit lock retry only, never unknown writes');
})().catch(e=>{console.error(e);process.exitCode=1});
