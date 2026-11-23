/* Authenticated, incremental XLSX export of every referenced immutable snapshot.
 * Original snapshots and existing history folders are never overwritten or moved.
 */
function p79ExcelHash_(bytes){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function p79ExcelStamp_(){return Utilities.formatDate(new Date(),'Asia/Taipei','yyyyMMdd-HHmmss');}
function p79ExcelPrivate_(file){
  if(file.isTrashed()||file.getSharingAccess()!==DriveApp.Access.PRIVATE||file.getEditors().length||file.getViewers().length)throw Error('Excel備份存取設定不是私人，已停止讀取');
  return file;
}
function p79ExcelRoot_(){
  var props=PropertiesService.getScriptProperties(),id=props.getProperty('P79_EXCEL_ROOT');
  if(id)return p79ExcelPrivate_(DriveApp.getFolderById(id));
  var lock=LockService.getUserLock();if(!lock.tryLock(5000))throw Error('備份資料夾正在準備，請稍後重試');
  try{
    id=props.getProperty('P79_EXCEL_ROOT');if(id)return p79ExcelPrivate_(DriveApp.getFolderById(id));
    var folder=DriveApp.createFolder('79號碼頭全系統備份');folder.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
    props.setProperty('P79_EXCEL_ROOT',folder.getId());return p79ExcelPrivate_(folder);
  }finally{lock.releaseLock();}
}
function p79ExcelPeriod_(){return Utilities.formatDate(new Date(),'Asia/Taipei','yyyyMM');}
function p79ExcelFolder_(label){
  if(!/^[\u3400-\u9fff]+$/.test(label))throw Error('備份資料夾必須使用中文名稱');
  var root=p79ExcelRoot_(),lock=LockService.getUserLock();if(!lock.tryLock(5000))throw Error('備份資料夾正在準備，請稍後重試');
  try{
    function child(parent,name){var list=parent.getFoldersByName(name),found=list.hasNext()?list.next():null;if(list.hasNext())throw Error('備份資料夾重名，請先核對');return found?p79ExcelPrivate_(found):p79ExcelPrivate_(parent.createFolder(name));}
    var period=p79ExcelPeriod_(),year=child(root,period.slice(0,4)+'年'),props=PropertiesService.getScriptProperties(),key='P79_EXCEL_YEAR_READY_'+year.getId();
    if(props.getProperty(key)!=='1'){for(var m=1;m<=12;m++)child(year,('0'+m).slice(-2)+'月');props.setProperty(key,'1');}
    return child(child(year,period.slice(4)+'月'),label);
  }finally{lock.releaseLock();}
}
function p79PrepareYearlyBackupFolders(){
  var folder=p79ExcelFolder_('電腦端資料');
  Logger.log(JSON.stringify({ok:true,period:p79ExcelPeriod_(),folder:folder.getName(),url:folder.getUrl(),months:12,private:true}));
}
function p79ExcelContext_(data){
  var group=p79AllBackupGroups_().filter(function(g){return g.type===data.type;})[0];
  if(!group)throw Error('不支援的Excel分類');
  var saved=JSON.parse(PropertiesService.getScriptProperties().getProperty('P79_ALL_BACKUP_LAST_'+group.type)||'null');
  if(!saved||saved.ok!==true||saved.verified!==true||saved.sourceUnchanged!==true||saved.backupId!==data.backupId)throw Error('未取得相同版本的完整雲端備份確認，未匯出Excel');
  var folder=p79AllBackupFolder_(group);
  if(!p79AllBackupReceiptValid_(saved,folder))throw Error('來源備份已不存在');
  var refs=p79AllBackupReadRefs_(saved),ids=[saved.backupId];
  Object.keys(refs).sort().forEach(function(k){var id=refs[k].backupId;if(!id||!p79AllBackupReceiptValid_({verified:true,backupId:id},folder))throw Error('歷史來源備份無法核對');if(ids.indexOf(id)<0)ids.push(id);});
  return {group:group,saved:saved,ids:ids};
}
function p79ExcelExisting_(sourceId){
  var props=PropertiesService.getScriptProperties(),meta=JSON.parse(props.getProperty('P79_EXCEL_SOURCE_'+sourceId+'_'+p79ExcelPeriod_())||'null');
  if(!meta)return null;
  try{
    var source=DriveApp.getFileById(sourceId);
    if(source.isTrashed()||String(source.getLastUpdated().getTime())!==String(meta.sourceUpdated))return null;
    var file=p79ExcelPrivate_(DriveApp.getFileById(meta.fileId)),bytes=file.getBlob().getBytes();
    if(p79ExcelHash_(bytes)!==meta.hash)return null;
    return {meta:meta,file:file,bytes:bytes};
  }catch(_){return null;}
}
function p79ExcelExportSource_(context,index){
  var id=context.ids[index],cached=p79ExcelExisting_(id);if(cached)return cached;
  var props=PropertiesService.getScriptProperties(),key='P79_EXCEL_BUSY_'+id,lock=LockService.getUserLock(),owner=Utilities.getUuid();
  if(!lock.tryLock(5000))throw Error('Excel備份正在準備，請稍後重試');
  try{
    var prior=JSON.parse(props.getProperty(key)||'null');
    if(prior&&Date.now()-prior.at<8*60*1000)throw Error('此Excel正在產生，請稍後重試');
    props.setProperty(key,JSON.stringify({owner:owner,at:Date.now()}));
  }finally{lock.releaseLock();}
  try{return p79ExcelExportSourceCore_(context,index);}
  finally{var current=JSON.parse(props.getProperty(key)||'null');if(current&&current.owner===owner)props.deleteProperty(key);}
}
function p79ExcelExportSourceCore_(context,index){
  var id=context.ids[index],existing=p79ExcelExisting_(id);
  if(existing)return existing;
  var source=DriveApp.getFileById(id),before=source.getLastUpdated().getTime();
  var response=UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/'+encodeURIComponent(id)+'/export?format=xlsx',{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw Error('Google Excel匯出未完成（HTTP '+response.getResponseCode()+'），原備份保留');
  var bytes=response.getBlob().getBytes();
  if(bytes.length<4||(bytes[0]&255)!==80||(bytes[1]&255)!==75)throw Error('雲端未回傳有效Excel檔案');
  if(bytes.length>20*1024*1024)throw Error('單一Excel超過20MB，未標記電腦端完成');
  if(source.getLastUpdated().getTime()!==before)throw Error('來源備份在匯出期間被修改，請重新核對');
  var name=context.group.label+'_歷史資料_'+p79ExcelStamp_()+'_第'+(index+1)+'份.xlsx';
  var file=p79ExcelFolder_(context.group.label).createFile(Utilities.newBlob(bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',name));
  var hash=p79ExcelHash_(bytes);if(p79ExcelHash_(file.getBlob().getBytes())!==hash)throw Error('雲端Excel寫入後讀回不符');
  var meta={fileId:file.getId(),hash:hash,name:name,sourceUpdated:String(before),at:new Date().toISOString()};
  PropertiesService.getScriptProperties().setProperty('P79_EXCEL_SOURCE_'+id+'_'+p79ExcelPeriod_(),JSON.stringify(meta));
  return {meta:meta,file:file,bytes:bytes};
}
function p79BackupReadableExcel_(data){
  data=data||{};
  // Never list sources, export files, or accept local data before server authorization.
  p79HistoryBackupSession_(getSpreadsheet_(true),data.gcToken||data.token||'');
  if(data.phase==='local')return p79BackupLocalExcel_(data);
  var context=p79ExcelContext_(data);
  if(data.phase==='list')return {ok:true,excelBackupVersion:1,type:context.group.type,total:context.ids.length,backupId:context.saved.backupId};
  if(data.phase==='complete'){
    context.ids.forEach(function(id){if(!p79ExcelExisting_(id))throw Error('仍有Excel檔未完成或已變更，未標記成功');});
    var receipt={ok:true,verified:true,type:context.group.type,backupId:context.saved.backupId,files:context.ids.length,fileId:p79ExcelExisting_(context.saved.backupId).meta.fileId,backupAt:new Date().toISOString()};
    PropertiesService.getScriptProperties().setProperty('P79_EXCEL_LAST_'+context.group.type,JSON.stringify(receipt));return receipt;
  }
  var index=Number(data.index);if(!Number.isInteger(index)||index<0||index>=context.ids.length)throw Error('Excel序號不正確');
  var result=p79ExcelExportSource_(context,index);
  return {ok:true,verified:true,type:context.group.type,backupId:context.saved.backupId,index:index,total:context.ids.length,file:{name:result.meta.name,hash:result.meta.hash,cloudId:result.meta.fileId,base64:Utilities.base64Encode(result.bytes)}};
}
function p79BackupLocalExcel_(data){
  var encoded=data.base64,partIndex=data.partIndex===undefined?0:Number(data.partIndex),partTotal=data.partTotal===undefined?1:Number(data.partTotal);
  if(!Number.isInteger(partIndex)||!Number.isInteger(partTotal)||partTotal<1||partTotal>128||partIndex<0||partIndex>=partTotal)throw Error('電腦端Excel分冊編號無效');
  if(typeof encoded!=='string'||encoded.length>17*1024*1024)throw Error('電腦端Excel大小無效');
  var bytes=Utilities.base64Decode(encoded),hash=p79ExcelHash_(bytes);
  if(bytes.length<4||bytes.length>12*1024*1024||(bytes[0]&255)!==80||(bytes[1]&255)!==75||hash!==data.hash)throw Error('電腦端Excel格式或校驗無效');
  var props=PropertiesService.getScriptProperties(),key='P79_LOCAL_EXCEL_'+hash+'_'+p79ExcelPeriod_(),prior=JSON.parse(props.getProperty(key)||'null');
  if(prior){try{var old=p79ExcelPrivate_(DriveApp.getFileById(prior.fileId));if(p79ExcelHash_(old.getBlob().getBytes())===hash)return {ok:true,verified:true,hash:hash,backupAt:prior.backupAt,unchanged:true};}catch(_){} }
  var suffix=partTotal>1?'_第'+(partIndex+1)+'份_共'+partTotal+'份':'';
  var name='本機資料_'+p79ExcelStamp_()+suffix+'.xlsx',file=p79ExcelFolder_('電腦端資料').createFile(Utilities.newBlob(bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',name));
  if(p79ExcelHash_(file.getBlob().getBytes())!==hash)throw Error('電腦端Excel雲端讀回校驗不符');
  var result={ok:true,verified:true,fileId:file.getId(),hash:hash,backupAt:new Date().toISOString()};props.setProperty(key,JSON.stringify(result));return result;
}
// Editor-only export verification. No session is created and no domain data is changed.
function p79ProbeReadableExcelBackup(){
  var saved=JSON.parse(PropertiesService.getScriptProperties().getProperty('P79_ALL_BACKUP_LAST_gate')||'null');
  if(!saved)throw Error('尚無進出站已核對備份供測試');
  var context=p79ExcelContext_({type:'gate',backupId:saved.backupId}),result=p79ExcelExportSource_(context,0);
  var entries=Utilities.unzip(Utilities.newBlob(result.bytes,'application/zip','probe.zip'));
  var workbook=entries.filter(function(b){return b.getName()==='xl/workbook.xml';})[0];
  if(!workbook)throw Error('匯出檔不包含Excel活頁簿');
  var sheetCount=(workbook.getDataAsString('UTF-8').match(/<sheet\b/g)||[]).length;
  var expected=SpreadsheetApp.openById(context.ids[0]).getSheets().length;
  if(sheetCount!==expected)throw Error('Excel工作表數量不符');
  p79ExcelPrivate_(result.file);
  Logger.log(JSON.stringify({ok:true,xlsxBytes:result.bytes.length,worksheets:sheetCount,hashVerified:p79ExcelHash_(result.file.getBlob().getBytes())===result.meta.hash,private:true,folder:p79ExcelFolder_(context.group.label).getName(),sourceSnapshots:context.ids.length}));
}
