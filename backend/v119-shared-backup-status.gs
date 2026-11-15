/* PORT79 V119: read-only last backup time, shared across authenticated computers.
 * Dispatch GET historyBackupStatus to p79AllBackupStatus_(params) in live GAS.
 */
function p79AllBackupStatus_(params){
  params=params||{};
  p79HistoryBackupSession_(getSpreadsheet_(true),params.gcToken||params.token||'');
  var props=PropertiesService.getScriptProperties();
  var root=DriveApp.getFolderById('1vFKG6qgcI33eJFwOXgxLiYKe90PxVvPa');
  var groups=p79AllBackupGroups_().map(function(group){
    var item={type:group.type,label:group.label,verified:false,backupAt:'',backupUrl:'',backupId:'',rows:0,checked:true};
    var receipt;
    try{receipt=JSON.parse(props.getProperty('P79_ALL_BACKUP_LAST_'+group.type)||'null');}
    catch(error){item.message='雲端備份紀錄無法解析';return item;}
    if(!receipt||receipt.verified!==true||receipt.ok!==true||receipt.type!==group.type||!receipt.backupId||!receipt.backupAt)return item;
    try{
      var folder=null;
      if(group.folder)folder=DriveApp.getFolderById(group.folder);
      else if(group.folderName){
        var candidates=root.getFoldersByName(group.folderName);
        if(!candidates.hasNext())return item;
        folder=candidates.next();
        if(candidates.hasNext())return item;
      }
      if(!folder)return item;
      var file=DriveApp.getFileById(receipt.backupId);
      if(file.isTrashed())return item;
      var parents=file.getParents(),inFolder=false;
      while(parents.hasNext())if(parents.next().getId()===folder.getId())inFolder=true;
      if(!inFolder)return item;
      var parent=folder.getParents(),inRoot=false;
      while(parent.hasNext())if(parent.next().getId()===root.getId())inRoot=true;
      if(!inRoot)return item;
      var at=String(receipt.backupAt);
      if(!/^\d{8}-\d{6}$/.test(at)&&!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(at))return item;
      item.verified=true;item.backupAt=at;item.backupId=file.getId();item.backupUrl=file.getUrl();
      item.rows=Math.max(0,Number(receipt.rows)||0);item.unchanged=!!receipt.unchanged;
    }catch(error){item.message='備份檔案暫時無法核對';}
    return item;
  });
  var verified=groups.filter(function(group){return group.verified;});
  var times=verified.map(function(group){return group.backupAt;}).sort();
  return {ok:true,sharedStatusVersion:1,timezone:'Asia/Taipei',checkedAt:new Date().toISOString(),groups:groups,verifiedCount:verified.length,total:groups.length,lastBackupAt:times.length?times[times.length-1]:''};
}
