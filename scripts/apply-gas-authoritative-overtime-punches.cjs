'use strict';
const fs=require('node:fs'),vm=require('node:vm');
const helper="function p79OfficialOvertimePunchesV1_(ss,empId,date){\n const base=Date.parse(date+'T00:00:00+08:00');\n if(!Number.isFinite(base))throw Error('出勤日期無效');\n const current=attendanceCurrentMonthKey_(),months=new Set();\n for(let offset=-1;offset<=2;offset++){\n  const month=new Date(base+offset*86400000+8*3600000).toISOString().slice(0,7);\n  if(month<=current)months.add(month);\n }\n const deleted=getDeletedRecordIds_(ss),byId=new Map();\n for(const month of months){\n  let rows;\n  if(month===current){\n   if(!ss.getSheetByName(SHEET_RECORDS))throw Error('正式考勤主表不存在，停止申報');\n   rows=p79ReadAttendanceMainDirectUnprotectedV54_(ss,month,null).records;\n  }else{\n   const sheet=getAttendanceMonthlySheet_(ss,month,false);\n   if(!sheet){if(month===date.slice(0,7))throw Error('正式月份考勤未讀齊，停止申報');continue;}\n   rows=readRecords_(sheet);\n  }\n  if(!Array.isArray(rows))throw Error('正式考勤未讀齊，停止申報');\n  for(const record of rows){\n   if(normalizeEmpId_(record.empId)!==empId)continue;\n   const id=normalizeId_(record.id);\n   // Automatic recovery records are not independent, confirmed punches.\n   // Never use backups, pending writes or fabricated recovery IDs here.\n   if(!id||deleted[id]||isAttendanceManualPairRecoveryRecord_(record))continue;\n   const t=attendanceCanonicalEpoch_(record);\n   if(!Number.isFinite(t)||t<base-86400000||t>=base+3*86400000)continue;\n   const old=byId.get(id);\n   if(old&&(attendanceCanonicalEpoch_(old)!==t||attendanceRecordTypeCode_(old)!==attendanceRecordTypeCode_(record)))throw Error('正式考勤同一識別碼時間或狀態不一致，停止申報');\n   if(!old)byId.set(id,record);\n  }\n }\n // Work on copies only. A surviving checkout may point to an intentionally\n // deleted check-in; that link is not evidence of a real check-in.\n const out=[];\n for(const record of byId.values()){\n  const copy=Object.assign({},record);\n  for(const side of ['In','Out']){\n   const prefix='manualPairClock'+side,target=normalizeId_(copy[prefix+'Id']);\n   const other=target&&byId.get(target);\n   const expected=side==='In'?'IN':'OUT';\n   if(!other||deleted[target]||attendanceRecordTypeCode_(other)!==expected||target===normalizeId_(copy.id)){\n    for(const suffix of ['Id','Key','TimeStr'])delete copy[prefix+suffix];\n   }else{\n    // Match the persisted target ID and time, not an old embedded timestamp.\n    copy[prefix+'TimeStr']=other.timeStr;\n    delete copy[prefix+'Key'];\n   }\n  }\n  const target=normalizeId_(copy.v5PairTargetId),other=target&&byId.get(target);\n  if(!other||deleted[target]||target===normalizeId_(copy.id)||attendanceRecordTypeCode_(other)===attendanceRecordTypeCode_(copy)){\n   delete copy.v5PairTargetId;delete copy.v5PairLinkedAt;\n  }\n  out.push(copy);\n }\n return out;\n}\n";
function patch(source){
 function once(a,b){if(source.split(a).length!==2)throw Error('GAS anchor missing or duplicated: '+a.slice(0,120));source=source.replace(a,b);}
 // Compatible with the earlier overtime epoch parser patch: select the
 // existing parser rather than changing all attendance data globally.
 const epoch=source.includes('function p79OvertimePunchEpochV1_(')?'p79OvertimePunchEpochV1_':'attendanceCanonicalEpoch_';
 const body=helper.replaceAll('attendanceCanonicalEpoch_(',epoch+'(');
 once('function p79SaveDirectOvertimeReport_(ss,data){',body+'\nfunction p79SaveDirectOvertimeReport_(ss,data){');
 once("  const nextMonth=p79NextMonthV108_(month);\n  const raw=p79MergeAttendanceV108_((getAttendanceMonthData_(month).records||[]).concat(Number(date.slice(-2))===new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate()?(getAttendanceMonthData_(nextMonth).records||[]):[])).filter(function(r){return normalizeEmpId_(r.empId)===empId;});","  const raw=p79OfficialOvertimePunchesV1_(ss,empId,date);");
 const start=source.indexOf('function p79GetOvertimeReportContext_(p){'),end=source.indexOf('\nfunction ',start+1);
 if(start<0||end<0)throw Error('Missing overtime context route');
 let part=source.slice(start,end);
 const old=" const month=date.slice(0,7),today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd'),data=date>today?{ok:true,records:[]}:getAttendanceMonthData_(month);";
 const pos=part.indexOf(old),fields=part.indexOf(' const fields=',pos);
 if(pos<0||fields<0)throw Error('Missing exact attendance read anchors');
 part=part.slice(0,pos)+" const month=date.slice(0,7),today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd'),data={ok:true,records:date>today?[]:p79OfficialOvertimePunchesV1_(ss,empId,date)};\n"+part.slice(fields);
 const fieldAnchor="'manualPairClockInId','manualPairClockOutId','v5PairTargetId'";
 if(part.split(fieldAnchor).length!==2)throw Error('Missing punch fields');
 part=part.replace(fieldAnchor,fieldAnchor+",'manualPairClockInTimeStr','manualPairClockOutTimeStr','manualPairLinkedAt','v5PairLinkedAt','manuallyEdited','manuallyEditedAt'");
 if(part.split('manualOvertimeCoverageV1:true').length!==2)throw Error('Missing capability anchor');
 part=part.replace('manualOvertimeCoverageV1:true','manualOvertimeCoverageV1:true,authoritativeOvertimePunchesV1:true');
 source=source.slice(0,start)+part+source.slice(end);
 new vm.Script(source);return source;
}
module.exports=patch;
module.exports.helperSource=()=>helper;
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output||input===output)throw Error('Usage: node scripts/apply-gas-authoritative-overtime-punches.cjs LIVE_Code.gs PATCHED_Code.gs');fs.writeFileSync(output,patch(fs.readFileSync(input,'utf8')));}
