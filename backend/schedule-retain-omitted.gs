// Monthly synchronization is not an employee/history deletion operation.
// Call inside syncSchedules_'s existing ScriptLock using freshly read rows.
function p79ScheduleRetainOmittedRows_(before,incoming){
 var rows=p79OtHistoryCopy_(incoming),seen={};
 rows.forEach(function(row){seen[normalizeEmpId_(row.empId)]=true;});
 (before||[]).forEach(function(row){
  var id=normalizeEmpId_(row.empId);
  if(!id)throw Error('既有排班含無工號資料，已停止儲存，請先核對雲端');
  if(!seen[id]){rows.push(p79OtHistoryCopy_(row));seen[id]=true;}
 });
 return rows;
}
