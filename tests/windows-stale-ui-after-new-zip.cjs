'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const native=fs.readFileSync('desktop-lite/MainForm.cs','utf8');
const updater=fs.readFileSync('desktop-lite/Updater.cs','utf8');
const build=fs.readFileSync('desktop-lite/build-portable.ps1','utf8');
const release=fs.readFileSync('.github/workflows/port79-windows-updates.yml','utf8');
const index=fs.readFileSync('index.html','utf8');
assert.match(native,/CoreWebView2\.Profile\.ClearBrowsingDataAsync\(CoreWebView2BrowsingDataKinds\.DiskCache\)/,
 'When the installed bundle changes, only the disk cache of stale JS/CSS is cleared');
assert(!native.includes('ClearBrowsingDataAsync()')&&!native.includes('CoreWebView2BrowsingDataKinds.AllSite')&&
 !native.includes('CoreWebView2BrowsingDataKinds.IndexedDb')&&!native.includes('CoreWebView2BrowsingDataKinds.AllProfile'),
 'Never wipe IndexedDB, saved cloud snapshots, cookies, or login while reloading UI');
assert(native.includes('webview-program-http-cache-version.txt'),'Only invalidate browser HTTP cache on bundle change');
assert(native.includes('InvalidateStaleProgramHttpCache(appliedSiteFiles>0)'),
 'A verified website patch must also invalidate stale JS/CSS');
assert(native.indexOf('await InvalidateStaleProgramHttpCache(')<native.indexOf('web.CoreWebView2.Navigate(LocalRoot+'),
 'Clear HTTP cache before navigating visible page');
assert(native.includes('index.html?windowsBundle='),'Bundled homepage uses versioned URL');
assert(native.includes('開啟目前程式資料夾'),'Allow users to distinguish a new ZIP from an old desktop shortcut');
assert(native.includes('Text="79號碼頭雲端智慧系統｜"+(displayVersion.Length>0?displayVersion:"版本待驗證")'),
 'Show the actual running version in the title bar rather than duplicating it in the tray menu');
assert(native.includes('Text=SafeStatus("79號碼頭｜"+(displayVersion.Length>0?displayVersion:"版本待驗證"),60)'),
 'Keep installed version in tray hover text');
assert(!native.includes('目前程式版本：'),'Do not duplicate version as an unclickable menu item');
assert(updater.includes('baseBundleVersion=BundleVersion(site)'),'Staged patches are tied to original bundle');
assert(updater.includes('!String.Equals(manifest.baseBundleVersion,installedBundle'),
 'Previously downloaded older website code cannot overwrite freshly extracted ZIP');
assert(updater.includes('File.Delete(manifestFile)'),'Outdated pending patch is discarded without touching site');
assert(build.includes("Join-Path $site '版本資訊.txt'"),'Bundle carries visible source identity');
assert(release.includes('ZIP site version does not match source commit'),
 'Release CI rejects packages where the bundled UI differs from source');
assert(index.includes('port79-home-early-punch-alert.js')&&index.includes('20261121-punch-visible-v6'),
 'Current ZIP opens the original attendance modal in place without full page iframe');
assert(!index.includes('id="p79EarlyPunchEditorFrame"'),'No broken embedded attendance frame in Windows UI');
assert(fs.readFileSync('attendance/index.html','utf8').includes('port79-attendance-audit-handoff.js?v=20261121-inline-channel-v3'),
 'Bundled attendance page consumes the exact-row handoff');
assert(fs.readFileSync('assets/port79-attendance-inline-guest.js','utf8').includes("root.parent.postMessage"),
 'Bundled attendance page can safely signal the existing inline modal');
assert(fs.readFileSync('assets/port79-home-early-punch-alert.js','utf8').includes('bridge.open('),
 'Bundled homepage opens original attendance editor in-place');
console.log('PASS: new ZIP loads current UI, rejects stale staging, clears only safe HTTP cache and exposes actual executable path');
