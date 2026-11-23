'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const parent=fs.readFileSync('assets/port79-home-audit-inline-editor.js','utf8');
const child=fs.readFileSync('assets/port79-attendance-inline-guest.js','utf8');
const css=fs.readFileSync('assets/port79-monthly-dashboard.css','utf8');
const home=fs.readFileSync('index.html','utf8');
const attendance=fs.readFileSync('attendance/index.html','utf8');

// On Windows WebView2 an iframe with the HTML hidden attribute may not run
// its child script, leaving the parent waiting forever for a ready event.
assert.match(parent,/<iframe[^>]*class="p79-early-inline-starting"[^>]*aria-hidden="true"/);
assert.doesNotMatch(parent,/<iframe[^>]*\shidden(?:\s|>)/);
assert.match(css,/iframe\.p79-early-inline-starting\s*\{[^}]*position:absolute!important;[^}]*width:1px!important;[^}]*height:1px!important;/s);
assert.match(css,/opacity:0!important;pointer-events:none!important/);
assert.match(parent,/frame\.classList\.remove\('p79-early-inline-starting'\)/);
assert.match(parent,/frame\.removeAttribute\('aria-hidden'\)/);

// Do not treat a slow cloud/employee preflight as failed iframe loading.
assert.match(parent,/case 'ready':\s*if\(instance\.opened\|\|instance\.initConfirmed\)return;/);
assert.match(parent,/instance\.timer=root\.setTimeout\(\(\)=>\{[^}]*正式員工與打卡資料尚未核對完成/s);
assert.match(parent,/\},65000\)/);
assert.match(parent,/case 'progress':\s*instance\.initConfirmed=true/);

// If an init message is missed during child navigation, the child retries
// its nonce-bound ready until the original attendance page accepts init.
assert.match(child,/if\(!initialized\)\{[\s\S]*Date\.now\(\)-lastReadyAt>=1000[\s\S]*send\('ready'\)/);
assert.match(child,/lastReadyAt=Date\.now\(\);\s*send\('ready'\)/);
assert.match(parent,/event\.source!==frame\.contentWindow\|\|\s*event\.origin!==root\.location\.origin/);
assert.match(parent,/message\.type!==TYPE\|\|message\.nonce!==nonce/);
assert.match(child,/event\.source!==root\.parent\|\|event\.origin!==origin/);
assert.match(child,/msg\.nonce!==nonce\|\|initialized/);

// Preserve the ORIGINAL writer, secure identity preflight and cloud-confirmed save.
assert.match(child,/original\.call\(this,payload,\.\.\.args\)/);
assert.match(child,/data\?\.ok===true&&data\.localOnly!==true/);
assert.match(parent,/frame\.contentWindow\.postMessage\(\{type:TYPE,action:'init',nonce,payload\},root\.location\.origin\)/);
assert.match(home,/port79-home-audit-inline-editor\.js\?v=20261123-webview2-ready-v1/);
assert.match(home,/inlineReady=20261123-webview2-v1/);
assert.match(attendance,/port79-attendance-inline-guest\.js\?v=20261123-webview2-ready-retry-v1/);
console.log('PASS: WebView2 inline frame stays live, retries nonce-bound readiness, preserves original attendance writer');
