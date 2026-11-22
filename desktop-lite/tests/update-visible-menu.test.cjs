'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'MainForm.cs'),'utf8');
const release=fs.readFileSync(path.join(root,'ReleaseUpdater.cs'),'utf8');
const updater=fs.readFileSync(path.join(root,'Updater.cs'),'utf8');
assert.match(src,/ToolStripMenuItem\("檢查並更新系統（程式及畫面）"/);
assert.match(src,/private bool manualUpdateQueued=false;/);
assert.match(src,/if\(updateBusy\)\s*\{\s*if\(manual\)/,
 'Manual click during automatic check must be queued and acknowledged');
assert.match(src,/manualUpdateQueued=true/);
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
assert.match(src,/if\(\(shell!=null\|\|websitePending\)&&manual&&\(!restartSafe\|\|userInteractedSinceLaunch\)\)/);
assert.match(src,/restartSafe=answer==DialogResult\.Yes/);
assert.match(src,/if\(shell!=null\)\{[\s\S]*?await ReleaseUpdater\.LaunchAsync\(shell,root,Process\.GetCurrentProcess\(\)\.Id\);[\s\S]*?ExitApp\(\)/);
assert.match(src,/if\(websitePending\)\{[\s\S]*?exit=true;Application\.Restart\(\);Close\(\)/);
assert.match(src,/if\(manual\)MessageBox\.Show\(this,[\s\S]*?"79號碼頭｜已是最新版"/);
assert.match(src,/if\(manual\)MessageBox\.Show\(this,[\s\S]*?"79號碼頭｜更新未完成"/);
assert.match(src,/log/i);
assert.match(release,/UPDATER_READY|runner-ready-/);
assert.match(updater,/baseBundleVersion/);
assert.doesNotMatch(src,/Directory\.Delete\(DataRoot/,'Never delete user cache on update');
console.log('PASS visible manual update: no silent disabled clicks, queued action, safe synchronization prompt, true restart and explicit no-op/failure');
