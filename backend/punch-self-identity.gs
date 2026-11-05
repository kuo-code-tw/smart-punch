// Token identity only. A supplied empId cannot select a different employee.
function p79PunchSelfMatches_(session,record){
 const empId=normalizeEmpId_(session && session.empId);
 if(!empId)return false;
 const recordId=normalizeEmpId_(record && record.empId);
 if(recordId)return recordId===empId;
 const attNo=normalizeText_(session.attNo),name=normalizeText_(session.name).replace(/\s+/g,'');
 return !!attNo && !!name && normalizeText_(record && record.attNo)===attNo &&
   normalizeText_(record && record.name).replace(/\s+/g,'')===name;
}
