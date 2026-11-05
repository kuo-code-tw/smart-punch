'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('async function readJson('),html.indexOf('async function verifySession('));
function setup(fetch){const calls=[];const c={fetch:async(...args)=>{calls.push(args);return fetch(...args)},AbortController,URLSearchParams,Promise,Error,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,20)),clearTimeout,GAS_URL:'https://example.invalid/exec'};vm.createContext(c);vm.runInContext(source,c);return {c,calls};}
const response=data=>({ok:true,status:200,text:async()=>JSON.stringify(data)});
(async()=>{
 let x=setup(async()=>response({ok:true,adminRole:'admin',userToken:'verified'}));assert.equal((await x.c.verifyUser('234','secret','manage')).userToken,'verified');assert.equal(x.calls.length,1);
 x=setup(async()=>({ok:true,status:200,text:()=>new Promise(()=>{})}));await assert.rejects(x.c.verifyUser('234','secret','manage'),/逾時/);assert.equal(x.calls.length,1,'stalled response body must not trigger duplicate authentication');
 x=setup(async()=>new Promise(()=>{}));await assert.rejects(x.c.verifyUser('234','secret','manage'),/逾時/);assert.equal(x.calls.length,1);
 x=setup(async()=>response({ok:false,error:'密碼不正確'}));await assert.rejects(x.c.verifyUser('234','wrong','manage'),/密碼不正確/);assert.equal(x.calls.length,1);
 x=setup(async()=>response({ok:false,error:'雲端忙碌',retryable:true}));await assert.rejects(x.c.verifyUser('234','secret','manage'),/雲端忙碌/);assert.equal(x.calls.length,1);
 let n=0;x=setup(async()=>response(n++?{ok:true,user:{adminRole:'admin',userToken:'valid'}}:{ok:false,error:'unknown action'}));assert.equal((await x.c.verifyUser('234','secret','manage')).userToken,'valid');assert.equal(x.calls.length,2);assert.equal(new URLSearchParams(x.calls[1][1].body).get('action'),'verifyUser');
 for(const file of ['index.html','attendance/index.html'])for(const match of fs.readFileSync(file,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1],{filename:file});
 console.log('PASS login headers/body deadlines, no duplicate timed-out/denied authentication, explicit legacy action fallback, inline syntax');
})().catch(e=>{console.error(e);process.exitCode=1});
