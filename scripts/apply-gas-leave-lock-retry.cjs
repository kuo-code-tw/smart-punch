'use strict';
const fs=require('node:fs');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Expected exactly one fragment: '+a.slice(0,70));return s.replace(a,b);}
function apply(source){
 let s=once(source,"const API_VERSION = '2026.11.04.V95-LEAVE-OVERTIME-FAST';","const API_VERSION = '2026.11.05.V96-LEAVE-LOCK-RETRY';");
 const start=s.indexOf('function port79DoPostCore_('),end=s.indexOf('\nfunction parsePostData_',start);let router=s.slice(start,end);
 router=once(router,"  let employeeLock = null;","  let employeeLock = null;\n  let acquiredDataWriteLock = false;");
 router=once(router,"    } else {\n      lock = LockService.getScriptLock();","      acquiredDataWriteLock = true;\n    } else {\n      lock = LockService.getScriptLock();");
 router=once(router,"      // 只有取得寫入互斥鎖之後才驗證並續租排班編輯權。","      acquiredDataWriteLock = true;\n\n      // 只有取得寫入互斥鎖之後才驗證並續租排班編輯權。");
 // Only these explicit rejections happen before any domain data is written.
 router=router.replaceAll('          retryable: true,','          retryable: true,\n          rejectedBeforeWrite: true,\n          retryAfterMs: 1500,');
 const finalAt=router.indexOf('  } finally {');router=router.slice(0,finalAt)+router.slice(finalAt).replaceAll('if (action &&','if (acquiredDataWriteLock && action &&');
 s=s.slice(0,start)+router+s.slice(end);
 const addStart=s.indexOf('function addLeave_('),addEnd=s.indexOf('\nfunction syncLeaveRecords_',addStart);let add=s.slice(addStart,addEnd);
 add=once(add,"    return {\n      ok: true,\n      message: '請假紀錄已更新',\n      id: leave.id,\n      days: leave.days\n    };", "    return p79ConfirmSavedLeave_(sheet,existingRow,leave,'請假紀錄已更新');");
 add=once(add,"  return {\n    ok: true,\n    message: '請假紀錄已新增',\n    id: leave.id,\n    days: leave.days\n  };", "  return p79ConfirmSavedLeave_(sheet,sheet.getLastRow(),leave,'請假紀錄已新增');");
 const helper=`function p79ConfirmSavedLeave_(sheet,row,leave,message) {\n  const expected=leaveToRow_(leave),actual=sheet.getRange(row,1,1,LEAVE_HEADERS.length).getValues()[0]||[];\n  const textColumns=[0,2,3,4,5,9,10,11];\n  const same=textColumns.every(function(i){return normalizeText_(actual[i])===normalizeText_(expected[i]);})&&\n    [6,7].every(function(i){return p79DateOnly_(actual[i])===p79DateOnly_(expected[i]);})&&Number(actual[8])===Number(expected[8]);\n  if(!same)throw new Error('請假寫入未通過正式資料讀回確認，請保留原單號重新核對');\n  return {ok:true,id:leave.id,days:leave.days,message:message,verified:true,backendSavePipeline:'20261105-leave-lock-retry-v1'};\n}\n\n`;
 return s.slice(0,addStart)+helper+add+s.slice(addEnd);
}
module.exports={apply};
if(require.main===module){const [input,output]=process.argv.slice(2);fs.writeFileSync(output,apply(fs.readFileSync(input,'utf8')));}
