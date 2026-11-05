'use strict';
const fs=require('fs');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Unexpected source fragment: '+a.slice(0,90));return s.replace(a,b);}
function apply(source){
 let s=once(source,"const API_VERSION = '2026.11.05.V98-PUNCH-SELF-READ';","const API_VERSION = '2026.11.05.V99-PUNCH-READ-IO';");
 s=once(s,"  const ignore = !action || action==='ping' || action==='deploymentCheck' || action==='getSyncMeta' || action==='getAttendanceDelta';","  const ignore = !action || action==='ping' || action==='deploymentCheck' || action==='getSyncMeta' || action==='getAttendanceDelta' || (action==='getAttendanceMainDirect' && String(params.punchSelf||'')==='1');");
 s=once(s,"      const direct = p79ReadAttendanceMainDirect_(ss, month, selfSession);\n\n      const deletedIds = getDeletedRecordIds_(ss);","      const deletedIds = punchSelf ? p79PunchDeletedIdsFast_(ss) : getDeletedRecordIds_(ss);\n      const direct = p79ReadAttendanceMainDirect_(ss, month, selfSession, deletedIds);");
 const start=s.indexOf('function p79ReadAttendanceMainDirectUnprotectedV54_('),end=s.indexOf('\nfunction ',start+10);if(start<0||end<0)throw Error('read missing');
 let read=s.slice(start,end);
 read=once(read,'  const sheet = ensureSheet_(ss, SHEET_RECORDS, RECORD_HEADERS);','  const sheet = selfSession ? getSheetFast_(ss, SHEET_RECORDS, RECORD_HEADERS) : ensureSheet_(ss, SHEET_RECORDS, RECORD_HEADERS);');
 read=once(read,'  if (sheet.getLastRow() < 2) {','  const lastRow = sheet.getLastRow();\n  if (lastRow < 2) {');
 read=read.split('sheet.getLastRow()-1').join('lastRow-1');
 s=s.slice(0,start)+read+s.slice(end);
 s=once(s,'function p79ReadAttendanceMainDirect_(ss,monthKey,selfSession){','function p79ReadAttendanceMainDirect_(ss,monthKey,selfSession,deletedIds){');
 s=once(s,'p79MergeProtectedPunchOriginals_(ss.getSheetByName(SHEET_RECORDS),result.records,selfSession);','p79MergeProtectedPunchOriginals_(ss.getSheetByName(SHEET_RECORDS),result.records,selfSession,deletedIds);');
 s=once(s,'function p79MergeProtectedPunchOriginals_(sheet, records, selfSession) {','function p79MergeProtectedPunchOriginals_(sheet, records, selfSession, deletedIds) {');
 s=once(s,'  const deleted=getDeletedRecordIds_(ss),result=(records||[]).slice(),seen=new Set(result.map(r=>normalizeId_(r.id)));','  const deleted=deletedIds || getDeletedRecordIds_(ss),result=(records||[]).slice(),seen=new Set(result.map(r=>normalizeId_(r.id)));');
 return s+'\nfunction p79PunchDeletedIdsFast_(ss){\n const visible=p79DeletedIdsFromSheet_(ss.getSheetByName(SHEET_DELETED_RECORDS));\n const permanent=p79DeletedIdsFromSheet_(p79ExistingPermanentDeletedSheet_(ss));\n Object.keys(permanent).forEach(function(id){visible[id]=true;});\n return visible;\n}\n';
}
module.exports={apply};if(require.main===module){const [input,output]=process.argv.slice(2);fs.writeFileSync(output,apply(fs.readFileSync(input,'utf8')));}
