'use strict';
const fs=require('node:fs'),vm=require('node:vm');
const replacements=[
  [
    "function p79LeaveRemovalPlan_(rows,covers,leaveIds){",
    "function p79DeletedLeavePendingIdV1_(meta){\n const r=meta&&meta.overtimeReport;\n if(!r||!r.id||r.planned!==true||String(r.status||'')!=='預排待出勤'||r.actualMinutes!=null||r.attendanceInId||r.attendanceOutId||p79OtAutoApproved_(r)||meta.overtimeExcluded===true||(Array.isArray(meta.overtimeReports)&&meta.overtimeReports.length))return '';\n const leaveId=String(r.leaveId||'');\n if(!leaveId||meta.leaveId&&String(meta.leaveId)!==leaveId)return '';\n return leaveId;\n}\nfunction p79OrphanPlannedReportIdV1_(meta,leaves){\n const leaveId=p79DeletedLeavePendingIdV1_(meta);\n return leaveId&&Array.isArray(leaves)&&!leaves.some(l=>String(l.id)===leaveId)?String(meta.overtimeReport.id):'';\n}\nfunction p79ClearOrphanPlanV1_(schedule,date,meta){\n if(meta.overtimeAssignedShift&&schedule[date]===meta.overtimeAssignedShift){\n  const original=meta.reportOriginalShift!==undefined?meta.reportOriginalShift:meta.overtimeOriginalShift;\n  if(original===undefined||original===null||String(original).trim()==='')throw Error('原代班預排缺少可確認班別，保留原資料');\n  schedule[date]=original;\n }\n const kept=Object.assign({},meta);\n ['type','forEmpId','forName','note','assignedAt','overtime','overtimeType','overtimeOriginalShift','overtimeAssignedShift','overtimeStart','overtimeEnd','overtimeReport','reportOriginalShift','leaveId','overtimeDate','overtimeExcluded','overtimeDeletedAt'].forEach(k=>delete kept[k]);\n return kept;\n}\nfunction p79LeaveRemovalPlan_(rows,covers,leaveIds){"
  ],
  [
    "      if(!linked)return;\n      if(meta.overtimeAssignedShift",
    "      // An explicit newer leave ID must never be removed by a legacy person/date match.\n      const explicit=String(meta.overtimeReport&&meta.overtimeReport.leaveId||meta.leaveId||'');\n      if(explicit&&!ids.has(explicit))return;\n      const pendingExact=ids.has(p79DeletedLeavePendingIdV1_(meta));\n      if(!linked&&!pendingExact)return;\n      if(meta.overtimeAssignedShift"
  ],
  [
    " const schedule=row.schedule||{},meta=schedule.__meta||{},old=meta[date]||{};\n p79AssertPlannedEditV1_(old,request);",
    " const schedule=row.schedule||{},meta=schedule.__meta||{};\n let old=meta[date]||{};\n if(request.orphanPlannedReportId&&String(old.overtimeReport?.id||'')!==String(request.id)){\n  const orphan=p79OrphanPlannedReportIdV1_(old,leaveRecords);\n  if(!orphan||orphan!==String(request.orphanPlannedReportId)||request.replaceReportId||request.editPlannedOnly===true||request.plannedReview===true)throw Error('原請假預排仍有效或已變更，未覆蓋原申報');\n  old=p79ClearOrphanPlanV1_(schedule,date,old);meta[date]=old;\n }\n p79AssertPlannedEditV1_(old,request);"
  ],
  [
    "return {ok:true,action:'getOvertimeReportContext'",
    "const leaveSheet=ss.getSheetByName(SHEET_LEAVE);\n if(!leaveSheet)throw Error('無法確認正式請假資料');\n const allLeaves=readLeaveRecords_(leaveSheet);\n if(!Array.isArray(allLeaves))throw Error('正式請假資料未讀齊');\n const priorMeta=(schedules.find(r=>normalizeEmpId_(r.empId)===empId)||{}).schedule?.__meta?.[date]||{};\n return {orphanPlannedReportId:p79OrphanPlannedReportIdV1_(priorMeta,allLeaves),ok:true,action:'getOvertimeReportContext'"
  ]
];
function patch(source){
 for(const [oldText,newText] of replacements){
  if(source.split(oldText).length!==2)throw Error('GAS anchor missing or duplicated: '+oldText.slice(0,100));
  source=source.replace(oldText,newText);
 }
 const start=source.indexOf('function p79GetOvertimeReportContext_(p){'),end=source.indexOf('\nfunction ',start+1);
 if(start<0||end<0)throw Error('missing context function');
 const context=source.slice(start,end);
 if(context.split('manualOvertimeCoverageV1:true').length!==2)throw Error('missing capability anchor');
 source=source.slice(0,start)+context.replace('manualOvertimeCoverageV1:true','manualOvertimeCoverageV1:true,deletedLeaveOrphanPlanV1:true')+source.slice(end);
 new vm.Script(source);
 return source;
}
module.exports=patch;
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output||input===output)throw Error('Usage: node scripts/apply-gas-deleted-leave-orphan-plan.cjs LIVE_Code.gs PATCHED_Code.gs');fs.writeFileSync(output,patch(fs.readFileSync(input,'utf8')));}
