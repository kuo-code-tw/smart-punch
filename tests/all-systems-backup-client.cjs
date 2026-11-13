'use strict';
const fs=require('fs'),vm=require('vm'),a=require('assert/strict'),crypto=require('crypto');
const code=fs.readFileSync('assets/port79-all-backup.js','utf8');
function setup(options={}){
 const store=new Map([['port79_user_session',JSON.stringify({empId:'FIXTURE',adminRole:'superadmin',systemPermissions:{history:'manage'}})],['port79_user_token','fixture-token'],['port79_gas_url','https://script.google.com/macros/s/fixture/exec']]);const local=new Map(),nodes=new Map(),requests=[];let fail=options.fail,hold=null;
 const node=()=>({hidden:false,disabled:false,textContent:'',children:[],append(...v){this.children.push(...v);},appendChild(v){this.children.push(v);},replaceChildren(){this.children=[];},addEventListener(){}});
 const window={document:{readyState:'loading',addEventListener(){},getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node},sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},crypto:{subtle:crypto.webcrypto.subtle,randomUUID:crypto.randomUUID},setTimeout,clearTimeout,btoa:s=>Buffer.from(s,'binary').toString('base64'),fetch:async(url,init)=>{
  const payload=init.body?JSON.parse(init.body):{action:'capabilities'};requests.push(payload);if(hold)await hold;
  if(!init.body)return {ok:true,json:async()=>({ok:true,allSystemsBackupVersion:options.old?undefined:1,groups:window.Port79AllBackup.types})};
  if(payload.type===fail)return {ok:true,json:async()=>({ok:false,error:'測試分類未完成'})};
  return {ok:true,json:async()=>({ok:true,verified:!options.unverified,sourceUnchanged:true,type:payload.type,requestId:payload.requestId,backupId:'fixture-file',backupUrl:options.badLink?'https://untrusted.invalid/leak':'https://docs.google.com/spreadsheets/d/fixture-file/edit',rows:2})};
 }};const context={window,URL,AbortController,TextEncoder,console};vm.runInNewContext(code,context);return {window,store,local,nodes,requests,fail:v=>fail=v,hold:v=>hold=v};
}
(async()=>{
 const homepage=fs.readFileSync('index.html','utf8');
 const historyPosition=homepage.indexOf('id="cardHistory"');
 const backupPosition=homepage.indexOf('id="p79AllBackupPanel"');
 const preservePosition=homepage.indexOf('class="p79-modern-home-preserve"');
 a(historyPosition>=0&&historyPosition<backupPosition&&backupPosition<preservePosition,'one backup button belongs below the History Database card in the main homepage');
 a.equal((homepage.match(/id="p79AllBackupButton"/g)||[]).length,1,'only one backup button remains');
 a.match(homepage,/<button type="button" id="p79AllBackupButton">備份資料庫<\/button>/,'the requested concise button label is exact');
 a(!homepage.includes('p79AllBackupHeading'),'old backup title and note card removed');
 a.match(homepage,/id="p79AllBackupFeedback" hidden/,'no notes, progress or results before the backup button is clicked');
 a.match(code,/if\(feedback\)feedback.hidden=false/,'click reveals verified feedback without adding default homepage notes');
 let t=setup();await t.window.Port79AllBackup.start();a.equal(t.requests.length,14);a.equal(new Set(t.requests.slice(1).map(x=>x.type)).size,13);a.match(t.nodes.get('p79AllBackupStatus').textContent,/全部分類已備份並核對完成/);
 t=setup({fail:'leave'});await t.window.Port79AllBackup.start();a.match(t.nodes.get('p79AllBackupStatus').textContent,/12\/13/);const id=t.requests.find(x=>x.type==='leave').requestId;t.fail('');await t.window.Port79AllBackup.start();a.equal(t.requests.filter(x=>x.type==='leave').length,2);a.equal(t.requests.at(-1).requestId,id);a.equal(t.requests.filter(x=>x.type==='attendance').length,1);a.match(t.nodes.get('p79AllBackupStatus').textContent,/全部分類已備份/);
 t=setup({old:true});await t.window.Port79AllBackup.start();a.equal(t.requests.length,1);a.match(t.nodes.get('p79AllBackupStatus').textContent,/尚未啟用/);
 t=setup({badLink:true});await t.window.Port79AllBackup.start();a.doesNotMatch(t.nodes.get('p79AllBackupStatus').textContent,/全部分類已備份/);
 t=setup({unverified:true});await t.window.Port79AllBackup.start();a.equal(t.nodes.get('p79AllBackupProgress').value,0);
 t=setup();let release;t.hold(new Promise(r=>release=r));const first=t.window.Port79AllBackup.start();await t.window.Port79AllBackup.start();a.equal(t.requests.length,1);t.store.set('port79_user_token','different-token');release();await first;a.equal(t.requests.length,1,'account change stops all writes');
 t=setup();t.store.set('port79_user_session',JSON.stringify({empId:'FIXTURE',adminRole:'superadmin',systemPermissions:{}}));t.window.Port79AllBackup.refresh();a.equal(t.nodes.get('p79AllBackupPanel').hidden,false,'legacy superadmin session without history field must show backup panel');await t.window.Port79AllBackup.start();a.equal(t.requests.length,14,'legacy authorized superadmin may request the guarded all-system backup');
 t=setup();t.store.set('port79_user_session',JSON.stringify({empId:'FIXTURE',adminRole:'admin',systemPermissions:{history:'manage'}}));t.window.Port79AllBackup.refresh();a.equal(t.nodes.get('p79AllBackupPanel').hidden,false,'admin can see backup entry and understand access restriction');a.equal(t.nodes.get('p79AllBackupButton').disabled,true,'non-superadmin cannot run full backup');await t.window.Port79AllBackup.start();a.equal(t.requests.length,0,'admin must not issue backup request');
 t=setup();t.store.set('port79_user_session',JSON.stringify({empId:'FIXTURE',adminRole:'employee'}));await t.window.Port79AllBackup.start();a.equal(t.requests.length,0);
 t.window.Port79AllBackup.refresh();a.equal(t.nodes.get('p79AllBackupPanel').hidden,true,'regular staff must not see the full database backup');
 a.match(fs.readFileSync('index.html','utf8'),/if\(role==='superadmin'\)return\{[^\n]*history:'manage'/,'homepage normalized superadmin session includes history.manage');
 t=setup();t.local.set('p79_yard_private_v1_OTHER',JSON.stringify({rows:[{date:'2026-11-01',heavyTotal:99}]}));t.local.set('p79_yard_private_v1_FIXTURE',JSON.stringify({rows:[{date:'2026-11-02',heavyTotal:2}],fileName:'fixture.xlsx',updatedAt:'fixture'}));await t.window.Port79AllBackup.start();const yard=t.requests.find(x=>x.type==='yard').yard;a.equal(yard.rows.length,1);a.equal(yard.rows[0].heavyTotal,2);a.equal(t.local.has('port79_user_token'),false);
 console.log('PASS all-system client: all categories, old-backend guard, verified-only success, retry only failed with stable IDs, double-click/account guards, safe links and account-scoped yard data');
})().catch(e=>{console.error(e);process.exit(1);});
