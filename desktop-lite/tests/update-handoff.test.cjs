'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const native=fs.readFileSync(path.join(root,'ReleaseUpdater.cs'),'utf8');
const script=fs.readFileSync(path.join(root,'app','upgrade-windows.ps1'),'utf8');
const safety=fs.readFileSync(path.join(root,'tests','shell-updater-safety.ps1'),'utf8');
const marker='runner-ready-';
assert(native.includes(marker),'Windows native updater must pass a ready file');
assert(native.includes('async Task LaunchAsync('),'Native handoff should not freeze the GUI thread');
assert(native.includes('await Task.Delay(150)'),'Handoff polling must yield to WebView2');
const main=fs.readFileSync(path.join(root,'MainForm.cs'),'utf8');
assert(main.includes('await ReleaseUpdater.LaunchAsync('),'GUI must await the verified handoff before closing');
assert(native.includes('-ReadyFile '),'Windows launcher supplies handshake path');
assert(native.includes('accepted=!process.HasExited'),'Do not quit for an exited updater');
assert(native.includes('if(!accepted)'),'Unconfirmed updater must produce an explicit failure');
assert(native.includes('process.Kill()'),'Terminate orphaned updater on failed handoff');
assert(native.includes('CreateNoWindow=true'),'Do not expose a background CMD/PowerShell window');
assert(script.includes('UPDATER_READY'),'Actual script must acknowledge startup');
assert(script.includes('[IO.File]::WriteAllText($expectedReady'),'Actual script must create the handshake marker');
assert(script.indexOf("Release SHA-256 validation failed before extraction")<
       script.indexOf('UPDATER_READY'),'Never acknowledge unverified ZIP');
assert(script.includes("MainWindowTitle"),'Only validated main window should be shown after update');
assert(script.includes("title.Contains('79號碼頭雲端智慧系統')"),'GDI+ helper window must not be activated');
assert(safety.includes('Rejected release must not signal updater ready'),
       'Invalid SHA must never mark handoff successful');
assert(safety.includes('User data was changed'),'Preserve local-data regression test');
console.log('PASS: handoff acknowledged only after SHA-256 and actual PowerShell start; GDI+ not activated; no CMD popup; private data protection retained');
