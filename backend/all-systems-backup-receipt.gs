/* V115: recover a lost HTTP response from an authenticated, exact-request receipt.
 * The original backup implementation and its readback checks remain authoritative.
 * One bounded receipt slot per category; no token or business rows are stored here.
 */
function p79HistoryBackupCapabilitiesWithReceipt_(params) {
  return Object.assign({},p79HistoryBackupCapabilities_(params),{backupReceiptLookupVersion:1});
}
function p79BackupReceiptType_(value) {
  var type=String(value||'');
  if(type!=='yardFile'&&!p79AllBackupGroups_().some(function(g){return g.type===type;}))throw Error('不支援的系統備份分類');
  return type;
}
function p79BackupReceiptId_(value) {
  var id=String(value||'');
  if(!/^[A-Za-z0-9_-]{12,100}$/.test(id))throw Error('備份請求編號不正確');
  return id;
}
function p79HistoryBackupRequest_(data) {
  if(!data||data.backupMode!=='all-systems-v1')return p79HistoryBackupMonth_(data);
  // Authenticate before any receipt read or write, including recorded failures.
  p79HistoryBackupSession_(getSpreadsheet_(true),data.gcToken||data.token||'');
  var type=p79BackupReceiptType_(data.type),id=p79BackupReceiptId_(data.requestId);
  var props=PropertiesService.getScriptProperties(),key='P79_ALL_BACKUP_ACK_'+type;
  try {
    var result=p79HistoryBackupMonth_(data);
    if(result.ok!==true||result.verified!==true||result.sourceUnchanged!==true||result.type!==type||result.requestId!==id||!result.backupId)throw Error('雲端備份回條未完整核對');
    props.setProperty(key,JSON.stringify({requestId:id,state:'complete',receipt:result}));
    return result;
  } catch(error) {
    // Busy errors do not replace an earlier success for this request.
    var prior=JSON.parse(props.getProperty(key)||'null');
    if(!prior||prior.requestId!==id||prior.state!=='complete')props.setProperty(key,JSON.stringify({requestId:id,state:'failed',error:String(error.message||error).slice(0,240)}));
    throw error;
  }
}
function p79HistoryBackupReceipt_(params) {
  p79HistoryBackupSession_(getSpreadsheet_(true),params.gcToken||params.token||'');
  return p79HistoryBackupReceiptRead_(params);
}
function p79HistoryBackupReceiptRead_(params) {
  var type=p79BackupReceiptType_(params.type),id=p79BackupReceiptId_(params.requestId);
  var props=PropertiesService.getScriptProperties(),ack=JSON.parse(props.getProperty('P79_ALL_BACKUP_ACK_'+type)||'null');
  var receipt=ack&&ack.requestId===id&&ack.state==='complete'?ack.receipt:null;
  // Also recover an in-flight V114 request completed just before this release.
  if(!receipt&&type!=='yardFile') {
    var saved=JSON.parse(props.getProperty('P79_ALL_BACKUP_LAST_'+type)||'null');
    if(saved&&saved.requestId===id)receipt=saved;
  }
  if(receipt&&receipt.ok===true&&receipt.verified===true&&receipt.sourceUnchanged===true&&receipt.type===type&&receipt.requestId===id&&receipt.backupId) {
    // Readback was already checked before issuing this immutable receipt.
    // Verify the file still exists; never turn a deleted backup green.
    var file=DriveApp.getFileById(receipt.backupId);
    if(file.isTrashed())throw Error('已核對的備份檔已移至垃圾桶，請重新備份');
    return {ok:true,state:'complete',receipt:receipt};
  }
  var claim=JSON.parse(props.getProperty('P79_ALL_BACKUP_BUSY_'+type)||'null');
  if(claim&&claim.requestId===id&&Date.now()-claim.at<7*60*1000)return {ok:true,state:'running'};
  if(ack&&ack.requestId===id&&ack.state==='failed')return {ok:true,state:'failed',error:ack.error};
  return {ok:true,state:'pending'};
}
