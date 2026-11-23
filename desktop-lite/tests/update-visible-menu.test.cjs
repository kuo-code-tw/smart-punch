'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'MainForm.cs'),'utf8');
const release=fs.readFileSync(path.join(root,'ReleaseUpdater.cs'),'utf8');
const updater=fs.readFileSync(path.join(root,'Updater.cs'),'utf8');
assert.match(src,/ToolStripMenuItem\("檢查79號碼頭電腦版更新"/);
assert.match(src,/private bool manualUpdateQueued=false;/);
assert.match(src,/if\(updateBusy\)\s*\{\s*if\(manual\)/,
 'Manual click during automatic check must be queued and acknowledged');
assert.match(src,/manualUpdateQueued=true/);
assert.doesNotMatch(src,/背景版本檢查尚未完成；已記下你的手動更新要求/,
 'Do not leave users with an indefinite queued-version-check notice');
assert.match(src,/手動更新已接手完成版本核對/,
 'Manual click must promote the running check rather than restart network work');
assert.match(src,/if\(manualUpdateQueued\)\s*\{\s*manual=true;\s*manualUpdateQueued=false;/,
 'One verified scan must honor the queued manual request immediately');
const nativeFirst=src.indexOf('shell=await ReleaseUpdater.PrepareAsync(root,DataRoot,Log)');
const websiteNext=src.indexOf('stagedSite=await Updater.StageFromOfficialAsync(site,DataRoot,Log)');
assert(nativeFirst>=0&&websiteNext>nativeFirst,
 'Check the complete verified Windows release before individual website files');
assert.match(src,/if\(shell==null\)\s*\{/,
 'Skip redundant individual website downloads when a complete Windows ZIP is ready');

assert.match(src,/BeginInvoke\(new Action\(\(\)=>\{if\(!exit\) _=CheckUpdates\(true\);\}\)\)/,
 'Queued manual action must actually run after background work');
assert.doesNotMatch(src,/checkUpdatesMenu\.Enabled=false/,
 'Do not disable tray item and silently discard operator clicks');
assert.match(src,/private void UpdateStatus\(string message,bool visible=false\)/);
assert.match(src,/updateNotice\.Visible=true/);
assert.match(src,/ShowWindow\(\);\s*updateNotice\.Text=/,
 'Manual click must visibly restore app window and show update progress');
assert.match(src,/MessageBoxButtons\.YesNo/,
 'Synchronizing or unsaved work requires explicit operator choice before restart');
assert.match(src,/MessageBoxDefaultButton\.Button2/,
 'Default must protect active data downloads');
assert.match(src,/if\(\(shell!=null\|\|websitePending\)&&manual&&!restartSafe\)/);
assert.match(src,/if\(answer==DialogResult\.Yes\)restartSafe=true/);
assert.match(src,/if\(shell!=null\)\{[\s\S]*?await ReleaseUpdater\.LaunchAsync\(shell,root,Process\.GetCurrentProcess\(\)\.Id\);[\s\S]*?ExitApp\(\)/);
assert.match(src,/if\(websitePending\)\{[\s\S]*?exit=true;Application\.Restart\(\);Close\(\)/);
assert.match(src,/if\(manual\)MessageBox\.Show\(this,[\s\S]*?"79號碼頭電腦版｜已是最新版"/);
assert.match(src,/if\(manual\)MessageBox\.Show\(this,[\s\S]*?"79號碼頭電腦版｜更新未完成"/);
assert.match(src,/log/i);
assert.match(release,/UPDATER_READY|runner-ready-/);
assert.match(updater,/baseBundleVersion/);
assert.doesNotMatch(src,/Directory\.Delete\(DataRoot/,'Never delete user cache on update');
assert.match(src,/private readonly Label updateAvailableBadge;/);
assert.match(src,/private bool verifiedUpdateAvailable=false;/);
assert.match(src,/updateAvailableBadge=new Label\s*\{[\s\S]*Text="有79號碼頭電腦版更新｜點此更新"/,
 'The toolbar should show the exact requested text only when an update is ready');
assert.match(src,/updateAvailableBadge\.Click\+=\(s,e\)=>\{if\(!exit\) _=CheckUpdates\(true\);\};/,
 'Clicking the badge must use the existing verified updater');
assert.match(src,/checkUpdatesMenu\.Text=available\?"有79號碼頭電腦版更新｜點此更新":"檢查79號碼頭電腦版更新"/,
 'Tray menu must be labeled only when a verified update is available');
assert.match(src,/updateAvailableBadge\.Visible=available;/,
 'No update means no persistent badge');
assert.match(src,/if\(shell!=null\|\|websitePending\)SetUpdateAvailable\(true\);\s*else if\(siteFailure==null&&shellFailure==null\)SetUpdateAvailable\(false\);/,
 'Badge must require staged official files, and failures must not claim an update');
assert.match(src,/verifiedUpdateAvailable\?50:8/, 'Badge must not cover cache-download progress');
assert.match(src,/verifiedUpdateAvailable\?108:70/, 'Badge must not cover manual update status');
assert.match(src,/MessageBoxDefaultButton\.Button2/,
 'Active downloads must still default to postponing restart');
assert.doesNotMatch(src,/SetUpdateAvailable\(true\);\s*if\(manual\)/,
 'Manually checking must never itself set a false positive badge');

const trayStart=src.indexOf('var menu=new ContextMenuStrip();');
const trayEnd=src.indexOf('tray.ContextMenuStrip=menu;',trayStart);
assert(trayStart>=0&&trayEnd>trayStart,'System tray menu exists');
const trayMenu=src.slice(trayStart,trayEnd);
assert.doesNotMatch(trayMenu,/menu\.Items\.Add\(systemUpdateStatusMenu\)/,
 'Hide duplicate, disabled updater status row');
assert.doesNotMatch(trayMenu,/menu\.Items\.Add\(cacheStatusMenu\)/,
 'Hide duplicate, disabled sync status row');
assert.doesNotMatch(trayMenu,/目前程式版本：/,
 'Hide disabled version row; the running version remains in title and tray tooltip');
assert.match(trayMenu,/menu\.Items\.Add\("開啟系統"/);
assert.match(trayMenu,/menu\.Items\.Add\("縮小到系統匣"/);
assert.match(trayMenu,/menu\.Items\.Add\(checkUpdatesMenu\)/);
assert.match(trayMenu,/menu\.Items\.Add\(syncDataMenu\)/);
assert.match(trayMenu,/menu\.Items\.Add\("開啟本機資料夾"/);
assert.match(trayMenu,/menu\.Items\.Add\("開啟目前程式資料夾"/);
assert.match(trayMenu,/menu\.Items\.Add\("關閉程式"/);
assert.match(src,/systemUpdateStatusMenu\.Text=/,
 'Status handling still works internally; only the duplicate menu text was removed');
assert.match(src,/cacheStatusMenu\.Text=/,
 'Sync progress remains available in the original status UI');
console.log('PASS visible manual update and verified-availability toolbar badge: no silent disabled clicks, queued action, safe synchronization prompt, true restart and explicit no-op/failure');
