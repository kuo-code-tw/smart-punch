'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const home=fs.readFileSync('index.html','utf8');
const audit=fs.readFileSync('assets/port79-home-early-punch-alert.js','utf8');
const dashboard=fs.readFileSync('assets/port79-monthly-dashboard.js','utf8');
const login=fs.readFileSync('assets/port79-login-version-check.js','utf8');
const ps=fs.readFileSync('desktop-lite/build-portable.ps1','utf8');
const native=fs.readFileSync('desktop-lite/MainForm.cs','utf8');
const pages=fs.readFileSync('.github/workflows/pages-static.yml','utf8');
const release=fs.readFileSync('.github/workflows/port79-windows-updates.yml','utf8');
const win=fs.readFileSync('tests/windows-stale-ui-after-new-zip.cjs','utf8');
const versionTools=require('../scripts/write-port79-version.cjs');
const versionModule=require('../assets/port79-login-version-check.js');
const sha='cfa96ffbfce3f4a6f992926bddbdaa788c59ef03';
const expected='V261121.'+(Number.parseInt(sha.slice(0,8),16)%100000).toString().padStart(5,'0');
assert.equal(versionTools.version(sha,'2026-11-21'),expected);
assert.deepEqual(versionModule.normalized({version:expected,commit:sha}),{version:expected,commit:sha});
assert.equal(versionModule.normalized({version:expected,commit:'f'.repeat(40)}),null);
assert.equal(versionModule.releaseVersion({tag_name:'port79-windows-lite-20261121-'+sha.slice(0,12)}),expected);
assert.match(ps,/port79-version\.json/,'ZIP contains actual installed build manifest');
assert.match(pages,/node scripts\/write-port79-version\.cjs/,'Pages publishes the manifest from exact source');
assert.match(release,/unzip -p dist\/Port79-Windows-Lite\.zip/,'release date read from embedded version');
assert.match(release,/tag="port79-windows-lite-\$\{source_day\}-\$\{SITE_SHA:0:12\}"/);
assert.match(native,/CheckUpdates\(false\)/,'native still checks updates automatically');
assert.match(home,/id="p79LoginVersionStatus"/,'visible login update status restored');
assert.match(home,/id="p79LoginCheckNow"/);
assert.match(home,/p79ApplyBuildVersion/,'one verified version applied to every bundled module');
assert.doesNotMatch(home,/setTimeout\(refreshSystemVersions/,'do not fetch six huge module pages on login');
assert.match(home,/port79-login-version-check\.js\?v=20261121-compact-v2/);
assert.match(home,/white-space:nowrap;overflow:hidden;text-overflow:ellipsis/,'Version check must stay one line');
assert.equal(versionModule.compactStatus(true,'V261121.34805',{version:'V261121.48139'},'V261121.34805','20:41'),
 '🔎 V261121.34805｜已是最新版｜20:41','A newer web build should not make the installed latest Windows release look outdated');
assert.equal(versionModule.compactStatus(true,'V261121.34805',null,'V261121.99999','20:41'),
 '🔎 V261121.34805｜有新版｜20:41');
assert.equal(versionModule.compactStatus(false,'V261121.34805',{version:'V261121.48139'},'V261121.34805','20:41'),
 '🔎 V261121.34805｜有新版｜20:41');
assert.match(login,/field\.title=details/,'Full details remain visible on hover');

assert.doesNotMatch(home,/\bp79StartDeploymentStatusWatch\(\);/,'old one-shot legacy deploy check is not invoked');
assert.match(login,/window|globalThis/);
assert.match(login,/setInterval/,'recheck while login is on screen');
assert.match(login,/credentials:'omit'/,'only public version info is requested');
assert.match(login,/Promise\.allSettled/,'temporary GitHub failure is isolated');
assert.equal(versionModule.compactStatus(true,'V261121.34805',null,'','20:41'),
 '🔎 V261121.34805｜更新待核｜20:41','Cannot claim current when release source failed');
assert.match(dashboard,/previewHomeMonth\('attendance',ym,token\)/,'reuse verified IndexedDB snapshot only');
assert.match(dashboard,/Port79DataCache\?\.getHistoryPreview/);
assert.match(dashboard,/preview:true/);
assert.match(dashboard,/const restEvidence=null/,'whole-month rest auditor cannot block KPI');
assert.match(audit,/punchIndex=new Map\(\)/,'large-company audit indexed by worker');
assert.match(audit,/leaveIndex=new Map\(\)/);
assert.match(audit,/renderDialog\(\);\s*status\('先顯示已載入的正式資料/,'show existing rows before cloud');
assert.match(audit,/12[0]{3}/,'slow cloud gets visible timeout');
assert.match(win,/20261121-punch-visible-v6/);
console.log('PASS homepage login checks current build + release, Windows identity consistency, fast cached audit and cloud-first safety');
