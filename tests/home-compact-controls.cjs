'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const home=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/port79-home-compact-controls.css','utf8');
const ui=fs.readFileSync('assets/port79-home-compact-controls.js','utf8');
const download=fs.readFileSync('assets/port79-windows-download.js','utf8');
assert.match(home,/port79-home-compact-controls\.css\?v=20261121-v1/);
assert.match(home,/port79-home-compact-controls\.js\?v=20261121-v1/);
assert.match(home,/id="p79WindowsDownloadLink"[^>]*>⬇ 電腦版下載<\/a>/);
assert.match(home,/id="logoutBtn"/,'Original logout control is retained');
assert.match(home,/id="systems"/,'Original login and module entry is retained');
assert.match(download,/document\.getElementById\('p79HomeCompactActions'\)/,
 'The ORIGINAL authorized Windows download link must target compact status row once present');
assert.match(ui,/tray\.append\(compact\)/,'Compact controls belong to module status tray');
assert.match(ui,/compact\.append\(download\)/,'Reparent existing link without cloning handlers');
assert.match(ui,/compact\.append\(menu\)/,'Reparent original function menu');
assert.match(ui,/compact\.append\(theme\)/,'Reparent original theme switch');
assert.match(ui,/port79-desktop-progress/,'Progress must come from real native status events');
assert.match(ui,/Number\(info\.completed\)/,'Only native verified counts may fill progress');
assert.doesNotMatch(ui,/\bfetch\s*\(|window\.open\s*\(|\blocalStorage\b|sessionStorage|location\.href/,
 'The presentation layer must not call APIs, change business records or implement auth logic');
assert.match(css,/#p79WorkspaceStatus/);
assert.match(css,/#p79SevenStatus/);
assert.match(css,/#p79HomeCompactActions/);
assert.match(css,/#p79HomeDownloadProgress\[hidden\]/);
assert.match(css,/#p79HomeCompactActions #p79WindowsDownloadLink:not\(\[hidden\]\)/);
assert.match(css,/@media\(max-width:650px\)/,'Responsive layout must not overflow phones');
assert.match(css,/html:is\(\.dark,\[data-theme="dark"\]\)/,'Light and dark modes are supported');
// Static syntax checks for the two new scripts.
new vm.Script(ui,{filename:'assets/port79-home-compact-controls.js'});
new vm.Script(download,{filename:'assets/port79-windows-download.js'});
console.log('PASS visual-only compact History-row layout, real progress binding, preserved manager link/permissions and existing handlers');
