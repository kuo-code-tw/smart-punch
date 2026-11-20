'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-session-timeout.js','utf8');
const MockDate=class extends Date{static now(){return 10000000;}};
function scenario({origin='https://port79assets.example',webview=false,pathname='/smart-punch/hr/index.html'}={}){
 const session=new Map([
  ['port79_user_token','VALID_TEST_TOKEN'],
  ['port79_user_session',JSON.stringify({empId:'TEST',adminRole:'admin',loginAt:'now'})]
 ]),local=new Map(),registered=new Map(),intervals=[],navigations=[];
 const storage=map=>({
  getItem:key=>map.has(key)?map.get(key):null,
  setItem:(key,val)=>map.set(key,String(val)),
  removeItem:key=>map.delete(key)
 });
 const url=origin+pathname;
 const loc={origin,pathname,href:url,replace(next){navigations.push(next)}};
 const document={
  readyState:'loading',
  currentScript:{src:origin+'/smart-punch/assets/port79-session-timeout.js'},
  getElementById:id=>id==='p79IdleSettingsDialog'?{}:null,
  addEventListener(type,fn){registered.set(type,fn)}
 };
 const window={
  addEventListener(type,fn){registered.set(type,fn)},
  ...(webview?{chrome:{webview:{postMessage(){}}}}:{})
 };
 const sandbox={
  window,document,location:loc,
  sessionStorage:storage(session),localStorage:storage(local),
  console,URL,Math,Date:MockDate,
  setInterval(fn,ms){intervals.push({fn,ms});return intervals.length},
  setTimeout(fn){return 1},clearTimeout(){},
  fetch:async()=>({ok:true,json:async()=>({ok:true,config:{p79_hr_idle_logout_minutes_v1:5}})}),
  AbortController,TextEncoder,TypeError
 };
 vm.createContext(sandbox);
 vm.runInContext(source,sandbox);
 assert.equal(typeof registered.get('DOMContentLoaded'),'function');
 registered.get('DOMContentLoaded')();
 const old=MockDate.now()-6*60000;
 sandbox.sessionStorage.setItem('port79_idle_last_activity_v1',String(old));
 for(const key of local.keys())if(key.startsWith('port79_idle_last_activity_v1_'))local.set(key,String(old));
 return {window,session,local,intervals,navigations,registered};
}
async function main(){
 let x=scenario({webview:true});
 assert.equal(x.window.Port79IdleLogout.desktopExempt(),true);
 assert.equal(x.intervals.length,0,'Native app has no hourly/second idle watcher');
 assert.equal(x.navigations.length,0);
 assert.equal(x.session.get('port79_user_token'),'VALID_TEST_TOKEN');
 assert.equal(x.local.has('port79_idle_logout_config_v1'),false,'Desktop does not rewrite global timeout config');
 x=scenario({origin:'https://kuo-code-tw.github.io',webview:false});
 assert.equal(x.window.Port79IdleLogout.desktopExempt(),false);
 assert.equal(x.intervals.length,1,'Ordinary website retains idle timer');
 x.intervals[0].fn();
 assert.equal(x.navigations.length,1,'Idle web user is logged out');
 assert.match(x.navigations[0],/logout=1&idle=1/);
 assert.equal(x.session.has('port79_user_token'),false);
 x=scenario({origin:'https://kuo-code-tw.github.io',webview:true});
 assert.equal(x.window.Port79IdleLogout.desktopExempt(),false,'A synthetic WebView bridge on public website cannot bypass timeout');
 x.intervals[0].fn();
 assert.equal(x.navigations.length,1);
 x=scenario({webview:false});
 assert.equal(x.window.Port79IdleLogout.desktopExempt(),false,'Plain browser cannot use Windows virtual-host exemption');
 x.intervals[0].fn();
 assert.equal(x.navigations.length,1);
 const hr=fs.readFileSync('hr/index.html','utf8');
 assert.match(hr,/port79-session-timeout\.js\?v=20261120-desktop-idle-exempt-v1/);
 assert.match(source,/Windows 電腦版不受此閒置時間限制/);
 console.log('PASS Windows WebView2 ignores idle timer; browser retains timeout; role/policy unchanged; HR asset cache busted');
}
main().catch(e=>{console.error(e);process.exitCode=1});
