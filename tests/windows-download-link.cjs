'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-windows-download.js','utf8');
const home=fs.readFileSync('index.html','utf8');
const latest='https://github.com/kuo-code-tw/smart-punch/releases/latest/download/Port79-Windows-Lite.zip';
const tag='port79-windows-lite-20261121-464f4886cd3c';
const unique='Port79-Windows-Lite-464f4886cd3c.zip';
const immutable='https://github.com/kuo-code-tw/smart-punch/releases/download/'+tag+'/'+unique;
function unit(options={}){
 const storage=new Map(),listeners=new Map(),observed=[],requests=[];
 const topUser={};const toolbar={querySelector:()=>topUser,insertBefore(el){el.parentNode=this;}};
 const nodes={
  p79WindowsDownloadLink:{hidden:true,href:'',textContent:'',title:'',addEventListener(type,fn){listeners.set('link:'+type,fn)}},
  sessionBar:{classList:{contains:name=>name==='show'&&visible}},
  systems:{classList:{contains:name=>name==='show'&&visible}}
 };
 let visible=false;
 const document={getElementById:name=>nodes[name],querySelector:()=>toolbar,addEventListener:(name,fn)=>listeners.set('document:'+name,fn)};
 const window={addEventListener:(name,fn)=>listeners.set('window:'+name,fn),setInterval:()=>1,clearInterval(){},
  fetch:async(url,init)=>{
   requests.push({url,init});
   if(options.fail)throw Error('GitHub unavailable');
   const name=options.noUnique?'Port79-Windows-Lite.zip':unique;
   const urlAsset='https://github.com/kuo-code-tw/smart-punch/releases/download/'+tag+'/'+name;
   return {ok:true,json:async()=>({
    tag_name:tag,draft:false,
    assets:[{name,browser_download_url:urlAsset,size:2857430,digest:'sha256:'+'a'.repeat(64)}]
   })};
  }
 };
 class MutationObserver{constructor(cb){this.cb=cb;observed.push(cb)}observe(){}}
 const sessionStorage={getItem:k=>storage.get(k)||null};
 const ctx={document,window,sessionStorage,MutationObserver,Set,JSON,Date,Number,String,Error};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 function change(role,sessionShown=true,punchOnly=false,token='TOKEN'){
  visible=sessionShown;
  if(role)storage.set('port79_user_session',JSON.stringify({empId:'TEST',adminRole:role,punchOnly}));
  else storage.delete('port79_user_session');
  if(token)storage.set('port79_user_token',token);
  else storage.delete('port79_user_token');
  for(const fn of observed)fn();
 }
 return {nodes,toolbar,storage,change,listeners,requests};
}
(async()=>{
 const s=unit(),a=s.nodes.p79WindowsDownloadLink;
 assert(a.hidden,'Must not display before login');
 assert.equal(typeof s.listeners.get('link:click'),'function');
 assert.equal(typeof s.listeners.get('window:pageshow'),'function');
 s.change('employee',true);assert(a.hidden,'Employee cannot see admin Windows control');
 s.change('admin',false);assert(a.hidden,'A session without displayed manager access is not login');
 s.change('admin',true,false,'');assert(a.hidden,'Missing token hides download');
 s.change('admin',true);assert(!a.hidden,'Logged-in admin can see download');
 assert.equal(a.parentNode,s.toolbar,'Link must appear in the management toolbar');
 await new Promise(setImmediate);
 assert.equal(a.href,immutable,'Latest metadata must choose immutable version-stamped ZIP');
 assert.match(a.textContent,/V2026\.11\.21-464f4886cd3c/,'Download shows full V date and exact release hash');
 assert.equal(s.requests.length,1,'Only one public release lookup after login');
 assert.match(s.requests[0].url,/api.github.com\/repos\/kuo-code-tw\/smart-punch\/releases\/latest/);
 assert.equal(s.requests[0].init.credentials,'omit','Never attach private login credentials to GitHub');
 let prevented=false;s.listeners.get('link:click')({preventDefault(){prevented=true}});
 assert(!prevented,'Allowed manager may click download link');
 s.change('superadmin',true);assert(!a.hidden);
 const compact={querySelector:()=>null,insertBefore(element){element.parentNode=this;}};
 s.nodes.p79HomeCompactActions=compact;s.change('admin',true);
 assert.equal(a.parentNode,compact,'Keep original link beside History in compact toolbar');
 s.change('superadmin',true,true);assert(a.hidden,'Punch-only sessions cannot download');
 prevented=false;s.listeners.get('link:click')({preventDefault(){prevented=true}});
 assert(prevented,'Revoked manager session is blocked');
 s.change(null,false,false,'');assert(a.hidden,'Logout hides link');

 const fallback=unit({fail:true});fallback.change('admin',true);
 await new Promise(setImmediate);
 assert.equal(fallback.nodes.p79WindowsDownloadLink.href,latest,'On API failure use GitHub latest redirect, never legacy tag');
 const legacyRelease=unit({noUnique:true});legacyRelease.change('admin',true);
 await new Promise(setImmediate);
 assert.equal(legacyRelease.nodes.p79WindowsDownloadLink.href,
  'https://github.com/kuo-code-tw/smart-punch/releases/download/'+tag+'/Port79-Windows-Lite.zip',
  'An older release without unique filename still uses its immutable tag');

 assert(home.includes('id="p79WindowsDownloadLink"'),'Original authenticated link remains');
 assert(home.includes('id="logoutBtn"'),'Logout remains');
 assert(home.includes('id="loginBox"'),'Login remains');
 assert(home.includes('id="systems"'),'System homepage remains');
 assert(home.includes('assets/port79-windows-download.js?v=20261121-human-v4'));
 assert(home.includes('assets/port79-home-compact-controls.css?v=20261121-v1'));
 assert(home.includes('assets/port79-home-compact-controls.js?v=20261121-v1'));
 assert(home.includes('p79-windows-download-link[hidden]{display:none!important}'));
 assert(!source.includes('window.open(')&&!source.includes('location.href='),
  'Download control must not silently open windows or redirect the homepage');
 assert.match(source,/credentials:'omit'/,'Public metadata never includes private credentials');
 const compactCss=fs.readFileSync('assets/port79-home-compact-controls.css','utf8');
 assert.match(compactCss,/p79HomeCompactActions #p79WindowsDownloadLink:not\(\[hidden\]\)/);
 assert.match(home,/aria-label="系統下載（Windows 完整程式 ZIP）"/);
 console.log('PASS Windows download: immutable versioned asset, version label, no stale tag, permission protections, safe fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});
