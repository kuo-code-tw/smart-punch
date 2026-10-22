/* Awaiting deployment to the existing Apps Script project.
 * Route GET historyBackupCapabilities to p79HistoryBackupCapabilities_(params).
 * Route POST historyBackupMonth to p79HistoryBackupMonth_(parsedData).
 * This creates immutable backup files in the existing history folders; it does
 * not rewrite monthly archives, move records out of main sheets, or restore data.
 */
function p79HistoryBackupSession_(ss,token) {
  const session=gcRequireSystemPermission_(ss,token,'history','manage');
  // A full database snapshot must not export another department's restricted rows.
  if(String(session.adminRole||session.role||'').toLowerCase()!=='superadmin')throw Error('完整歷史備份目前僅開放最高管理員');
  if(session.punchOnly)throw Error('打卡模式不能執行備份');
  return session;
}
function p79HistoryBackupCapabilities_(params) {
  p79HistoryBackupSession_(getSpreadsheet_(true),params.gcToken||params.token||'');
  return {ok:true,historyBackupAvailable:true,version:1,types:['attendance','schedule','vessel']};
}
function p79HistoryBackupSource_(ss,type,month) {
  const current=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM');
  const sets=[];
  if(type==='attendance'){
    const main=ss.getSheetByName(SHEET_RECORDS),archive=getAttendanceMonthlySheet_(ss,month,false),deleted=getDeletedRecordIds_(ss);
    const read=function(sheet,name){if(!sheet)return;sets.push({name:name,rows:readRecords_(sheet).filter(function(r){return attendanceMonthKeyFromRecord_(r)===month&&!deleted[normalizeId_(r.id)];})});};
    read(main,'主考勤');read(archive,'歷史考勤');
    if(!main&&!archive)throw Error('找不到可讀取的正式考勤來源');
  }else if(type==='schedule'){
    const main=ss.getSheetByName(SHEET_SCHEDULE),archive=getScheduleMonthlySheet_(month,false);
    if(main)sets.push({name:'主班表',rows:readSchedules_(main).filter(function(r){return normalizeScheduleMonth_(r.month)===month;})});
    if(archive)sets.push({name:'歷史班表',rows:readSchedules_(archive).filter(function(r){return normalizeScheduleMonth_(r.month)===month;})});
    if(!main&&!archive)throw Error('找不到可讀取的正式班表來源');
  }else if(type==='vessel'){
    if(month===current){
      const masters=ss.getSheetByName(GC_SHEET_SHIPS),records=ss.getSheetByName(GC_SHEET_RECORDS);
      if(!masters||!records)throw Error('船舶主檔或作業明細來源缺少，未備份');
      sets.push({name:'船舶主檔',rows:gcReadShipMasters_(masters).filter(function(r){return p79GcShipBelongsToMonth_(r,month);})});
      sets.push({name:'作業明細',rows:gcReadRecords_(records).filter(function(r){return gcMonthKeyFromRecord_(r)===month;})});
    }else{
      const snapshot=p79GcReadMonthSnapshotPhysical_(ss,month);
      if(!snapshot.ok||(snapshot.diagnostics||[]).length)throw Error('歷史船舶來源未完整讀取，未備份');
      sets.push({name:'船舶主檔',rows:snapshot.shipMasters},{name:'作業明細',rows:snapshot.records});
    }
  }else throw Error('不支援的備份類型');
  const rows=[];sets.forEach(function(set){if(!Array.isArray(set.rows))throw Error('備份來源不完整');set.rows.forEach(function(record,index){const text=JSON.stringify(record);if(text.length>45000)throw Error('單筆資料過長，未建立不完整備份');rows.push([set.name,String(index+1),text]);});});
  if(!rows.length)throw Error('選取月份沒有可備份資料');
  return {rows:rows,counts:sets.map(function(s){return {source:s.name,count:s.rows.length};})};
}
function p79HistoryBackupMonth_(data) {
  const ss=getSpreadsheet_(true),session=p79HistoryBackupSession_(ss,data.gcToken||data.token||''),month=String(data.month||''),type=String(data.type||''),requestId=String(data.requestId||'');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!['attendance','schedule','vessel'].includes(type)||! /^(?:[a-zA-Z0-9_-]){12,100}$/.test(requestId))throw Error('備份月份、類型或請求編號錯誤');
  const key='P79_HISTORY_BACKUP_'+String(session.empId||'ADMIN')+'_'+type+'_'+month+'_'+requestId,props=PropertiesService.getScriptProperties(),lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))throw Error('資料正在更新，請稍後再按備份');
  try{
    const saved=props.getProperty(key);if(saved)return JSON.parse(saved);
    const source=p79HistoryBackupSource_(ss,type,month),at=Utilities.formatDate(new Date(),'Asia/Taipei','yyyyMMdd-HHmmss');
    const labels={attendance:'考勤',schedule:'班表',vessel:'船舶'},name='79號碼頭_'+labels[type]+'_即時備份_'+month+'_'+at+'_'+requestId.slice(0,8);
    const file=SpreadsheetApp.create('未完成_'+name),sheet=file.getSheets()[0];sheet.setName('備份資料');
    const folder=type==='attendance'?getAttendanceDriveFolder_():type==='schedule'?getScheduleDriveFolder_():getGcDriveFolder_();
    DriveApp.getFileById(file.getId()).moveTo(folder);
    const values=[['來源','來源列序','完整資料JSON']].concat(source.rows);
    const range=sheet.getRange(1,1,values.length,3);range.setNumberFormat('@');range.setValues(values);sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
    const actual=range.getValues().map(function(r){return r.map(String);});
    if(JSON.stringify(actual)!==JSON.stringify(values))throw Error('備份讀回內容不符，未標記完成；原資料保留');
    const meta=file.insertSheet('備份資訊');meta.getRange(1,1,6,2).setNumberFormat('@').setValues([['月份',month],['類型',type],['建立時間',at],['建立人',String(session.empId||'ADMIN')],['筆數',String(source.rows.length)],['來源摘要',JSON.stringify(source.counts)]]);
    if(type==='attendance')p79HistoryBackupAttendanceView_(file,source,ss);
    if(type==='schedule')p79HistoryBackupScheduleView_(file,source,month);
    SpreadsheetApp.flush();file.setName(name);
    const receipt={ok:true,action:'historyBackupMonth',verified:true,month:month,type:type,requestId:requestId,rows:source.rows.length,counts:source.counts,backupAt:at,backupId:file.getId(),backupUrl:file.getUrl(),sourceUnchanged:true};
    props.setProperty(key,JSON.stringify(receipt));return receipt;
  }finally{lock.releaseLock();}
}
