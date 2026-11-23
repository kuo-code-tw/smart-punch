'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const site=require('../scripts/write-port79-site-files.cjs');
const pageWorkflow=fs.readFileSync('.github/workflows/pages-static.yml','utf8');
const releaseWorkflow=fs.readFileSync('.github/workflows/port79-windows-updates.yml','utf8');
const siteUpdater=fs.readFileSync('desktop-lite/Updater.cs','utf8');
const windowsUpdater=fs.readFileSync('desktop-lite/ReleaseUpdater.cs','utf8');
const homepage=fs.readFileSync('assets/port79-login-version-check.js','utf8');

// A published file hash is the exact Git blob SHA-1, independently verified
// before any existing local site files are replaced.
assert.equal(site.hash(Buffer.from('hello')),'b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0');
assert(site.allowed('index.html'));
assert(site.allowed('assets/port79-login-version-check.js'));
assert(site.allowed('attendance/index.html'));
assert(!site.allowed('desktop-lite/ReleaseUpdater.cs'));
assert(!site.allowed('local-data/BrowserProfile/private.ldb'));
assert(!site.allowed('../secrets.json'));
assert(!site.allowed('assets/../.env'));
assert(!site.allowed('assets/.secret'));
assert.match(pageWorkflow,/node scripts\/write-port79-version\.cjs \.\s*node scripts\/write-port79-site-files\.cjs \./);
assert.match(siteUpdater,/const string SiteManifest=Published\+"port79-site-files\.json"/);
assert(siteUpdater.indexOf('GetStringAsync(SiteManifest')<siteUpdater.indexOf('GetStringAsync(GitTree'));
assert.match(siteUpdater,/e\.type!="blob"\|\|!Allowed\(e\.path\)/);
assert.match(siteUpdater,/Distinct\(StringComparer\.Ordinal\)/);
assert.match(siteUpdater,/Hash\(bytes\)!=e\.sha/);
assert.match(siteUpdater,/SaveManifest\(pending,new Manifest \{files=changed,baseBundleVersion=BundleVersion\(site\)\}\)/);

// The native shell uses non-API metadata from an official release asset.
// A download still requires the pinned GitHub asset URL, size and SHA-256.
assert.match(windowsUpdater,/releases\/latest\/download\/port79-windows-update\.json/);
assert(windowsUpdater.indexOf('GetStringAsync(PublishedRelease')<
 windowsUpdater.indexOf('GetStringAsync(\n      Api+'));
assert.match(windowsUpdater,/release\.source_commit\.Substring\(0,12\)/);
assert.match(windowsUpdater,/asset\.browser_download_url!=url/);
assert.match(windowsUpdater,/Sha256\(bytes\)!=digest/);
assert.match(windowsUpdater,/verified-release-updater\.exe/);
assert.match(releaseWorkflow,/PORT79_RELEASE_DIGEST="\$\(sha256sum dist\/Port79-Windows-Lite\.zip/);
assert.match(releaseWorkflow,/dist\/port79-windows-update\.json -R "\$REPO"/);
assert.match(homepage,/RELEASE_TTL_MS=2\*60\*60\*1000/);
assert.match(homepage,/read\(LOCAL\),read\(WEB\),readRelease\(\)/);
assert.match(homepage,/RELEASE_ERROR_TTL_MS/);
console.log('PASS API-limit-safe Windows and site update metadata, hash checks, privacy allowlist and release caching');
