'use strict';
const fs=require('node:fs');
function apply(source){
 const start=source.indexOf('function p79AllBackupGroup_(data){');
 if(start<0)throw Error('Missing all-system backup function');
 const end=source.indexOf('\nfunction ',start+10),tail=end<0?source.length:end;
 let part=source.slice(start,tail);
 const once=(before,after)=>{if(part.split(before).length!==2)throw Error('Expected one backup lock fragment');part=part.replace(before,after);};
 once("  var ss=getSpreadsheet_(true),session=p79HistoryBackupSession_(ss,data.gcToken||data.token||'');if(!", "  var ss=getSpreadsheet_(true),session=p79HistoryBackupSession_(ss,data.gcToken||data.token||'');\n  return p79AllBackupGroupCore_(ss,session,data);\n}\nfunction p79AllBackupGroupCore_(ss,session,data){\n  if(!");
 once("  if(!lock.tryLock(1000))throw Error('其他資料正在儲存，請重試此分類');", "  // Immutable verified snapshots can be reused without claiming a write lock.\n  if(saved&&saved.hash===hash&&priorComplete)return Object.assign({},saved,{requestId:data.requestId,unchanged:true});\n  if(!lock.tryLock(10000))throw Error('其他資料正在儲存，請重試此分類');");
 once("if(!lock.tryLock(1000))throw Error('備份檔已寫入但完成紀錄尚未取得，請稍後重試');", "if(!lock.tryLock(30000))throw Error('備份檔已寫入但完成紀錄尚未取得，請稍後重試');");
 return source.slice(0,start)+part+source.slice(tail);
}
module.exports={apply};
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node apply-gas-backup-lock-wait.cjs INPUT OUTPUT');fs.writeFileSync(output,apply(fs.readFileSync(input,'utf8')));}
