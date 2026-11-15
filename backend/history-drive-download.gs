/* Read-only discovery of the authenticated Excel backup year/month folder.
 * GET historyBackupDriveFolder => p79HistoryBackupDriveFolder_(params), jsonOutput result.
 * Deployed in production Apps Script V121, 2026-11-16. */
function p79HistoryBackupDriveFolder_(params){
  p79HistoryBackupSession_(getSpreadsheet_(true),params.gcToken||params.token||'');
  return p79HistoryBackupDriveLookup_(params);
}
function p79HistoryBackupDriveLookup_(params){
  var year=String(params.year||''),month=String(params.month||'');
  if(!/^20\d{2}$/.test(year)||(month&&!/^(0[1-9]|1[0-2])$/.test(month)))throw Error('請選擇有效的備份年份與月份');
  var result={ok:true,year:year,month:month,found:false,url:'',label:year+'年'+(month?month+'月':'全年'),basis:'backup-date'};
  var id=PropertiesService.getScriptProperties().getProperty('P79_EXCEL_ROOT');if(!id)return result;
  function child(parent,name){var folders=parent.getFoldersByName(name),folder=folders.hasNext()?folders.next():null;if(folders.hasNext())throw Error('備份資料夾重名，無法確定下載位置');return folder?p79ExcelPrivate_(folder):null;}
  var folder=child(p79ExcelPrivate_(DriveApp.getFolderById(id)),year+'年');if(!folder)return result;
  if(month)folder=child(folder,month+'月');if(!folder)return result;
  result.found=true;result.url=folder.getUrl();return result;
}
function p79ProbeHistoryBackupDriveFolder(){
  var period=p79ExcelPeriod_(),result=p79HistoryBackupDriveLookup_({year:period.slice(0,4),month:period.slice(4)});
  if(!result.found)throw Error('本月備份資料夾不存在');Logger.log(JSON.stringify(result));
}
