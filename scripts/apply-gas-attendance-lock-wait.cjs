'use strict';
const fs=require('node:fs');
// Apply only to fresh production GAS source. Do not replace the whole project.
function apply(source){
 const anchor="      lock = LockService.getScriptLock();\n      // 一般系統寫入仍維持原本快速回傳機制。\n      if (!lock.tryLock(5000)) {";
 const replacement="      lock = LockService.getScriptLock();\n      // Single attendance corrections may wait longer for the shared write lock.\n      // Never bypass the lock: other operations also modify attendance.\n      const attendanceEditLockWait = ['editRecord','updateRecord','p79RepairIdenticalAttendanceEditV1'].includes(action) ? 15000 : 5000;\n      if (!lock.tryLock(attendanceEditLockWait)) {";
 if(source.split(anchor).length!==2)throw Error('Expected unique production shared-lock anchor; stop for review');
 return source.replace(anchor,replacement);
}
module.exports={apply};
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node apply-gas-attendance-lock-wait.cjs INPUT OUTPUT');fs.writeFileSync(output,apply(fs.readFileSync(input,'utf8')));}
