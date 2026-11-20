'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-windows-download.js','utf8');
const home=fs.readFileSync('index.html','utf8');
function unit(){
 const storage=new Map(),listeners=new Map(),observed=[];
 const nodes={
  p79WindowsDownloadLink:{hidden:true,href:'',addEventListener(type,fn){listeners.set('link:'+type,fn)}},
  sessionBar:{classList:{contains:name=>name==='show'&&visible}},
  systems:{classList:{contains:name=>name==='show'&&visible}}
 };
 let visible=false;
 const document={getElementById:name=>nodes[name],addEventListener:(name,fn)=>listeners.set('document:'+name,fn)};
 const window={addEventListener:(name,fn)=>listeners.set('window:'+name,fn)};
 class MutationObserver{constructor(cb){this.cb=cb;observed.push(cb)}observe(){}}
 const sessionStorage={getItem:k=>storage.get(k)||null};
 const ctx={document,window,sessionStorage,MutationObserver,Set,JSON};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 function change(role,sessionShown=true,punchOnly=false,token='TOKEN'){
  visible=sessionShown;
  if(role)storage.set('port79_user_session',JSON.stringify({empId:'TEST',adminRole:role,punchOnly}));
  else storage.delete('port79_user_session');
  if(token)storage.set('port79_user_token',token);
  else storage.delete('port79_user_token');
  for(const fn of observed)fn();
 }
 return {nodes,storage,change,listeners};
}
{
 const s=unit(),a=s.nodes.p79WindowsDownloadLink;
 assert(a.hidden,'Must not display before login');
 assert.equal(typeof s.listeners.get('link:click'),'function');
 assert.equal(typeof s.listeners.get('window:pageshow'),'function');
 s.change('employee',true);assert(a.hidden,'Employee cannot see admin Windows control');
 s.change('admin',false);assert(a.hidden,'Session data without real homepage session is not login');
 s.change('admin',true,false,'');assert(a.hidden,'Missing token hides download button');
 s.change('admin',true);assert(!a.hidden,'Logged in admin sees download button');
 assert.match(a.href,/^https:\/\/github\.com\/kuo-code-tw\/smart-punch\/releases\/download\/port79-windows-lite-20261120\/Port79-Windows-Lite\.zip$/);
 let prevented=false;s.listeners.get('link:click')({preventDefault(){prevented=true}});assert(!prevented,'Approved manager can click link');
 s.change('superadmin',true);assert(!a.hidden,'Logged in superadmin sees download button');
 s.change('superadmin',true,true);assert(a.hidden,'Punch-only session cannot download');
 prevented=false;s.listeners.get('link:click')({preventDefault(){prevented=true}});assert(prevented,'Click rejected on revoked manager session');
 s.change(null,false,false,'');assert(a.hidden,'Logout hides link');
}
assert(home.includes('id="p79WindowsDownloadLink"'),'Original authenticated session bar must include link');
assert(home.includes('id="logoutBtn"'),'Original logout button must remain');
assert(home.includes('id="loginBox"'),'Original login box must remain');
assert(home.includes('id="systems"'),'Original system page remains');
assert(home.includes('assets/port79-windows-download.js?v=20261120-manager-release-v1'));
assert(home.includes('p79-windows-download-link[hidden]{display:none!important}'));
assert(!source.includes('window.open(')&&!source.includes('fetch(')&&!source.includes('location.href='),'Control never auto-downloads or triggers cloud requests');
console.log('PASS Windows download: hidden before login, admin/superadmin only, requires token and visible session, hide on logout, no auto download, original systems preserved');
