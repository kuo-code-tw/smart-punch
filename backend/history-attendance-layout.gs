/* Human-readable attendance backup view. The separately verified JSON snapshot
 * remains unchanged; only this display copy is enriched from employee records. */
function p79HistoryBackupAttendanceView_(file,source,ss){
  const seen=new Set(),records=[];
  source.rows.forEach(function(entry,index){
    const row=JSON.parse(entry[2]),key=row.id?'id:'+String(row.id):'row:'+index;
    if(!seen.has(key)){seen.add(key);records.push(row);}
  });
  const time=function(row){
    const raw=String(row.timeStr||row.datetime||row.dateTime||row.timestamp||row.time||''),m=raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[ T](\d{1,2}):(\d{2})/);
    return m?m[1]+'/'+m[2].padStart(2,'0')+'/'+m[3].padStart(2,'0')+' '+m[4].padStart(2,'0')+':'+m[5]:raw;
  };
  const rows=p79EnrichAttendanceIdentities_(ss,records).sort(function(a,b){return time(b).localeCompare(time(a));});
  const values=[['考勤號','工號','姓名','部門','職稱','考勤時間','出勤狀態','地點','備註']].concat(rows.map(function(r){
    return [r.attNo||'',r.empId||r.employeeId||'',r.name||r.employeeName||'',r.dept||r.department||'',r.jobTitle||r.deptDetail||r.role||'',time(r),r.status||r.type||r.action||'',r.location||r.place||r.address||'',r.note||r.remark||''].map(String);
  }));
  const view=file.insertSheet('考勤資料');
  if(view.getMaxRows()<values.length)view.insertRowsAfter(view.getMaxRows(),values.length-view.getMaxRows());
  const range=view.getRange(1,1,values.length,9);range.setNumberFormat('@').setValues(values);
  SpreadsheetApp.flush();
  if(JSON.stringify(range.getValues().map(function(r){return r.map(String);}))!==JSON.stringify(values))throw Error('考勤版面讀回核對失敗，未標記備份完成');
  view.getRange(1,1,1,9).setBackground('#dbeafe').setFontWeight('bold');
  range.setVerticalAlignment('middle');view.setFrozenRows(1);view.setFrozenColumns(2);
  [90,130,100,150,85,175,110,260,260].forEach(function(width,i){view.setColumnWidth(i+1,width);});
  view.setRowHeights(1,values.length,23);file.setActiveSheet(view);file.moveActiveSheet(1);
}
