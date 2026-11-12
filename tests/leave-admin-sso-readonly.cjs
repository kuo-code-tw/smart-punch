'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('leave/index.html','utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n}',a)+2);}
function setup(){
 let token='valid',employeeEntry=false,mode='',calls=[],message='';
 const nodes={};const c={Date,JSON,String,Error,Promise,encodeURIComponent,console:{warn(){}},adminToken:'',adminSession:null,leaveAccess:'none',GAS_URL:'https://test.invalid/exec',
 storedToken:()=>token,p79LeaveEmployeeEntry:()=>employeeEntry,setStatus:m=>message=m,
 $:id=>nodes[id]||(nodes[id]={textContent:'',classList:{remove(){},toggle(){}}}),
 history:{replaceState(){}},location:{pathname:'/leave/',search:''},setTimeout:fn=>fn(),
 switchMode:m=>mode=m,p79UpdateLeaveHandoffBanner(){},level:(v,d)=>['none','view','manage'].includes(v)?v:d,
 jsonFetch:async url=>{calls.push(url);if(new URL(url).searchParams.get('action')!=='getSessionMeta')throw Error('雲端正在同步管理員資料，請稍後重試 SSO 驗證');return{ok:true,empId:'AP1',name:'測試',adminRole:'admin',systemPermissions:{leave:'manage'},finePermissions:{leave:{'records.edit':true}}}}};
 vm.createContext(c);for(const name of ['perms','restoreAdmin'])vm.runInContext(fn(name),c);
 return{c,calls,setToken:t=>token=t,employee:()=>employeeEntry=true,mode:()=>mode,message:()=>message};
}
(async()=>{
 let x=setup();assert.equal(await x.c.restoreAdmin(),true);assert.equal(x.calls.length,1);assert.equal(new URL(x.calls[0]).searchParams.get('token'),'valid');assert.equal(x.mode(),'admin');assert.equal(x.c.leaveAccess,'manage');assert(x.c.adminSession.finePermissions.leave['records.edit']);
 for(const data of [{ok:true,adminRole:'employee',systemPermissions:{leave:'manage'}},{ok:true,adminRole:'admin',systemPermissions:{leave:'none'}},{ok:true,adminRole:'admin',punchOnly:true,systemPermissions:{leave:'manage'}},{ok:false,error:'登入驗證已逾時'}]){x=setup();x.c.jsonFetch=async()=>data;assert.equal(await x.c.restoreAdmin(),false);assert.equal(x.c.adminSession,null);assert.equal(x.mode(),'');}
 x=setup();let tries=0;const read=x.c.jsonFetch;x.c.jsonFetch=async url=>{if(!tries++)throw Error('network busy');return read(url)};assert.equal(await x.c.restoreAdmin(),true);assert.equal(tries,2);
 x=setup();x.c.jsonFetch=async()=>{x.setToken('new-account');return{ok:true,empId:'OLD',adminRole:'superadmin'}};assert.equal(await x.c.restoreAdmin(),false);assert.equal(x.c.adminSession,null);
 x=setup();x.c.jsonFetch=async()=>{x.employee();return{ok:true,empId:'OLD',adminRole:'superadmin'}};assert.equal(await x.c.restoreAdmin(),false);assert.equal(x.mode(),'');
 x=setup();const newer={empId:'NEW',adminRole:'admin'};x.c.jsonFetch=async()=>{x.setToken('new-token');x.c.adminSession=newer;x.c.adminToken='new-token';throw Error('old request failed')};assert.equal(await x.c.restoreAdmin(),false);assert.equal(x.c.adminSession,newer);assert.equal(x.c.adminToken,'new-token');
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
 console.log('PASS leave admin SSO: bulk-admin-sync independence, server role and leave scope, fine permissions, punch-only denial, expired token, bounded retry, identity/entry races and stale failure preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
