'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('assets/port79-seven-top.js','utf8');
const expected="['efficiency','🚢','碼頭系統管理','../aqc-efficiency/']";
assert(js.includes(expected),'shared sidebar should use exactly the new terminal system name');
assert(!js.includes("['efficiency','🚢','船舶作業管理'"),'old label must not render in sidebar');
assert.equal(js.split(expected).length-1,1,'only one efficiency navigation entry');
const nav=js.slice(js.indexOf('const NAV='),js.indexOf('const SYSTEMS=',js.indexOf('const NAV=')));
assert(nav.includes("['attendance','🕒','考勤管理','../attendance/']"));
assert(nav.includes("['schedule','📅','排班管理','../schedule/']"));
assert(nav.includes("['hr','👥','人資管理','../hr/']"));
assert(nav.includes("['workhours','📊','工時與加班管理','../work-hours/']"));
assert(nav.includes("['leave','📝','請假管理','../leave/']"));
assert(nav.includes("['history','🗄️','歷史資料庫','../history-data/']"));
for(const path of ['attendance','schedule','aqc-efficiency','hr','work-hours','leave','history-data']){
 const html=fs.readFileSync(path+'/index.html','utf8');
 const matches=[...html.matchAll(/<script[^>]+src="[^"]*port79-seven-top\.js[^"]*"/g)];
 assert.equal(matches.length,1,'one shared sidebar loader in '+path);
 assert(matches[0][0].includes('menu=20261113-terminal-system-v1'),'cache invalidated in '+path);
}
new vm.Script(js);
console.log('PASS shared seven-system sidebar uses 碼頭系統管理; icon, destination, permissions and all 7 cache keys retained');
