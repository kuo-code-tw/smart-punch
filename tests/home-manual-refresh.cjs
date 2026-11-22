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
const updater=fs.readFileSync(path.join(__dirname,'../assets/port79-login-version-check.js'),'utf8');
assert(/port79-login-version-check\.js\?v=[^"\s<>]+/.test(home),'homepage loads the versioned verified updater');
assert(updater.includes('void check(true);'),'homepage updater performs an initial verified check');
assert(updater.includes('homepageBusy()'),'updater must not interrupt password, login or editing');
assert(home.includes('function p79StartDeploymentStatusWatch()'),'safe manual deployment status check remains available');
assert(updater.includes('browserLoadedBuild('),'browser update is bound to the version originally displayed');
assert(!home.includes('setInterval(p79CheckDeploymentStatus'),'deployment must not poll every 12s');
assert(!home.includes('setInterval(refreshSystemVersions'),'version details must not auto-poll every 10min');
assert(!home.includes("document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'"),'tab restore must not refresh versions');
assert(!monthly.includes('refreshPendingOnReturn'),'tab focus must not auto reload attendance');
assert(!monthly.includes("root.document.addEventListener('visibilitychange'"),'tab visibility must not reload attendance');
assert(!monthly.includes("root.addEventListener('focus'"),'tab focus must not reload attendance');
assert(monthly.includes("$('p79DashRefresh')?.addEventListener('click',()=>"),'manual dashboard refresh remains available');
assert(monthly.includes("if(!loadedKey){root.setTimeout(()=>load(false)"),'first login should still load the dashboard once');
assert(monthly.includes('refreshPendingReviewFromCloud();'),'user-selected card must still load its actual details');
assert(/port79-monthly-dashboard\.js\?v=[^"\s<>]+/.test(home),'monthly dashboard is cache-versioned');
console.log('PASS: homepage loads once, version/deployment checks run once, no periodic/focus refresh, manual updates and review details work');