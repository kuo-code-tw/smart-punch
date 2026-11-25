// Guarded source patch; run on the downloaded LIVE Code.gs, then deploy separately.
'use strict';
const fs=require('node:fs'),vm=require('node:vm');
const ops=[
  [
    "function p79DirectCoverCheckV107_(rows,request,rule,cover,leaves,coverDate){",
    "// Adjusted-shift review: only an existing, unapproved planned report with\n// a fresh verified attendance pair may use the new path. Never alter a new\n// leave assignment, the original ID, or another day's attendance.\nfunction p79DirectAdjustedShiftV1_(rows,request,rule,attendance){\n const date=String(request.date),row=rows.find(r=>normalizeEmpId_(r.empId)===normalizeEmpId_(request.empId));\n const s=row&&row.schedule||{},shift=[s[date],s[date.slice(-2)],s[String(Number(date.slice(-2)))]].\n  map(v=>String(v||'').trim()).find(v=>['早','中','晚'].includes(v));\n const anchor={早:[480,960],中:[960,0],晚:[0,480]}[shift];\n if(!anchor||rule[0]!=='延'||p79DirectMinute_(rule[4])%1440!==anchor[0]||p79DirectMinute_(rule[5])%1440!==anchor[1])\n  throw Error('調班後所選加班時段與最新正式正常班不符，請重新選擇');\n if(!attendance||!(attendance.end>attendance.start)||!attendance.inId||!attendance.outId)throw Error('調班後須核對完整實際打卡');\n const env=p79DirectRuleEnvelope_(date,rule),hour=3600000,tol=45*60000;\n const endFloor=Math.floor(attendance.end/hour)*hour;\n const cutoff=endFloor+(attendance.end-endFloor>=tol?hour:0);\n if(Math.abs(attendance.start-env.start)>tol||Math.abs(attendance.end-env.end)>tol||cutoff<env.end||\n    env.overtime[1]-env.overtime[0]!==Number(rule[2])*hour)\n  throw Error('調班後實際上下班與所選加班時段不符，請重新核對');\n return {shift:shift,envelope:env};\n}\nfunction p79DirectOriginalPlannedReviewV1_(old,request){\n const r=old&&old.overtimeReport,date=String(request.date);\n return !!(r&&r.planned===true&&request.planned===false&&String(r.id)===String(request.id)&&\n  String(request.replaceReportId)===String(r.id)&&String(r.workDate||date)===date&&\n  !['approvalStatus','approvedBy','approvedAt','reviewedBy','reviewedAt'].some(k=>r[k]!=null&&r[k]!==''));\n}\nfunction p79DirectAdjustedLinkedV1_(rows,request,rule,coverDate,targetShift,review){\n const old=review&&review.old,r=old&&old.overtimeReport;\n if(!p79DirectOriginalPlannedReviewV1_(old,request))return null;\n if(String(r.leaveId||'')!==String(request.leaveHandoffId||'')||\n    normalizeEmpId_(old.forEmpId||r.forEmpId)!==normalizeEmpId_(request.forEmpId)||\n    String(r.coverDate||request.date)!==coverDate)return null;\n const actual=p79DirectAdjustedShiftV1_(rows,request,rule,review.attendance);\n const periods={早:['08','16'],中:['16','24'],晚:['24','08']};\n const target=periods[targetShift];\n if(!target||Number(rule[2])!==4)throw Error('調班後原請假班別或四小時代班時段未能確認');\n const bounds=p79DirectInterval_(coverDate,target[0],target[1]);\n if(actual.envelope.overtime[0]<bounds[0]||actual.envelope.overtime[1]>bounds[1])\n  throw Error('調班後實際加班時段不屬於原請假班別，請改為本人加班核對');\n const credit=targetShift==='晚'?coverDate:String(request.date);\n if(String(r.overtimeDate||request.date)!==credit||String(request.overtimeDate||request.date)!==credit)\n  throw Error('調班後加班歸屬日須個別核對，原申報保留');\n return {shift:actual.shift,overtimeDate:credit};\n}\nfunction p79DirectIndependentAdjustedV1_(rows,request,rule,attendance,old){\n const r=old&&old.overtimeReport,date=String(request.date);\n if(!p79DirectOriginalPlannedReviewV1_(old,request)||!r.leaveId||!old.forEmpId||\n    request.leaveHandoffId||request.forEmpId||\n    String(r.leaveId)!==String(request.sourceLeaveHandoffId||'')||\n    normalizeEmpId_(old.forEmpId)!==normalizeEmpId_(request.sourceForEmpId)||\n    String(r.coverDate||date)!==date||String(r.overtimeDate||date)!==date||\n    String(request.coverDate||date)!==date||String(request.overtimeDate||date)!==date)\n  throw Error('原代班申報關聯或日期已變更，未改為本人加班');\n const actual=p79DirectAdjustedShiftV1_(rows,request,rule,attendance);\n return {shift:actual.shift,source:{leaveId:String(r.leaveId),forEmpId:String(old.forEmpId),coverDate:date,overtimeDate:date}};\n}\n\nfunction p79DirectCoverCheckV107_(rows,request,rule,cover,leaves,coverDate,review){ "
  ],
  [
    " if(date!==p[0]||p79DirectCoverShiftV107_(own,date)!==p[1])throw Error('代班工作日期或本人正常班已變更，請重新核對');\n if(rule[0]!=='延'||Number(rule[2])!==4||rule[8]!==p[6]||![4,5,6,7].every(function(i){return p79DirectMinute_(rule[i])===p79DirectMinute_(p[i-2]);}))throw Error('代班加班時段與原請假班別不符，請重新核對');",
    " const changedShift=date!==p[0]||p79DirectCoverShiftV107_(own,date)!==p[1];\n const changedPeriod=rule[0]!=='延'||Number(rule[2])!==4||rule[8]!==p[6]||![4,5,6,7].every(function(i){return p79DirectMinute_(rule[i])===p79DirectMinute_(p[i-2]);});\n if(changedShift||changedPeriod){\n  const adjusted=p79DirectAdjustedLinkedV1_(rows,request,rule,coverDate,shift,review);\n  if(adjusted)return adjusted;\n  throw Error(changedShift?'代班工作日期或本人正常班已變更，請重新核對':'代班加班時段與原請假班別不符，請重新核對');\n }"
  ],
  [
    "function p79DirectDatesV108_(rows,request,rule,covers,leaves,coverDate){\n var date=String(request.date||''),expected=date;",
    "function p79DirectDatesV108_(rows,request,rule,covers,leaves,coverDate,review){\n var date=String(request.date||''),expected=date,adjusted=null;"
  ],
  [
    "  p79DirectCoverCheckV107_(rows,request,rule,cover,leaves,coverDate);",
    "  adjusted=p79DirectCoverCheckV107_(rows,request,rule,cover,leaves,coverDate,review)||null;"
  ],
  [
    "  // Do not create a second report while a legacy same-cover report exists elsewhere.",
    "  if(adjusted)expected=adjusted.overtimeDate;\n  // Do not create a second report while a legacy same-cover report exists elsewhere."
  ],
  [
    " return {workDate:date,overtimeDate:expected,coverDate:coverDate};",
    " return {workDate:date,overtimeDate:expected,coverDate:coverDate,adjustedShift:adjusted&&adjusted.shift||''};"
  ],
  [
    " if(old.forEmpId&&rule[0]!=='代'&&!request.leaveHandoffId){",
    " if(old.overtimeReport?.id===request.id&&(old.overtimeReport.adjustedCoverReview===true||old.overtimeReport.adjustedIndependentFrom)&&p79DirectReportSameRequest_(old,request,rule))return {rows:next,duplicate:true,report:old.overtimeReport};\n const independentAdjusted=request.adjustedIndependentReview===true?p79DirectIndependentAdjustedV1_(next,request,rule,attendance,old):null;\n if(old.forEmpId&&rule[0]!=='代'&&!request.leaveHandoffId&&!independentAdjusted){"
  ],
  [
    " const accounting=p79DirectDatesV108_(next.concat(coverRows||[]),request,rule,leaveCovers,leaveRecords,coverDate);",
    " const review={old:old,attendance:attendance};\n const accounting=p79DirectDatesV108_(next.concat(coverRows||[]),request,rule,leaveCovers,leaveRecords,coverDate,review);"
  ],
  [
    " const original=old.reportOriginalShift??old.overtimeOriginalShift??schedule[date]??'';",
    " const original=(independentAdjusted&&independentAdjusted.shift||accounting.adjustedShift)||(old.reportOriginalShift??old.overtimeOriginalShift??schedule[date]??'');"
  ],
  [
    "  p79DirectCoverCheckV107_(next.concat(coverRows||[]),request,rule,cover,leaveRecords,coverDate);",
    "  p79DirectCoverCheckV107_(next.concat(coverRows||[]),request,rule,cover,leaveRecords,coverDate,review);"
  ],
  [
    " const canonical=t=>p79DirectMinute_(t)===1440?'00:00':String(t).includes(':')?t:t+':00';",
    " if(accounting.adjustedShift)report.adjustedCoverReview=true;\n if(independentAdjusted)report.adjustedIndependentFrom=independentAdjusted.source;\n const canonical=t=>p79DirectMinute_(t)===1440?'00:00':String(t).includes(':')?t:t+':00';"
  ],
  [
    "capabilities:{nightCoverOvertimeAccountingV1:true,sameDayCoverFourHourV1:true}",
    "capabilities:{nightCoverOvertimeAccountingV1:true,sameDayCoverFourHourV1:true,adjustedOvertimeReviewV1:true}"
  ],
  [
    "'overtimeEnd','position','note','leaveId','leaveHandoffId','forEmpId','coverDate','workDate','overtimeDate'];",
    "'overtimeEnd','position','note','leaveId','leaveHandoffId','forEmpId','coverDate','workDate','overtimeDate','adjustedCoverReview','adjustedIndependentFrom'];"
  ],
  [
    " const credit=targetShift==='晚'?coverDate:String(request.date);",
    " // An adjusted worker may not claim the same leave coverage interval as\n // another already confirmed report. Actual independent overtime remains\n // possible, but must be explicitly confirmed as such.\n for(const row of rows){\n  if(normalizeEmpId_(row.empId)===normalizeEmpId_(request.empId))continue;\n  for(const [day,m] of Object.entries(row.schedule?.__meta||{})){\n   const other=m?.overtimeReport;\n   if(!other||other.planned!==false||m.overtimeExcluded||String(other.leaveId||'')!==String(request.leaveHandoffId)||\n      String(other.coverDate||day)!==coverDate||(m.overtimeRevocations||[]).some(x=>x?.confirmed&&String(x.reportId)===String(other.id)))continue;\n   const otherRule=[other.category,other.code,other.declaredHours,other.convertedHours,other.normalStart,other.normalEnd,other.overtimeStart,other.overtimeEnd,other.position];\n   const span=p79DirectRuleEnvelope_(String(other.workDate||day),otherRule).overtime;\n   if(actual.envelope.overtime[0]<span[1]&&span[0]<actual.envelope.overtime[1])\n    throw Error('調班後實際加班時段不屬於原請假班別，請改為本人加班核對');\n  }\n }\n const credit=targetShift==='晚'?coverDate:String(request.date);"
  ],
  [
    "  plan.report=saved;",
    "  if(plan.report.adjustedCoverReview===true&&saved.adjustedCoverReview!==true)throw Error('調班核對標記未通過正式讀回確認');\n  if(plan.report.adjustedIndependentFrom&&['leaveId','forEmpId','coverDate','overtimeDate'].some(k=>String(saved.adjustedIndependentFrom?.[k]||'')!==String(plan.report.adjustedIndependentFrom[k]||'')))throw Error('本人加班原代班稽核未通過正式讀回確認');\n  plan.report=saved;"
  ]
];
function patch(source){for(const [from,to] of ops){if(source.split(from).length!==2)throw Error('GAS source differs: '+from.slice(0,100));source=source.replace(from,to);}new vm.Script(source);return source;}
module.exports=patch;
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/apply-gas-adjusted-overtime-review.cjs LIVE_Code.gs PATCHED_Code.gs');fs.writeFileSync(output,patch(fs.readFileSync(input,'utf8')));console.log('Source patched and syntax verified; GAS deployment and production readback are separate.');}
