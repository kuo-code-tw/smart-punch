'use strict';
// Actual official report dialog: close on verified save, preserve on uncertainty.
// No real GAS writes; pure VM simulation of exact shipped click handler.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const extract=(start,finish)=>{
 const a=source.indexOf(start),b=source.indexOf(finish,a+start.length);
 assert(a>=0&&b>a,'missing report code: '+start);return source.slice(a,b);
};
const helper=extract(' function closeConfirmedReportDialog(el){',' const inputStyle=');
const handler=extract('   let submissionBusy=false;', '\n   };\n  }catch(e)');
assert(source.includes('const validation=await prepareSaveValidation(validationRequest,true)'),
 'new+review flow reuses one current official conversion table before submission');
assert(!handler.includes('await ensureSpecialRule(chosen)'),
 'confirmed submission must not repeat the same rule fetch after the spinner');
function setup({save='success',throwsEvent=false,handoff=false,cleanupThrows=false}={}){
 const date='2026-11-07',empId='E1',id='ORIGINAL-101';
 let busyCalls=0,closed=0,removed=0,cleared=0,events=0,followups=0,saves=0,rulesChecks=0;
 const nodes=new Map(),node=key=>{
  if(!nodes.has(key))nodes.set(key,{value:'',disabled:false,textContent:''});
  return nodes.get(key);
 };
 const el={open:true,isConnected:true,querySelector:node,p79Cleanup(){
  cleared++;if(cleanupThrows)throw Error('cleanup toast failure');
 },close(){closed++;this.open=false},remove(){removed++;this.isConnected=false}};
 const chosen=['延','延24-04',4,6.02,'16','24','24','04','after','平日延時加班'];
 const actual={id,category:'延',code:'延24-04',declaredHours:4,convertedHours:6.02,
  normalStart:'16',normalEnd:'24',overtimeStart:'24',overtimeEnd:'04',
  position:'after',planned:false,overtimeDate:date};
 const ack={ok:true,directOvertimeSaved:true,id,report:actual};
 const saved=[];
 const sessionStorage={setItem(k,v){saved.push(v);},getItem:()=>null,removeItem:()=>{cleared++}};
 const prefill={savedReport:true,reportId:id,plannedReview:true,lockOriginal:true,
  empId,date,forEmpId:'',overtimeDate:date,coverDate:date,
  originalReportCode:'延24-04',originalReportCategory:'延',
  attendance:{start:Date.parse('2026-11-07T15:36:00+08:00'),
   end:Date.parse('2026-11-08T03:58:00+08:00')},
  ...(handoff?{leaveHandoffId:'L1'}:{})};
 const report=r=>({category:r[0],code:r[1],declaredHours:r[2],convertedHours:r[3],
  normalStart:r[4],normalEnd:r[5],overtimeStart:r[6],overtimeEnd:r[7],
  position:r[8],typeName:r[9]});
 const global={
  p79OvertimeContext:{saveReport:async d=>{
   saves++;
   if(save==='reject')throw Error('雲端拒絕寫入');
   return save==='planned'?{...ack,report:{...actual,planned:true}}:
    save==='unverified'?{...ack,directOvertimeSaved:false}:ack;
  }},
  dispatchEvent(){events++;if(throwsEvent)throw Error('after-save list refresh failed')},
  p79OpenLeaveOvertimeHandoff:async()=>{followups++;throw Error('followup navigation interrupted')}
 };
 const ctx={console,el,global,sessionStorage,CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail}},
  Promise,Error,Date,JSON,Math,Number,String,Boolean,Object,crypto:{randomUUID:()=>id},
  setTimeout,clearTimeout,KEY:'port79_overtime_report_draft_v1',
  editingOriginal:true,prefill,chosen,button:node('#p79OtStage'),
  selectedRow:()=>chosen,verifyPlannedReviewSelection:()=>{},
  dateInput:node('#p79OtDate'),empSelect:node('#p79OtEmp'),kind:node('#p79OtKind'),
  select:node('#p79OtCode'),forSelect:node('#p79OtForEmp'),
  approvedDates:[],people:[{empId}],
  prepareSaveValidation:async(req,checkRules)=>{
   rulesChecks++;assert.equal(checkRules,true,'planned review also fetches latest rules');
   return {cloud:{revision:41,capabilities:{nightCoverOvertimeAccountingV1:true},
     schedules:[{empId,schedule:{[date]:'中',__meta:{}}}]},
    rules:{rows:[chosen],config:{}}};
  },
  activeReportRows:rows=>rows,typeOptions:()=>[{name:'平日延時加班'}],
  ruleType:()=> '平日延時加班',report,auth:()=>({url:'https://fixture.invalid'}),
  validateLeaveLinkedOvertimeDate:()=>{},
  ruleAttendanceIssue:()=>null,reportPair:()=>({forEmpId:'',forName:''}),
  verifySavedReport:(draft,result)=>{
   if(result?.report?.id!==draft.id||result.report.code!==draft.rule.code)
    throw Error('雲端資料不符');
  },
  advanceLeaveHandoff:()=>({remaining:true}),
  closeConfirmedReportDialog:null,awaitOvertimeSaveConfirmation:null
 };
 ctx.dateInput.value=date;ctx.empSelect.value=empId;ctx.forSelect.value='';
 ctx.kind.value='平日延時加班';ctx.select.value='0';node('#p79OtNote').value='';
 ctx.el.querySelector('#p79OtDate').value=date;
 ctx.el.querySelector('#p79OtEmp').value=empId;
 vm.createContext(ctx);vm.runInContext(helper,ctx);
 vm.runInContext(handler+'\n   };',ctx);
 return {ctx,el,node,saved,metrics:()=>({busyCalls,closed,removed,cleared,events,followups,saves,rulesChecks})};
}
(async()=>{
 let t=setup({throwsEvent:true,cleanupThrows:true});
 await t.node('#p79OtStage').onclick();
 assert.equal(t.el.open,false,'verified formal report must close its own dialog');
 assert.equal(t.el.isConnected,false,'confirmed modal must be removed from DOM');
 assert.equal(t.metrics().closed,1);assert.equal(t.metrics().removed,1);
 assert.equal(t.metrics().saves,1,'one click only posts once');
 assert.equal(t.metrics().rulesChecks,1,'one parallel cloud rule read');
 assert.equal(t.metrics().events,1,'optional listener still notified after close');
 assert.equal(t.node('#p79OtStage').disabled,true,'completed form cannot be resubmitted');
 t=setup({save:'reject'});await t.node('#p79OtStage').onclick();
 assert.equal(t.el.open,true,'failed official write must never silently close');
 assert.equal(t.metrics().closed,0);assert.equal(t.metrics().removed,0);
 assert.match(t.node('#p79OtStatus').textContent,/雲端拒絕寫入/);
 assert.equal(t.node('#p79OtStage').disabled,false,'failed submission can be reviewed');
 assert(t.saved.length>0,'original draft ID is retained for safe retry');
 t=setup({save:'planned'});await t.node('#p79OtStage').onclick();
 assert.equal(t.el.open,true,'planned=true is not a confirmed formal report');
 assert.match(t.node('#p79OtStatus').textContent,/仍顯示預排/);
 t=setup({save:'unverified'});await t.node('#p79OtStage').onclick();
 assert.equal(t.el.open,true,'missing backend direct-save acknowledgment must not close');
 t=setup({handoff:true});await t.node('#p79OtStage').onclick();
 assert.equal(t.el.open,false,'confirmed linked handoff must close before optional next navigation');
 assert.equal(t.metrics().followups,1,'next handoff can proceed after closing');
 const h=setup();const waited=h.ctx.awaitOvertimeSaveConfirmation(new Promise(()=>{}),4);
 await assert.rejects(waited,/結果尚未確認/,'hanging network cannot leave indefinite spinner');
 console.log('PASS actual overtime dialog: verified original ID closes once, failed/planned/unverified stays open; notifications, handoff and timeout protected');
})().catch(e=>{console.error(e);process.exitCode=1});
