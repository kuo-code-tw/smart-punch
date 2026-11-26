'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const patch=require('../scripts/apply-gas-deleted-leave-orphan-plan.cjs');
const file=process.argv[2];
// CI exercises the exact helpers and all three host guards using synthetic data.
// A private GAS export is additionally required before deployment.
if(!file){
 const ctx={p79OtAutoApproved_:r=>['approvedAt','approvedBy','reviewedAt','reviewedBy','approvalStatus'].some(k=>r[k]!=null&&String(r[k]).trim()!=='')};
 vm.createContext(ctx);vm.runInContext(patch.helperSource(),ctx);
 const day='2026-11-23',meta={forEmpId:'L',reportOriginalShift:'早',overtimeAssignedShift:'早',other:42,overtimeReport:{id:'OLD',leaveId:'DELETED',planned:true,status:'預排待出勤',actualMinutes:null}};
 assert.equal(ctx.p79OrphanPlannedReportIdV1_(meta,[]),'OLD');
 for(const leaves of [undefined,null,[{id:'DELETED'}]])assert.equal(ctx.p79OrphanPlannedReportIdV1_(meta,leaves),'');
 for(const update of [{planned:false},{approvedAt:day},{attendanceInId:'IN'},{actualMinutes:0},{leaveId:''},{adjustedCoverReview:true}])assert.equal(ctx.p79OrphanPlannedReportIdV1_({...meta,overtimeReport:{...meta.overtimeReport,...update}},[]),'');
 const roster={[day]:'早'},kept=ctx.p79ClearOrphanPlanV1_(roster,day,meta);
 assert.equal(kept.overtimeReport,undefined);assert.equal(kept.other,42);assert.equal(kept.deletedLeaveOrphanPlanAudit.reportId,'OLD');
 assert.throws(()=>ctx.p79ClearOrphanPlanV1_(roster,day,{...meta,reportOriginalShift:undefined}),/缺少可確認班別/);
 for(const [path,prior] of [['leave/index.html','previous'],['schedule/index.html','previous'],['work-hours/index.html','existingReport']]){
  const html=fs.readFileSync(path,'utf8'),start=html.indexOf(' const orphanId=cloud.capabilities?.deletedLeaveOrphanPlanV1');
  const end=html.indexOf('\n }',start);
  assert(start>=0&&end>start,path+' has real scoped orphan guard');
  const guard=html.slice(start,end+3);
  const run=(cloud,report,draft={id:'NEW',date:day})=>vm.runInNewContext(guard+'\n orphanId;',{cloud,draft,employeeId:'W',[prior]:report});
  const cloud={capabilities:{deletedLeaveOrphanPlanV1:true},empId:'W',date:day,revision:'rev',orphanPlannedReportId:'OLD'};
  assert.equal(run(cloud,meta.overtimeReport),'OLD',path);
  for(const other of [{...cloud,empId:'OTHER'},{...cloud,date:'2026-11-24'},{...cloud,revision:''},{...cloud,orphanPlannedReportId:'OTHER'},{...cloud,capabilities:{}}])assert.throws(()=>run(other,meta.overtimeReport),/原紀錄|原申報/);
  assert.throws(()=>run(cloud,{...meta.overtimeReport,planned:false}),/避免覆蓋/);
  assert.throws(()=>run(cloud,meta.overtimeReport,{id:'NEW',date:day,preventReplace:true}),/避免覆蓋/);
  assert(html.includes("replaceReportId:orphanId?'':previous?.id||'',orphanPlannedReportId:orphanId"),path+' sends explicit proof, not arbitrary replacement');
 }
 console.log('PASS synthetic GAS helper and all three real host guards; run again with LIVE_Code.gs before deploying GAS');
 process.exit(0);
}
const source=patch(fs.readFileSync(file,'utf8')),c={console};vm.createContext(c);vm.runInContext(source,c);
const date='2026-11-23',rule=['延','延16-20',4,6.02,'08','16','16','20','after','平日延時加班'];
const original={forEmpId:'LEAVER',overtimeAssignedShift:'早',reportOriginalShift:'早',overtimeReport:{id:'OLD',leaveId:'DELETED',planned:true,status:'預排待出勤',actualMinutes:null,attendanceInId:'',attendanceOutId:'',workDate:date,coverDate:date},otherField:42};
const rows=meta=>[{empId:'WORKER',schedule:{[date]:'早',__meta:{[date]:meta}}}];
const req={id:'NEW',orphanPlannedReportId:'OLD',empId:'WORKER',date,month:'2026-11',workDate:date,overtimeDate:date,coverDate:date,planned:false,forEmpId:'',leaveHandoffId:''};
const attendance={start:Date.parse(date+'T08:00:00+08:00'),end:Date.parse(date+'T20:00:00+08:00'),inId:'IN',outId:'OUT'};
const check=(name,fn)=>{fn();console.log('PASS '+name)};
check('missing old leave, confirmed actual own overtime',()=>{const result=c.p79PlanDirectReport_(rows(original),req,rule,attendance,[],[{id:'NEW-LEAVE',empId:'LEAVER',status:'已核准',startDate:date,endDate:date}]);assert.equal(result.report.id,'NEW');assert.equal(result.report.leaveId,'');assert.equal(result.report.actualMinutes,240);assert.equal(result.rows[0].schedule.__meta[date].otherField,42);assert.equal(original.overtimeReport.id,'OLD')});
check('active old leave blocked',()=>assert.throws(()=>c.p79PlanDirectReport_(rows(original),req,rule,attendance,[],[{id:'DELETED',status:'已核准'}]),/仍有效/));
check('formal report blocked',()=>assert.throws(()=>c.p79PlanDirectReport_(rows({...original,overtimeReport:{...original.overtimeReport,planned:false}}),req,rule,attendance,[],[]),/仍有效/));
check('approved plan blocked',()=>assert.throws(()=>c.p79PlanDirectReport_(rows({...original,overtimeReport:{...original.overtimeReport,approvedAt:date}}),req,rule,attendance,[],[]),/仍有效/));
check('changed report ID blocked',()=>assert.throws(()=>c.p79PlanDirectReport_(rows(original),{...req,orphanPlannedReportId:'OTHER'},rule,attendance,[],[]),/仍有效/));
check('independent old plan blocked',()=>assert.throws(()=>c.p79PlanDirectReport_(rows({...original,overtimeReport:{...original.overtimeReport,leaveId:''}}),req,rule,attendance,[],[]),/仍有效/));
check('no cover row deletion removes exact pending report',()=>{const r=c.p79LeaveRemovalPlan_(rows(original),[],['DELETED']);assert.equal(r.rows[0].schedule.__meta[date].overtimeReport,undefined);assert.equal(r.rows[0].schedule.__meta[date].otherField,42);assert.equal(r.rows[0].schedule[date],'早')});
check('newer leave protected even if old cover matches same person and date',()=>{const r=c.p79LeaveRemovalPlan_(rows({...original,overtimeReport:{...original.overtimeReport,leaveId:'NEW-LEAVE'}}),[['DELETED','LEAVER',date,date,'one','["WORKER"]']],['DELETED']);assert.equal(r.rows[0].schedule.__meta[date].overtimeReport.leaveId,'NEW-LEAVE')});
check('unknown original shift blocked',()=>assert.throws(()=>c.p79PlanDirectReport_(rows({...original,reportOriginalShift:undefined}),req,rule,attendance,[],[]),/缺少可確認班別/));
check('original duplicate guard still active without orphan proof',()=>assert.throws(()=>c.p79PlanDirectReport_(rows(original),{...req,orphanPlannedReportId:''},rule,attendance,[],[]),/已有請假代班連結/));
