'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const page=fs.readFileSync('attendance/index.html','utf8');
const moduleCode=fs.readFileSync('assets/port79-attendance-overtime-export.js','utf8');
assert.match(page,/data-p79-attendance-date="\$\{dateKey\}"/,'考勤每個日期必須帶有完整日期識別');
assert.match(page,/port79-attendance-overtime-export\.js/,'考勤頁必須載入右鍵匯出模組');
assert.match(page,/日期按右鍵可匯出加班明細/,'日期右鍵說明必須可見');
new vm.Script(moduleCode,{filename:'attendance-overtime-date-export.js'});
for(const action of ['getScheduleDataSecure','getOvertimeExportAudit','recordOvertimeReportExport']){
 assert(moduleCode.includes(action),'缺少必要雲端動作：'+action);
}
assert.match(moduleCode,/addEventListener\('contextmenu'/,'需使用日期右鍵事件');
assert.match(moduleCode,/overtimeRevocations/,'已撤銷的加班不能列為有效申報');
assert.match(moduleCode,/version\)===versions\[i\]/,'日期已匯出標記需要比對申報版本');
assert.match(moduleCode,/已發起下載/,'未確認寫入時不能宣稱已保存雲端匯出紀錄');
assert(!/sendOvertimeAccountingMail|getOvertimeMailOptions|MailApp\.sendEmail/.test(page+moduleCode),'不得還原寄送郵件程式碼');
console.log('PASS: 考勤日期右鍵匯出與逐人加班雲端稽核靜態檢查');