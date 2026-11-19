'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'settings/index.html'),'utf8');
const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
const shell=fs.readFileSync(path.join(root,'assets/port79-management-workspace.js'),'utf8');
const notice=fs.readFileSync(path.join(root,'assets/port79-system-notice.js'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
assert.equal(scripts.length,1);
new vm.Script(scripts[0]);
new vm.Script(notice);
new vm.Script(shell);
assert.match(home,/port79-system-notice\.js/);
assert.ok(home.includes("get('openBackup')!=='1'"));
assert.match(home,/Port79AllBackup\.show\(\)/);
assert.match(shell,/const order=.*'settings'/);
assert.deepEqual([...html.matchAll(/data-nav="([^"]+)"/g)].map(m=>m[1]),
 ['home','attendance','schedule','efficiency','hr','workhours','leave','history','settings'],
 'Settings sidebar module order must match real homepage navigation');

assert.match(shell,/role==='superadmin'/);
assert.match(shell,/\.\/settings\//);
assert.match(html,/hrGetOrgOptions/);
assert.match(html,/saveConfig/);
assert.match(html,/getSessionMeta/);
assert.match(html,/verifiedSuperadmin/);
assert.match(html,/JSON\.stringify\(actual\)!==JSON\.stringify\(draft\)/);
assert.match(html,/TextEncoder/);
assert.doesNotMatch(html,/alert\(['"](?:成功|已儲存)/);
for(const match of html.matchAll(/href="(\.\.\/[^"#?]+)(?:[?#][^"]*)?"/g)){
 const local=match[1];const target=path.resolve(root,'settings',local);
 assert.ok(fs.existsSync(target), 'Local settings destination missing: '+local);
}
async function simulate(adminRole){
 const fields=new Map(),events={};
 function field(id){if(!fields.has(id))fields.set(id,{value:'',checked:false,disabled:false,textContent:'',dataset:{},hidden:false,
  listeners:{},addEventListener(name,fn){this.listeners[name]=fn},focus(){this.focused=true},setAttribute(){}});return fields.get(id);}
 const stored=new Map([['port79_admin_token','real-test-token'],['port79_user_session',JSON.stringify({adminRole})]]);
 const local=new Map();
 let persisted={unrelatedOrganizationKey:{keep:true}},writes=0,failNextWrite=false;
 const doc={readyState:'loading',documentElement:{setAttribute(){}},getElementById:field,
  querySelectorAll(){return[]},addEventListener(name,fn){events[name]=fn}};
 const ctx={
  document:doc,window:{dispatchEvent(){}},location:{hash:'',href:'https://example.test/settings/'},URL,URLSearchParams,TextEncoder,AbortController,Event:class{},
  sessionStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
  localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},
  setTimeout,clearTimeout,confirm:()=>true,console,
  fetch:async function(endpoint,options){
   const action=options&&options.method==='POST'?JSON.parse(options.body).action:new URL(endpoint).searchParams.get('action');
   let data={ok:true};
   if(action==='getSessionMeta')data={ok:true,adminRole};
   if(action==='hrGetOrgOptions')data={ok:true,config:JSON.parse(JSON.stringify(persisted))};
   if(action==='saveConfig'){
    if(failNextWrite){failNextWrite=false;data={ok:false,error:'測試雲端寫入失敗'};}
    else{writes++;persisted=JSON.parse(options.body).config;}
   }
   if(action==='ping')data={ok:true};
   return {ok:true,json:async()=>data};
  }
 };
 vm.runInNewContext(scripts[0],ctx,{timeout:2000});
 assert.equal(typeof events.DOMContentLoaded,'function');
 await events.DOMContentLoaded();
 // Let the cloud read and nested promise callbacks settle.
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(field('loginGate').hidden,adminRole==='superadmin');
 if(adminRole!=='superadmin'){
  await field('save').listeners.click();
  assert.equal(writes,0,'Unauthorized role must not trigger saveConfig');
  return;
 }
 field('noticeEnabled').checked=true;field('noticeText').value='測試公告';
 await field('save').listeners.click();
 assert.equal(writes,1,'Save must call backend once');
 assert.equal(persisted.unrelatedOrganizationKey.keep,true,'Save must preserve unrelated canonical configuration');
 assert.equal(persisted.p79SystemSettingsV1.notice.text,'測試公告');
 assert.match(field('status').textContent,/雲端.*讀回確認/);
 field('themeMode').value='dark';field('themeMode').listeners.change.call(field('themeMode'));
 assert.equal(local.get('port79_theme'),'dark');
 field('yearMode').value='roc';field('yearMode').listeners.change.call(field('yearMode'));
 assert.equal(local.get('port79_year_mode'),'roc');
 // Every command button is wired and has an observable effect.
 await field('cloudPing').listeners.click();
 assert.match(field('cloudState').textContent,/雲端已回覆/);
 assert.equal(field('cloudPing').disabled,false);
 field('noticeText').value='尚未儲存';
 await field('reloadCloud').listeners.click();
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(field('noticeText').value,'測試公告','Reload discards unsaved local draft and reads canonical cloud data');
 // Restore must not silently change local appearance if cloud write fails.
 failNextWrite=true;
 await field('restore').listeners.click();
 assert.equal(local.get('port79_theme'),'dark','Failed cloud restore must preserve local theme');
 assert.equal(local.get('port79_year_mode'),'roc','Failed cloud restore must preserve local calendar mode');
 assert.equal(field('noticeEnabled').checked,true,'Failed cloud restore must preserve draft');
 assert.equal(writes,1,'Failed cloud write must not be counted as successful');
 assert.match(field('status').textContent,/測試雲端寫入失敗/);
 // Successful restore must update cloud config AND local preferences exactly once.
 await field('restore').listeners.click();
 assert.equal(writes,2);
 assert.equal(persisted.p79SystemSettingsV1.notice.enabled,false);
 assert.equal(persisted.p79SystemSettingsV1.notice.text,'');
 assert.equal(local.get('port79_theme'),'light');
 assert.equal(local.get('port79_year_mode'),'gregorian');
 assert.match(field('status').textContent,/讀回確認/);
}

(async function(){
 await simulate('superadmin');await simulate('admin');
 console.log('PASS settings: all controls, real module destinations, cloud health, update, reload, restore success/failure, original config retained, local preferences, superadmin access gate, normal-admin denial');
})().catch(e=>{console.error(e);process.exitCode=1});
