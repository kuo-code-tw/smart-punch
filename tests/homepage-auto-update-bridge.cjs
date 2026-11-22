'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const home=fs.readFileSync('index.html','utf8');
const login=fs.readFileSync('assets/port79-login-version-check.js','utf8');
const native=fs.readFileSync('desktop-lite/MainForm.cs','utf8');
assert.match(home,/id="p79LoginCheckNow"[^>]*>立即更新<\/button>/);
assert.match(home,/port79-login-version-check\.js\?v=20261122-home-auto-v1/);
assert.match(native,/payload\.kind=="port79-system-update-command-v1"/);
assert.match(native,/source\.AbsolutePath\.Equals\("\/smart-punch\/index\.html"/);
assert.match(native,/payload\.action=="install"\)_ = CheckUpdates\(true\)/);
assert.match(native,/NotifyHomeUpdateStatus\(message\)/);
assert.match(login,/root\.chrome\.webview\.postMessage\(JSON\.stringify/);
assert.match(login,/root\.sessionStorage\?\.getItem\(STORED_BUILD\)/);
assert.match(login,/if\(!force&&homepageBusy\(\)\)return false/);
assert.doesNotMatch(login,/localStorage\.clear\(\)|indexedDB\.deleteDatabase/);

const api=require('../assets/port79-login-version-check.js');
const sha1='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const sha2='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const version=sha=>'V261122.'+(parseInt(sha.slice(0,8),16)%100000).toString().padStart(5,'0');
const old={version:version(sha1),commit:sha1};
const current={version:version(sha2),commit:sha2};
const el={textContent:'',title:''};
const store=new Map();
let page=old,redirects=[];
global.sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
global.document={
 hidden:false,activeElement:{tagName:'BODY'},
 getElementById:id=>id==='p79LoginVersionStatus'||id==='p79MainVersion'?el:
  id==='sessionBar'?{classList:{contains:()=>false}}:null
};
global.location={
 href:'https://kuo-code-tw.github.io/smart-punch/index.html',
 replace(url){redirects.push(url);}
};
global.fetch=async url=>({
 ok:true,json:async()=>String(url).includes('/releases/latest')
  ?{tag_name:'port79-windows-lite-20261122-'+sha2.slice(0,12)}
  :page
});
(async()=>{
 await api.check(true);
 assert.equal(api.browserLoadedBuild(page.version),old.version);
 page=current;
 await api.check(true);
 assert.equal(redirects.length,1,'new published version auto-refreshes idle browser homepage');
 assert(redirects[0].includes('_homeUpdated='+current.version));
 global.document.activeElement={tagName:'INPUT'};
 await api.check(true);
 assert.equal(redirects.length,1,'active field is never interrupted');
 global.document.activeElement={tagName:'BODY'};
 global.location.href='https://port79assets.example/smart-punch/index.html?windowsBundle='+old.version;
 let handoff='';
 global.chrome={webview:{postMessage:message=>{handoff=message;}}};
 await api.startUpdate();
 assert.deepEqual(JSON.parse(handoff),{kind:'port79-system-update-command-v1',action:'install'});
 assert.equal(redirects.length,1,'Windows home requests native updater, not a browser reload');
 console.log('PASS homepage auto refresh when safe, native updater button bridge, unchanged dashboard and private data');
})().catch(error=>{console.error(error);process.exitCode=1;});
