/* V123: backup metadata lane and verified exact-request receipt recovery. */
function p79AllBackupGroupCore_(ss,session,data){
  if(!/^[A-Za-z0-9_-]{12,100}$/.test(String(data.requestId||'')))throw Error('備份請求編號不正確');
  if(data.type==='yardFile')return p79AllBackupOriginal_(data,session);
  var group=p79AllBackupGroups_().filter(function(g){return g.type===data.type;})[0];if(!group)throw Error('不支援的系統備份分類');var folder=p79AllBackupFolder_(group),tables=p79AllBackupSource_(ss,group,data),hash=p79AllBackupHash_(tables),props=PropertiesService.getScriptProperties(),key='P79_ALL_BACKUP_LAST_'+group.type,claim='P79_ALL_BACKUP_BUSY_'+group.type,lock=p79BackupControlLockV123_(),saved;
  saved=JSON.parse(props.getProperty(key)||'null');var priorRefs={};try{if(p79AllBackupReceiptValid_(saved,folder))priorRefs=p79AllBackupReadRefs_(saved);}catch(ignore){}var validated={};function validRef(id){if(validated[id]===undefined)validated[id]=p79AllBackupReceiptValid_({verified:true,backupId:id},folder);return validated[id];}
  var priorComplete=Object.keys(priorRefs).length===tables.length&&tables.every(function(t){var r=priorRefs[t.book+'|'+t.name];return r&&r.hash===p79AllBackupHash_(t.values)&&validRef(r.backupId);});
  // Immutable verified snapshots can be reused without claiming a write lock.
  if(saved&&saved.hash===hash&&priorComplete)return Object.assign({},saved,{requestId:data.requestId,unchanged:true});
  if(!lock.tryLock(10000))throw Error('其他資料正在儲存，請重試此分類');
  try{var latest=JSON.parse(props.getProperty(key)||'null');if(latest&&saved&&latest.backupId!==saved.backupId)throw Error('另一筆備份剛完成，請重試以讀取最新版本');if(saved&&saved.hash===hash&&priorComplete)return Object.assign({},saved,{requestId:data.requestId,unchanged:true});var busy=JSON.parse(props.getProperty(claim)||'null');if(busy&&Date.now()-busy.at<7*60*1000)throw Error('此分類的備份仍在處理，稍後重試會沿用已核對結果');props.setProperty(claim,JSON.stringify({requestId:data.requestId,at:Date.now()}));}finally{lock.releaseLock();}
  try{
    var at=Utilities.formatDate(new Date(),'Asia/Taipei','yyyyMMdd-HHmmss'),title='79號碼頭_'+group.label+'_歷史備份_'+at+'_'+hash.slice(0,8),refs={},changed=[];
    tables.forEach(function(t){var k=t.book+'|'+t.name,h=p79AllBackupHash_(t.values),prior=priorRefs[k];if(prior&&prior.hash===h&&validRef(prior.backupId))refs[k]=prior;else{changed.push(t);refs[k]={hash:h,backupId:''};}});
    var file=SpreadsheetApp.create('未完成_'+title);DriveApp.getFileById(file.getId()).moveTo(folder);p79AllBackupBuild_(file,changed,group,at);
    var index=[['來源資料庫','工作表','本次處理','資料筆數','歷史備份連結']];tables.forEach(function(t){var k=t.book+'|'+t.name,isNew=!refs[k].backupId;if(isNew)refs[k].backupId=file.getId();index.push([t.sourceName||t.book,t.name,isNew?'新增或異動，已備份':'未異動，沿用已核對備份',String(Math.max(0,t.values.length-1)),'https://docs.google.com/spreadsheets/d/'+refs[k].backupId+'/edit']);});var directory=file.insertSheet('完整資料索引');p79AllBackupWrite_(directory,index);directory.setFrozenRows(1);directory.setColumnWidths(1,5,200);directory.getRange(1,1,1,5).setBackground('#24466b').setFontColor('#ffffff').setFontWeight('bold');file.setActiveSheet(directory);file.moveActiveSheet(1);SpreadsheetApp.flush();file.setName(title);
    var receipt={ok:true,verified:true,action:'historyBackupMonth',type:group.type,requestId:data.requestId,hash:hash,backupAt:at,backupId:file.getId(),backupUrl:file.getUrl(),rows:tables.reduce(function(n,t){return n+Math.max(0,t.values.length-1);},0),tables:tables.length,changedTables:changed.length,reusedTables:tables.length-changed.length,sourceUnchanged:true};if(group.type==='yard')receipt.browserYardRows=data.yard&&Array.isArray(data.yard.rows)?data.yard.rows.length:0;
    var versionIndex=file.insertSheet('來源版本索引');p79AllBackupWrite_(versionIndex,[['來源識別','內容校驗','歷史檔案']].concat(Object.keys(refs).sort().map(function(k){return [k,refs[k].hash,refs[k].backupId];})));versionIndex.hideSheet();var stored=receipt;
    // Publish only after all data and version-index readback checks have passed.
    // This exact-request receipt survives contention on the mutable LAST pointer.
    props.setProperty('P79_ALL_BACKUP_VERIFIED_'+group.type,JSON.stringify(stored));
    if(!lock.tryLock(30000))throw Error('備份檔已寫入但完成紀錄尚未取得，請稍後重試');try{props.setProperty(key,JSON.stringify(stored));props.deleteProperty(claim);}finally{lock.releaseLock();}return receipt;
  }catch(error){props.deleteProperty(claim);throw error;}
}

// Same cache/revision checks as userRequireTokenCore_. No new sessions or roles.
// A cache miss or changed employee permissions still uses the original locked path.
function p79BackupControlLockV123_(){
  // Vessel backups already own this lane: never release their outer lock.
  if(typeof p79VesselWriteLockV122_!=="undefined"&&p79VesselWriteLockV122_)return {tryLock:function(){return true;},releaseLock:function(){}};
  return LockService.getUserLock();
}

function p79ExcelContext_(data){
  var group=p79AllBackupGroups_().filter(function(g){return g.type===data.type;})[0];
  if(!group)throw Error('不支援的Excel分類');
  var saved=JSON.parse(PropertiesService.getScriptProperties().getProperty('P79_ALL_BACKUP_LAST_'+group.type)||'null');
  if(!saved||saved.backupId!==data.backupId){var staged=JSON.parse(PropertiesService.getScriptProperties().getProperty('P79_ALL_BACKUP_VERIFIED_'+group.type)||'null');if(staged&&staged.backupId===data.backupId)saved=staged;}
  if(!saved||saved.ok!==true||saved.verified!==true||saved.sourceUnchanged!==true||saved.backupId!==data.backupId)throw Error('未取得相同版本的完整雲端備份確認，未匯出Excel');
  var folder=p79AllBackupFolder_(group);
  if(!p79AllBackupReceiptValid_(saved,folder))throw Error('來源備份已不存在');
  var refs=p79AllBackupReadRefs_(saved),ids=[saved.backupId];
  Object.keys(refs).sort().forEach(function(k){var id=refs[k].backupId;if(!id||!p79AllBackupReceiptValid_({verified:true,backupId:id},folder))throw Error('歷史來源備份無法核對');if(ids.indexOf(id)<0)ids.push(id);});
  return {group:group,saved:saved,ids:ids};
}
function p79HistoryBackupReceiptRead_(params) {
 var type=p79BackupReceiptType_(params.type),id=p79BackupReceiptId_(params.requestId);
 var props=PropertiesService.getScriptProperties(),ack=JSON.parse(props.getProperty('P79_ALL_BACKUP_ACK_'+type)||'null');
 var receipt=ack&&ack.requestId===id&&ack.state==='complete'?ack.receipt:null;
 if(!receipt&&type!=='yardFile') {
  var saved=JSON.parse(props.getProperty('P79_ALL_BACKUP_LAST_'+type)||'null');
  if(saved&&saved.requestId===id)receipt=saved;
 }
 if(receipt&&receipt.ok===true&&receipt.verified===true&&receipt.sourceUnchanged===true&&receipt.type===type&&receipt.requestId===id&&receipt.backupId) {
  var file=DriveApp.getFileById(receipt.backupId);
  if(file.isTrashed())throw Error('已核對的備份檔已移至垃圾桶，請重新備份');
  return {ok:true,state:'complete',receipt:receipt};
 }
 var staged=JSON.parse(props.getProperty('P79_ALL_BACKUP_VERIFIED_'+type)||'null');
  if(staged&&staged.requestId===id&&staged.type===type&&staged.ok===true&&staged.verified===true&&staged.sourceUnchanged===true&&staged.backupId){
    if(DriveApp.getFileById(staged.backupId).isTrashed())throw Error('已核對的備份檔已移至垃圾桶，請重新備份');
    return {ok:true,state:'complete',receipt:staged};
  }
  var claim=JSON.parse(props.getProperty('P79_ALL_BACKUP_BUSY_'+type)||'null');
 if(claim&&claim.requestId===id&&Date.now()-claim.at<7*60*1000)return {ok:true,state:'running'};
 if(ack&&ack.requestId===id&&ack.state==='failed')return {ok:true,state:'failed',error:ack.error};
 return {ok:true,state:'pending'};
}
