function p79BackupVerifyV123() {
 if(Session.getEffectiveUser().getEmail()!=='companytest.tw@gmail.com')throw Error('Only the project owner can run this editor check');
 var ss=getSpreadsheet_(true),done=0;
 ['audit','gate','routes','yard'].forEach(function(type){
  var data={type:type,requestId:'OWNER-CHECK-'+Utilities.getUuid()};
  var r;for(var attempt=0;attempt<8;attempt++){try{r=p79AllBackupGroupCore_(ss,{empId:'EDITOR_OWNER'},data);break;}catch(e){if(String(e.message)!=='其他資料正在儲存，請重試此分類'||attempt===7)throw e;console.log(type+' waiting for main-data lock; retry '+(attempt+1));Utilities.sleep(Math.min(15000,3000*(attempt+1)));}}
  if(r.verified!==true||r.sourceUnchanged!==true||r.requestId!==data.requestId||r.type!==type||DriveApp.getFileById(r.backupId).isTrashed())throw Error('Backup check failed '+type);
  done++;console.log(JSON.stringify({type:type,verified:r.verified,unchanged:r.unchanged===true,rows:r.rows,backupId:r.backupId}));
 });
 console.log('VERIFIED '+done+'/4 affected categories with source readback and actual backup files');
}
