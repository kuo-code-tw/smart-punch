'use strict';
// Apply only AFTER the existing adjusted-overtime-review patch is present in live Code.gs.
const fs=require('node:fs'),vm=require('node:vm');
const ops=[
  [
    "function p79PlanDirectReport_(rows,request,rule,attendance,leaveCovers,leaveRecords,coverRows){",
    "// Edit an existing unapproved plan in place; never turn a real report back into a plan.\nfunction p79AssertPlannedEditV1_(old,request){\n if(request.editPlannedOnly!==true)return;\n const r=old&&old.overtimeReport,date=String(request.date||'');\n if(request.planned!==true||!r||r.planned!==true||old.overtimeExcluded===true||\n    String(r.id)!==String(request.id)||String(r.id)!==String(request.replaceReportId)||\n    ['approvalStatus','approvedBy','approvedAt','reviewedBy','reviewedAt'].some(k=>r[k]!=null&&r[k]!==''))\n  throw Error('原預排已變更、正式申報或審核，不能再修改預排');\n if(String(r.workDate||date)!==date||\n    String(r.coverDate||date)!==String(request.coverDate||date)||\n    String(r.overtimeDate||date)!==String(request.overtimeDate||date)||\n    String(r.leaveId||'')!==String(request.leaveHandoffId||'')||\n    normalizeEmpId_(old.forEmpId||r.forEmpId||'')!==normalizeEmpId_(request.forEmpId||''))\n  throw Error('原預排日期或代班關聯已變更，請重新讀取原預排');\n}\nfunction p79PlanDirectReport_(rows,request,rule,attendance,leaveCovers,leaveRecords,coverRows){"
  ],
  [
    " const coverDate=p79DirectCoverDateV107_(request,old);",
    " p79AssertPlannedEditV1_(old,request);\n if(request.editPlannedOnly===true&&((request.leaveHandoffId&&!['延','代'].includes(rule[0]))||(!request.leaveHandoffId&&rule[0]==='代')))throw Error('請保留原代班關聯，另行核對申報類型');\n const coverDate=p79DirectCoverDateV107_(request,old);"
  ],
  [
    " if(request.coverPeriodMode!=='same-day')schedule[date]=assigned;",
    " // Changing a pending plan must not rewrite the employee's actual normal roster.\n if(request.coverPeriodMode!=='same-day'&&request.editPlannedOnly!==true)schedule[date]=assigned;"
  ],
  [
    " const planned=data.planned===true&&(date>=today||retry&&meta.overtimeReport.planned===true);",
    " if(data.editPlannedOnly===true)p79AssertPlannedEditV1_(meta,{...data,date:date});\n const planned=data.planned===true&&(date>=today||data.editPlannedOnly===true||retry&&meta.overtimeReport.planned===true);"
  ],
  [
    "  if(!p79DirectConversionReceipt_(saved,data.id,rule))throw Error('加班寫入的時數、換算或時段未通過讀回確認，請保留申報識別碼再試');",
    "  if(!p79DirectConversionReceipt_(saved,data.id,rule))throw Error('加班寫入的時數、換算或時段未通過讀回確認，請保留申報識別碼再試');\n  if(data.editPlannedOnly===true&&(saved.planned!==true||String(saved.leaveId||'')!==String(data.leaveHandoffId||'')||String(saved.coverDate||date)!==String(data.coverDate||date)||String(saved.note||'')!==String(data.note||'')))throw Error('預排修改尚未通過讀回核對，請保留原預排ID');"
  ],
  [
    "adjustedOvertimeReviewV1:true},report:",
    "adjustedOvertimeReviewV1:true,plannedOvertimeEditV1:true,manualOvertimeCoverageV1:true},report:"
  ],
  [
    " if(!cover||!leave)throw Error('對應請假或代班安排已變更，未生成加班');",
    " if(!cover||!leave)throw Error('對應請假或代班安排已變更，未生成加班');\n // A revised pending plan is not proof of coverage. Keep the source link/date\n // and defer the actual coverage decision to formal filing.\n if(request.editPlannedOnly===true){\n  p79AssertPlannedEditV1_(review&&review.old,request);\n  return {overtimeDate:String(review.old.overtimeReport.overtimeDate||date)};\n }"
  ],
  [
    " if(!anchor||rule[0]!=='延'||p79DirectMinute_(rule[4])%1440!==anchor[0]||p79DirectMinute_(rule[5])%1440!==anchor[1])",
    " // The operator may explicitly select a fully punched overtime interval\n // after a roster change. Automatic/batch matching stays strict.\n if(request.manualReviewCoverage===true&&rule[0]==='延'&&anchor&&attendance&&attendance.inId&&attendance.outId){\n  const actual=p79DirectRuleEnvelope_(date,rule);\n  if(attendance.start<=actual.overtime[0]&&attendance.end>=actual.overtime[1]&&actual.overtime[1]-actual.overtime[0]===Number(rule[2])*3600000)\n   return {shift:shift,envelope:actual};\n }\n if(!anchor||rule[0]!=='延'||p79DirectMinute_(rule[4])%1440!==anchor[0]||p79DirectMinute_(rule[5])%1440!==anchor[1])"
  ],
  [
    " if(!planned&&!actualMinutes)throw Error('出勤時間沒有包含所選加班時段');",
    " if(!planned&&!actualMinutes)throw Error('出勤時間沒有包含所選加班時段');\n if(request.manualReviewCoverage===true&&(!p79DirectOriginalPlannedReviewV1_(old,request)||rule[0]!=='延'||!attendance||!attendance.inId||!attendance.outId||attendance.start>envelope.overtime[0]||attendance.end<envelope.overtime[1]||actualMinutes!==Number(rule[2])*60))throw Error('手動核對須由原預排、完整實際加班打卡及正確時數確認');"
  ]
];
if(process.argv.length!==4||process.argv[2]===process.argv[3])throw Error('usage: node scripts/apply-gas-pending-overtime-edit.cjs LIVE_Code.gs PATCHED_Code.gs');
let source=fs.readFileSync(process.argv[2],'utf8');
for(const [before,after] of ops){if(source.split(before).length!==2)throw Error('Live GAS source differs; stopped before writing: '+before.slice(0,100));source=source.replace(before,after);}
new vm.Script(source);fs.writeFileSync(process.argv[3],source);console.log('Patch applied and parsed; live GAS is not deployed.');
