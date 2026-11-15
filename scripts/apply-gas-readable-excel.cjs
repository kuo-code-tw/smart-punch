'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
function apply(source){
 if(source.includes('function p79BackupReadableExcel_('))throw Error('Readable Excel backup already installed');
 const once=(a,b)=>{if(source.split(a).length!==2)throw Error('Unexpected live backup anchor: '+a);source=source.replace(a,b);};
 once("  if(action==='historyBackupCapabilities')", "  if(action==='historyBackupStatus'){try{return jsonOutput(p79AllBackupStatus_(params));}catch(error){return jsonOutput({ok:false,error:String(error.message||error)});}}\n  if(action==='historyBackupCapabilities')");
 once("  if(action==='historyBackupMonth')", "  if(action==='historyBackupExcel'){try{return jsonOutput(p79BackupReadableExcel_(parsedData));}catch(error){return jsonOutput({ok:false,error:String(error.message||error)});}}\n  if(action==='historyBackupMonth')");
 once('function p79AllBackupCapabilities_(){return {allSystemsBackupVersion:1,','function p79AllBackupCapabilities_(){return {allSystemsBackupVersion:1,excelBackupVersion:1,');
 for(const file of ['backup-readable-excel.gs','v119-shared-backup-status.gs'])source+='\n'+fs.readFileSync(path.join(__dirname,'../backend',file),'utf8');
 new vm.Script(source);return source;
}
module.exports={apply};
