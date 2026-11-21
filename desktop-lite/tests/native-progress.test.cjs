'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/login-progress.js'),'utf8');
const nativeSource=fs.readFileSync(path.join(__dirname,'../MainForm.cs'),'utf8');

async function eventLoop(){await new Promise(resolve=>setImmediate(resolve));}
function fixture(){
 let shown=false,role='',token='',online=true,downloads=0,behavior='success',nowMs=1000000,hasLocalCache=false;
 let onTick,initialTick;
 const events=new Map(),received=[],elements=new Map();
 const document={
  body:{append(node){if(node.id)elements.set(node.id,node)}},
  getElementById(id){
   return id==='systems'?{classList:{contains(name){return name==='show'&&shown}}}:elements.get(id)||null;
  },
  createElement(tag){
   return {tag,style:{},children:[],id:'',textContent:'',
    setAttribute(){},addEventListener(){},
    append(node){this.children.push(node)},
    querySelector(selector){
     const i=selector==='.p79-desktop-label'?0:selector==='.p79-desktop-detail'?1:2;
     return this.children[i];
    }
   };
  }
 };
 const sessionStorage={getItem(name){
  if(name==='port79_user_session')return role?JSON.stringify({empId:'USER',adminRole:role,dataScope:{group:'A'}}):null;
  if(name==='port79_user_token')return token;
  return null;
 }};
 const cache={
  async downloadAll(cb){
   downloads++;
   if(behavior==='stall'){cb('attendance',0,7,'loading');return new Promise(()=>{});}
   const names=['attendance','workhours','leave','schedule','efficiency','hr','history'];
   return names.map((sys,i)=>{
    cb(sys,i,7,'loading');
    if(sys==='attendance')cb(sys,i,7,'detail',null,'已完成 2026-10｜2/12 月');
    const fail=(behavior==='partial'&&sys==='history')||(behavior==='skipped'&&sys==='attendance');
    const skipped=behavior==='skipped'&&i>0;
    cb(sys,i,7,skipped?'skipped':fail?'error':'done',fail?new Error('test failure'):null);
    return {system:sys,ok:!fail&&!skipped,skipped,error:fail?'test failure':skipped?'未執行':''};
   });
  },
  async getSystemSnapshot(sys){return {size:sys==='attendance'?1048576:2048,savedAt:hasLocalCache?nowMs:0};},
  async getFolderSyncStatus(){return {state:'idle',label:'未連接'};}
 };
 const window={
  chrome:{webview:{postMessage(raw){received.push(JSON.parse(raw));}}},
  Port79DataCache:cache,
  addEventListener(type,fn){events.set(type,fn);}
 };
 const navigator={get onLine(){return online}};
 const localStorage={getItem(){return null},setItem(){}};
 const clock=class extends Date{static now(){return nowMs;}};
 const ctx={window,document,navigator,sessionStorage,localStorage,Date:clock,JSON,console,
  setInterval(fn){onTick=fn;return 1},
  setTimeout(fn){initialTick=fn;return 1},
  clearInterval(){},clearTimeout(){}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {events,received,cache,async tick(){onTick();await eventLoop()},async initial(){initialTick();await eventLoop()},
   get downloads(){return downloads},get popup(){return elements.get('p79WindowsDownloadProgress')},setAuth(r,s=true,t='TOKEN'){role=r;shown=s;token=t},
   setOnline(value){online=value},setBehavior(value){behavior=value},advance(ms){nowMs+=ms},setCached(value){hasLocalCache=value}};
}
test('compact native top-right progress receives true module and month counters only after manager login',async()=>{
 const x=fixture();
 assert.equal(x.received[0].phase,'idle');
 assert.equal(x.received[0].completed,0);
 assert.equal(x.downloads,0);
 await x.initial();await x.tick();assert.equal(x.downloads,0);
 x.setAuth('employee');await x.tick();assert.equal(x.downloads,0);
 x.setAuth('admin',false);await x.tick();assert.equal(x.downloads,0);
 x.setAuth('admin',true,'');await x.tick();assert.equal(x.downloads,0);
 x.setAuth('admin');x.setOnline(false);await x.tick();assert.equal(x.downloads,0);
 assert(x.received.some(v=>v.phase==='waiting'&&/離線/.test(v.title)));
 x.setOnline(true);await x.tick();await eventLoop();
 assert.equal(x.downloads,1);
 assert.equal(x.popup.style.display,'none','Native WebView2 progress must not duplicate an HTML popup');
 assert.match(x.popup.style.cssText,/top:14px/);
 assert(!/bottom:15px/.test(x.popup.style.cssText),'No bottom popup');
 assert(x.received.some(v=>v.phase==='downloading'&&/2026-10｜2\/12 月/.test(v.detail)),
  'Must show the real downloaded attendance month');
 assert(x.received.some(v=>v.phase==='downloading'&&v.monthCompleted===2&&v.monthTotal===12),
  'True attendance month ratio must reach native Windows bar before system 1/7 completes');
 assert(x.received.some(v=>v.phase==='downloading'&&v.completed>0&&v.completed<7),
  'Native bar must receive intermediate completion counts');
 const final=x.received.at(-1);
 assert.equal(final.kind,'port79-cache-status-v1');
 assert.equal(final.phase,'complete');
 assert.equal(final.completed,7);
 assert.match(final.detail,/7／7/);
 assert.match(final.detail,/1\.01 MB|1\.02 MB|1\.00 MB/);
 assert(!JSON.stringify(x.received).includes('TOKEN'),'No login token may be sent to native bridge');
 await x.tick();assert.equal(x.downloads,1,'Must not redownload after completed batch');
 x.events.get('port79-desktop-force-sync')();await eventLoop();assert.equal(x.downloads,2,'Explicit tray retry must work');
 x.setAuth('');await x.tick();assert.equal(x.received.at(-1).phase,'idle','Logout resets persistent native display');
});
test('explicit retry displays errors without fake success when one module fails',async()=>{
 const x=fixture();x.setAuth('superadmin');x.setBehavior('partial');
 await x.tick();await eventLoop();
 assert.equal(x.downloads,1);
 const last=x.received.at(-1);
 assert.equal(last.phase,'partial');
 assert.equal(last.completed,6,'Failed module must not count as downloaded');
 assert.match(last.detail,/成功 6／7，實際失敗 1 項，未執行 0 項/);
 assert.match(last.detail,/第一個錯誤：歷史資料：test failure/);
 assert(x.received.some(v=>v.detail?.includes('（失敗）')));
 await x.tick();assert.equal(x.received.at(-1).phase,'partial','Failed state remains visible until user retries');
});
test('one real error and six untouched modules are not displayed as seven failed downloads',async()=>{
 const x=fixture();x.setAuth('admin');x.setBehavior('skipped');
 await x.tick();await eventLoop();
 assert.equal(x.received.at(-1).phase,'partial');
 assert.match(x.received.at(-1).detail,/成功 0／7，實際失敗 1 項，未執行 6 項/);
 assert.equal(x.received.at(-1).completed,0);
});
test('cloud timeout heartbeat makes stalled first month visible without fake 100%, and page switch reports interruption',async()=>{
 const x=fixture();x.setAuth('admin');x.setBehavior('stall');
 await x.tick();assert.equal(x.downloads,1);
 x.advance(15000);await x.tick();
 assert.equal(x.received.at(-1).phase,'downloading');
 assert.match(x.received.at(-1).detail,/已等待 15 秒/);
 assert.equal(x.received.at(-1).completed,0,'Heartbeat must never pretend a month or system finished');
 x.advance(72000);await x.tick();
 assert.equal(x.received.at(-1).phase,'stalled');
 assert.match(x.received.at(-1).detail,/已等待 87 秒/);
 x.events.get('pagehide')();
 assert.equal(x.received.at(-1).phase,'interrupted','Navigate away must disclose interrupted download');
 assert.equal(x.received.at(-1).completed,0);
});
test('installed Windows cache is automatically recognized without asking to pick folder',async()=>{
 const x=fixture();
 const original=await x.cache.getFolderSyncStatus();
 assert.equal(original.label,'未連接','No login still uses original security state');
 x.setAuth('admin');
 const initial=await x.cache.getFolderSyncStatus();
 assert.equal(initial.label,'已連接，待下載');
 assert.equal(initial.folder,'Windows local-data/BrowserProfile');
 assert.equal(initial.state,'idle');
 x.setCached(true);
 const saved=await x.cache.getFolderSyncStatus();
 assert.equal(saved.state,'done');
 assert.equal(saved.label,'本機快取已保存');
 assert.equal(saved.savedAt,1000000);
});
test('native WinForms integration shows status permanently and in tray without accepting commands',()=>{
 assert.match(nativeSource,/Width=222,Height=52/,'Tiny cloud-progress icon must not take up a full-width row');
 assert.match(nativeSource,/Anchor=AnchorStyles.Top\|AnchorStyles.Right/);
 assert.match(nativeSource,/PositionCachePanel\(\)/);
 assert.doesNotMatch(nativeSource,/Dock=DockStyle.Bottom,Height=74/);
 assert.match(nativeSource,/Interval=6000/,'Success closes after six seconds');
 assert.match(nativeSource,/cacheTooltip.SetToolTip\(cacheTitle,cacheDetail.Text\)/,'Details are available on hover instead of a wide notification');
 assert.doesNotMatch(nativeSource,/layout.Controls.Add\(cacheDetail/,'No bulky multi-line progress popup');
 assert.match(nativeSource,/if\(phase=="complete"\)cacheDismissTimer.Start\(\)/);
 assert.match(nativeSource,/AccessibleName="隱藏下載進度"/);
 assert.match(nativeSource,/cacheBar\.Value=completed/);
 assert.match(nativeSource,/ProgressBarStyle.Marquee/);
 assert.match(nativeSource,/cacheBar.Value=monthCompleted/);
 assert.match(nativeSource,/monthTotal=Math.Max/);
 assert.match(nativeSource,/cacheInProgress/);
 assert.match(nativeSource,/cacheStatusMenu\.Text=/);
 assert.match(nativeSource,/Settings\.IsWebMessageEnabled=true/);
 assert.match(nativeSource,/WebMessageReceived\+=OnCacheMessage/);
 assert.match(nativeSource,/source\.Host\.Equals\(Host/);
 assert.match(nativeSource,/payload\.kind!="port79-cache-status-v1"/);
 assert.match(nativeSource,/TryGetWebMessageAsString/);
 assert.match(nativeSource,/private void UpdateCacheStatus/);
 assert(!nativeSource.includes('ExecuteScriptAsync("window.Port79DataCache.downloadAll()'));
});

test('one Update System menu handles both website and native shell without separate ZIP action',()=>{
 const releaseSource=fs.readFileSync(path.join(__dirname,'../ReleaseUpdater.cs'),'utf8');
 assert.match(nativeSource,/ToolStripMenuItem\("檢查並更新系統（程式及畫面）"/);
 assert.doesNotMatch(nativeSource,/ToolStripMenuItem\("更新 Windows 主程式/,'No separate manual shell update menu');
 assert.match(nativeSource,/await Updater\.StageFromOfficialAsync/,'Updates only changed public site files');
 assert.match(nativeSource,/await ReleaseUpdater\.PrepareAsync/,'Checks native shell in same action');
 assert.match(nativeSource,/await ReleaseUpdater\.LaunchAsync\(shell,root,Process\.GetCurrentProcess\(\)\.Id\)/);
 assert.match(nativeSource,/Application\.Restart\(\)/,'Site-only update can apply without downloading another ZIP');
 assert.match(nativeSource,/exit=true;Application\.Restart\(\);Close\(\);/,'Restart must bypass normal hide-to-tray close guard');
 assert.match(nativeSource,/Interval=300000/,'Automatic checks stay enabled');
 assert.match(releaseSource,/沿用已驗證的 Windows 更新檔，沒有再次下載/,'Verified staged release is reused');
 assert.match(releaseSource,/if\(foundShell&&identical\)/,'Newly unpacked identical shell is not reinstalled');
 assert.match(releaseSource,/installed-shell-sha256\.txt/,'Installed version is preserved');
 assert.match(releaseSource,/relative\.StartsWith\("local-data\//,'User data is excluded from release');
});

test('system file restart and verified Windows updater reopen the app automatically',()=>{
 const updater=fs.readFileSync(path.join(__dirname,'../app/upgrade-windows.ps1'),'utf8');
 assert.match(nativeSource,/exit=true;Application\.Restart\(\);Close\(\);/,'Site-file update restarts the Windows app');
 assert.match(nativeSource,/Shown\+=async\(s,e\)=>\{[\s\S]*?ShowWindow\(\);/,'Reopened app must show its main window');
 assert.match(nativeSource,/await ReleaseUpdater\.LaunchAsync\(shell,root,Process\.GetCurrentProcess\(\)\.Id\)/,'Native update launches helper before shutdown');
 assert.match(updater,/AUTO_RESTART_SUCCESS pid=/,'Updater logs verified automatic reopening');
 assert.match(updater,/WINDOW_VISIBLE_CONFIRMED pid=/,'Update success requires visible native main window');
 assert.match(updater,/Port79NativeWindow/,'Updater checks Windows native window visibility');
 assert.match(updater,/ERROR_NO_VISIBLE_WINDOW/,'Missing window is an explicit error, not a success');
 assert.match(updater,/STOPPED_FAILED_NEW_PROCESS/,'Failed invisible new app must stop before rollback');
 assert.match(updater,/Start-Process -FilePath \$exe -WorkingDirectory \$root -WindowStyle Normal -PassThru/,'New Windows executable starts visibly by itself');
 assert.match(updater,/if\(\$child.HasExited\)/,'A failed immediate restart must not be called successful');
 assert.match(updater,/ROLLBACK_RESTART_ATTEMPTED/,'Failed update attempts to reopen the old program');
 assert.match(updater,/if\(!\$TestOnly\)/,'Tests cannot launch installed Windows app');
});

test('Windows app has one unmistakable update entry and a dedicated 79 icon',()=>{
 const csproj=fs.readFileSync(path.join(__dirname,'../Port79Lite.csproj'),'utf8');
 const build=fs.readFileSync(path.join(__dirname,'../build-portable.ps1'),'utf8');
 const generator=fs.readFileSync(path.join(__dirname,'../generate-icon.ps1'),'utf8');
 assert.match(nativeSource,/檢查並更新系統（程式及畫面）/);
 assert.match(nativeSource,/版本待驗證/,'Missing manifest must be labeled unverified without a letter');
 assert.match(nativeSource,/\\d\{18\}/,'Displayed version must contain only 18 decimal digits');
 assert.doesNotMatch(nativeSource,/return "V"\+shortSha/,'Never display hexadecimal commit on Windows');
 assert.match(nativeSource,/版本號:/,'Installed ZIP version must be read from exact human manifest');
 assert.match(nativeSource,/重新核對六項基本資料（歷史按月）/);
 assert.match(nativeSource,/關閉程式/);
 assert.doesNotMatch(nativeSource,/真正結束程式/);
 assert.doesNotMatch(nativeSource,/更新 Windows 主程式（選用）/);
 assert.match(nativeSource,/Icon=System\.Drawing\.Icon\.ExtractAssociatedIcon\(Application\.ExecutablePath\)/);
 assert.match(nativeSource,/tray=new NotifyIcon\{Icon=Icon \?\? SystemIcons\.Application/);
 assert.match(csproj,/<ApplicationIcon>Port79Icon\.ico<\/ApplicationIcon>/);
 assert.match(build,/generate-icon\.ps1/);
 assert.match(generator,/DrawString\('79'/);
});

test('a stale version marker must never hide an old bottom-bar executable',()=>{
 const updater=fs.readFileSync(path.join(__dirname,'../ReleaseUpdater.cs'),'utf8');
 const script=fs.readFileSync(path.join(__dirname,'../app/upgrade-windows.ps1'),'utf8');
 assert.match(updater,/installed-shell-exe-sha256\.txt/);
 assert.match(updater,/markerMatches&&HashValid\(exeHash\)&&File.Exists\(exeFile\)/);
 assert.match(updater,/Sha256\(File.ReadAllBytes\(exeFile\)\)/);
 assert.match(updater,/版本紀錄存在但 EXE 尚未核對/);
 assert.match(script,/AUTO_RESTART_SUCCESS pid=/);
 assert.match(script,/Get-FileHash -LiteralPath \$exe -Algorithm SHA256/);
 assert.match(script,/WriteAllText\(\$version,\$ExpectedDigest\)/);
 const restartPos=script.indexOf('if($child.HasExited)'),markerPos=script.indexOf('WriteAllText($version,$ExpectedDigest)');
 assert(restartPos>=0&&markerPos>restartPos,'Only mark successful release after new executable was launched');
});

test('desktop progress is shown once beside History when new homepage indicator exists',()=>{
 assert.match(nativeSource,/DisplayInlineCacheProgress\(payload\)/,'Native counts are relayed to compact homepage');
 assert.match(nativeSource,/p79HomeDownloadProgress/,'Only pages with inline compact indicator suppress native status card');
 assert.match(nativeSource,/port79-desktop-progress/,'Uses display-only browser event');
 assert.match(nativeSource,/Math\.Max\(0,Math\.Min\(7,data\.completed\)\)/,'Only bounded real native count is shown');
 assert.match(nativeSource,/cachePanel\.Visible=false/,'Duplicate native popup is hidden');
 assert.match(nativeSource,/if\(!document\.getElementById/,'Other pages keep the native fallback');
 assert.doesNotMatch(nativeSource,/window\.__port79DesktopToken/,'No credentials enter display-only event');
});
