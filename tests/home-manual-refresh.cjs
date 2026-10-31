'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const home=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const monthly=fs.readFileSync(path.join(__dirname,'../assets/port79-monthly-dashboard.js'),'utf8');
for(const match of home.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
 if(match[1].trim())new vm.Script(match[1]);
}
new vm.Script(monthly);
assert(home.includes('id="p79DashRefresh" title="手動重新讀取所選月份的首頁資料">↻ 手動更新'));
assert(home.includes("setTimeout(refreshSystemVersions,3000)"),'initial versions read remains enabled');
assert(home.includes('p79StartDeploymentStatusWatch();'),'initial deployment safety check remains enabled');
assert(!home.includes('setInterval(p79CheckDeploymentStatus'),'deployment must not poll every 12s');
assert(!home.includes('setInterval(refreshSystemVersions'),'version details must not auto-poll every 10min');
assert(!home.includes("document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'"),'tab restore must not refresh versions');
assert(!monthly.includes('refreshPendingOnReturn'),'tab focus must not auto reload attendance');
assert(!monthly.includes("root.document.addEventListener('visibilitychange'"),'tab visibility must not reload attendance');
assert(!monthly.includes("root.addEventListener('focus'"),'tab focus must not reload attendance');
assert(monthly.includes("$('p79DashRefresh')?.addEventListener('click',()=>"),'manual dashboard refresh remains available');
assert(monthly.includes("if(!loadedKey){root.setTimeout(()=>load(false)"),'first login should still load the dashboard once');
assert(monthly.includes('refreshPendingReviewFromCloud();'),'user-selected card must still load its actual details');
assert(home.includes('port79-monthly-dashboard.js?v=20261031-private-sheet-v1'),'bundle should not retain stale cache key');
console.log('PASS: homepage loads once, version/deployment checks run once, no periodic/focus refresh, manual updates and review details work');