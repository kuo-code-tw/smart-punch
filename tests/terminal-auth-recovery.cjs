'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const shared=fs.readFileSync('assets/port79-seven-top.js','utf8');
function fn(source,name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start);assert(start>=0&&end>start,name);return source.slice(start,end+2);}
const storage=new Map([['port79_user_token','current-home-token'],['port79_gc_superadmin_token','old-module-token']]);
const nodes=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,{dataset:{},hidden:false,disabled:false,classList:{add(){},remove(){}}});return nodes.get(id);}
const c={console,Date,Promise,AbortController,setTimeout:(fn,ms)=>{if(ms<1000)queueMicrotask(fn);return 1;},clearTimeout(){},GC_SESSION_TOKEN_KEY:'port79_gc_superadmin_token',GC_LEGACY_TOKEN_KEY:'port79_gc_token',sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},readPort79SsoTokenFromHash:()=>'',document:{getElementById:node},p79EfficiencyRecentlyVerifiedToken:'',p79EfficiencyRecentlyVerifiedAt:0,getGasUrl:()=> 'https://example.invalid/exec',readGcSsoJson:async x=>x,efficiencyPermissionFromData:d=>d.adminRole==='superadmin'?'manage':d.systemPermissions?.efficiency||'none'};
vm.createContext(c);
for(const name of ['currentPort79SsoToken','loadGcSession','showGcAccessDenied','verifyGcSsoToken'])vm.runInContext((name==='verifyGcSsoToken'?'async ':'')+fn(html,name),c);
vm.runInContext(fn(shared,'p79IsReturnHome'),c);
(async()=>{
 assert.equal(c.currentPort79SsoToken(),'current-home-token');assert.equal(c.loadGcSession(),'current-home-token');
 assert.equal(storage.get('port79_gc_superadmin_token'),'current-home-token');
 assert.equal(c.p79IsReturnHome({dataset:{p79PreserveSession:'1'},textContent:'返回首頁'}),false,'return home must not be intercepted as logout');
 assert.equal(c.p79IsReturnHome({dataset:{},textContent:'登出系統'}),true,'explicit logout remains available');
 c.showGcAccessDenied('pending',true);assert.equal(node('gcAuthRetry').hidden,false);assert.equal(node('gcAccessDenied').dataset.transient,'1');
 c.showGcAccessDenied('denied',false);assert.equal(node('gcAuthRetry').hidden,true);
 for(const error of ['雲端正在同步管理員資料，請稍後重試 SSO 驗證','unknown backend error']){
  c.fetch=async()=>({ok:false,error});await assert.rejects(c.verifyGcSsoToken('fixture'),e=>e.ssoAuthRejected===false);
 }
 for(const error of ['登入驗證已逾時，請重新登入','登入驗證資料失效，請重新登入','找不到此員工帳號','此帳號目前沒有管理員權限']){
  c.fetch=async()=>({ok:false,error});await assert.rejects(c.verifyGcSsoToken('fixture'),e=>e.ssoAuthRejected===true);
 }
 c.fetch=async()=>({ok:true,adminRole:'admin',systemPermissions:{efficiency:'none'}});await assert.rejects(c.verifyGcSsoToken('fixture'),e=>e.ssoAuthRejected===true);
 c.fetch=async()=>({ok:true,adminRole:'superadmin'});assert.equal((await c.verifyGcSsoToken('fixture')).efficiencyAccessLevel,'manage');
 let release,calls=0,applied=0;
 Object.assign(c,{p79EfficiencyAuthRecoveryBusy:false,p79EfficiencyAuthReady:false,p79EfficiencyAuthRetryTimer:null,initGcPage:async()=>{calls++;await new Promise(r=>release=r);c.p79EfficiencyAuthReady=true;},applyEfficiencyAccessUi(){applied++;},p79QueueEfficiencyAuthRecovery(){}});
 vm.runInContext('async '+fn(html,'p79RetryEfficiencyAuth'),c);
 const first=c.p79RetryEfficiencyAuth();await c.p79RetryEfficiencyAuth();assert.equal(calls,1,'retry clicks cannot overlap');release();await first;assert.equal(applied,1);assert.equal(node('gcAuthRetry').disabled,false);
 assert.match(html,/data-p79-preserve-session="1"/);
 console.log('PASS terminal auth: current token, temporary failure keeps auth blocked without logout, explicit denial, return-home session preservation and non-overlapping retry');
})().catch(e=>{console.error(e);process.exitCode=1;});
