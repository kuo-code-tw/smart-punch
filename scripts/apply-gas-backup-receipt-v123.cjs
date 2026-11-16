'use strict';
const fs=require('node:fs');
function apply(source){
 function change(name,edit){const start=source.indexOf('function '+name+'(');if(start<0)throw Error('Missing '+name);const end=source.indexOf('\nfunction ',start+10),tail=end<0?source.length:end;source=source.slice(0,start)+edit(source.slice(start,tail))+source.slice(tail);}
 function once(s,a,b){if(s.split(a).length!==2)throw Error('Unexpected backup source fragment: '+a.slice(0,60));return s.replace(a,b);}
 if(source.includes('function p79AllBackupGroupCore_('))change('p79AllBackupGroupCore_',s=>{
 s=once(s,'lock=LockService.getScriptLock(),saved;','lock=p79BackupControlLockV123_(),saved;');
 s=once(s,"    if(!lock.tryLock(30000))throw Error('備份檔已寫入但完成紀錄尚未取得，請稍後重試');", "    // Publish only after all data and version-index readback checks have passed.\n    // This exact-request receipt survives contention on the mutable LAST pointer.\n    props.setProperty('P79_ALL_BACKUP_VERIFIED_'+group.type,JSON.stringify(stored));\n    if(!lock.tryLock(30000))throw Error('備份檔已寫入但完成紀錄尚未取得，請稍後重試');");return s+"\nfunction p79BackupControlLockV123_(){\n  // Vessel backups already own this lane: never release their outer lock.\n  if(typeof p79VesselWriteLockV122_!==\"undefined\"&&p79VesselWriteLockV122_)return {tryLock:function(){return true;},releaseLock:function(){}};\n  return LockService.getUserLock();\n}\n";});
 if(source.includes('function p79HistoryBackupReceiptRead_('))change('p79HistoryBackupReceiptRead_',s=>once(s,"var claim=JSON.parse(props.getProperty('P79_ALL_BACKUP_BUSY_'+type)||'null');", "var staged=JSON.parse(props.getProperty('P79_ALL_BACKUP_VERIFIED_'+type)||'null');\n  if(staged&&staged.requestId===id&&staged.type===type&&staged.ok===true&&staged.verified===true&&staged.sourceUnchanged===true&&staged.backupId){\n    if(DriveApp.getFileById(staged.backupId).isTrashed())throw Error('已核對的備份檔已移至垃圾桶，請重新備份');\n    return {ok:true,state:'complete',receipt:staged};\n  }\n  var claim=JSON.parse(props.getProperty('P79_ALL_BACKUP_BUSY_'+type)||'null');"));
 if(source.includes('function p79ExcelContext_('))change('p79ExcelContext_',s=>once(s,"  if(!saved||saved.ok!==true", "  if(!saved||saved.backupId!==data.backupId){var staged=JSON.parse(PropertiesService.getScriptProperties().getProperty('P79_ALL_BACKUP_VERIFIED_'+group.type)||'null');if(staged&&staged.backupId===data.backupId)saved=staged;}\n  if(!saved||saved.ok!==true"));
 return source;
}
module.exports={apply};if(require.main===module)fs.writeFileSync(process.argv[3],apply(fs.readFileSync(process.argv[2],'utf8')));
