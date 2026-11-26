'use strict';
const fs=require('node:fs'),path=require('node:path');
function apply(source,helper=fs.readFileSync(path.join(__dirname,'../backend/attendance-identical-edit-v1.gs'),'utf8')){
 if(source.includes('function p79RepairIdenticalAttendanceEditV1_('))throw Error('already installed; inspect deployed source');
 for(const name of ['port79DoPostCore_','editRecord_','p79PrepareSafeAttendanceEdit_','gcRequireSystemPermission_','getAttendanceSheetForRecord_','extractRecordFromLegacyRow_','p79GuardEventMillis_'])if(!source.includes('function '+name+'('))throw Error('Missing current GAS prerequisite '+name);
 const start=source.indexOf('function port79DoPostCore_('),end=source.indexOf('\nfunction ',start+10);
 if(end<0)throw Error('router boundary missing');
 const router=source.slice(start,end);
 const old="      case 'editRecord':\n      case 'updateRecord':\n        return jsonOutput(editRecord_(ss, data));";
 if(router.split(old).length!==2||!router.includes('LockService.getScriptLock()'))throw Error('router or lock changed; inspect current deployment before applying');
 const next=router.replace(old,"      case 'p79RepairIdenticalAttendanceEditV1':\n        return jsonOutput(p79RepairIdenticalAttendanceEditV1_(ss, data));\n"+old);
 const ping="        scheduleSaveReceiptVersion: 1,";
 if(next.split(ping).length!==2)throw Error('pingPost capability anchor changed; inspect deployed source');
 const advertised=next.replace(ping,ping+"\n        attendanceIdenticalEditVersion: 1,");
 return source.slice(0,start)+advertised+source.slice(end)+'\n'+helper+'\n';
}
module.exports={apply};
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output||input===output)throw Error('Provide separate current GAS input and patched output');fs.writeFileSync(output,apply(fs.readFileSync(input,'utf8')));}
