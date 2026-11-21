'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const updater=fs.readFileSync('desktop-lite/ReleaseUpdater.cs','utf8');
const build=fs.readFileSync('desktop-lite/build-portable.ps1','utf8');
const workflow=fs.readFileSync('.github/workflows/port79-windows-updates.yml','utf8');
const download=fs.readFileSync('assets/port79-windows-download.js','utf8');
const homepage=fs.readFileSync('index.html','utf8');
assert(updater.includes('/releases/latest'),'Desktop auto-update must request latest immutable GitHub release');
assert(!updater.includes('/releases/tags/port79-windows-lite-20261120'),
 'Desktop auto-update must not read the old mutable legacy tag');
assert(updater.includes('release.tag_name')&&updater.includes('asset.browser_download_url!=url'),
 'Desktop updater must validate exact immutable GitHub asset URL');
assert(updater.includes('Sha256(bytes)!=digest'),'Desktop still SHA-256 verifies complete download');
assert.match(build,/git -C \$repo rev-parse HEAD/,'ZIP must carry exact checked-out commit');
assert(build.includes("Join-Path $site '版本資訊.txt'"),'Version manifest must be visible inside package');
assert(build.includes('"版本號: "+$version'),'Published ZIP contains a visible numeric-only version');
assert(build.includes("ToUInt32($commit.Substring(0,8),16).ToString('D10')"),
 'Published ZIP numeric revision must match its exact commit');
assert(workflow.includes('site/smart-punch/版本資訊.txt'),'ZIP inspection must require version manifest');
assert(workflow.includes("ToUInt32($builtSha.Substring(0,8),16).ToString('D10')"),
 'Release must verify the same decimal revision in the ZIP');
assert(workflow.includes('ZIP site version does not match source commit'),
 'Build must reject a release with a stale version inside ZIP');
assert(workflow.includes('Port79-Windows-Lite-${SITE_SHA:0:12}.zip'),
 'Each release must include a unique downloadable filename');
assert(workflow.includes('dist/Port79-Windows-Lite.zip'),
 'Retain stable filename for older automatic updater compatibility');
assert(download.includes('/releases/latest'),'Website must use latest releases metadata');
assert(download.includes('RELEASE_API'),'Website must independently resolve current version');
assert(download.includes('Release asset not verified'),'Website checks asset name, URL, size and digest');
assert(!download.includes('releases/download/port79-windows-lite-20261120'),
 'Website never hands out old fixed release URLs');
assert(homepage.includes('numeric-v5'),'Old browser cached script must be bypassed');
console.log('PASS version contract: immutable latest release, unique ZIP name, embedded source SHA, validated browser and EXE updater URLs');
