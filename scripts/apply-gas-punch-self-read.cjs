'use strict';
const fs=require('fs');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Unexpected production fragment: '+a.slice(0,90));return s.replace(a,b);}
function apply(source){
 let s=once(source,"const API_VERSION = '2026.11.05.V97-SHORT-EDIT-LOCK';","const API_VERSION = '2026.11.05.V98-PUNCH-SELF-READ';");
 const start=s.indexOf("    if (action === 'getAttendanceMainDirect') {"),end=s.indexOf("\n    if (",start+10);if(start<0||end<0)throw Error('route missing');
 let route=s.slice(start,end);
 route=once(route,"      if (token) {\n        userRequireTokenCore_(ss, token);\n      }", "      const punchSelf = String(params.punchSelf || '') === '1';\n      const selfSession = punchSelf ? userRequireTokenCore_(ss, token) : null;\n      if (token && !punchSelf) userRequireTokenCore_(ss, token);");
 route=once(route,'p79ReadAttendanceMainDirect_(ss, month)','p79ReadAttendanceMainDirect_(ss, month, selfSession)');
 route=once(route,'const validRecords = p79EnrichAttendanceIdentities_(ss, direct.records.filter(function(record) {','const filteredRecords = direct.records.filter(function(record) {');
 route=once(route,'      }));','      });\n      const validRecords = punchSelf ? filteredRecords : p79EnrichAttendanceIdentities_(ss, filteredRecords);');
 route=once(route,"        action:'getAttendanceMainDirect',","        action:'getAttendanceMainDirect',\n        punchSelf:punchSelf,\n        empId:selfSession ? normalizeEmpId_(selfSession.empId) : '',");
 s=s.slice(0,start)+route+s.slice(end);
 s=once(s,'function p79ReadAttendanceMainDirectUnprotectedV54_(ss, monthKey) {','function p79ReadAttendanceMainDirectUnprotectedV54_(ss, monthKey, selfSession) {');
 s=once(s,'  values.forEach(function(row, i){\n    const rawTime=', '  values.forEach(function(row, i){\n    if(selfSession && !p79PunchSelfMatches_(selfSession,{empId:row[idx.empId],attNo:row[idx.attNo],name:row[idx.name]}))return;\n    const rawTime=');
 s=once(s,'function p79ReadAttendanceMainDirect_(ss,monthKey){\n const result=p79ReadAttendanceMainDirectUnprotectedV54_(ss,monthKey);','function p79ReadAttendanceMainDirect_(ss,monthKey,selfSession){\n const result=p79ReadAttendanceMainDirectUnprotectedV54_(ss,monthKey,selfSession);');
 s=once(s,'p79MergeProtectedPunchOriginals_(ss.getSheetByName(SHEET_RECORDS),result.records);','p79MergeProtectedPunchOriginals_(ss.getSheetByName(SHEET_RECORDS),result.records,selfSession);');
 s=once(s,'function p79MergeProtectedPunchOriginals_(sheet, records) {','function p79MergeProtectedPunchOriginals_(sheet, records, selfSession) {');
 s=once(s,"    if(String(record.source||'').toLowerCase().indexOf('employee')<0)return;seen.add(id);result.push(record);","    if(String(record.source||'').toLowerCase().indexOf('employee')<0)return;\n    if(selfSession && !p79PunchSelfMatches_(selfSession,record))return;\n    seen.add(id);result.push(record);");
 return s+'\n'+fs.readFileSync(require('path').join(__dirname,'../backend/punch-self-identity.gs'),'utf8');
}
module.exports={apply};if(require.main===module){const [input,output]=process.argv.slice(2);fs.writeFileSync(output,apply(fs.readFileSync(input,'utf8')));}
