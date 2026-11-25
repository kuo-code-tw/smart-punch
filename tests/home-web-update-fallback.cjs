'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('assets/port79-login-version-check.js','utf8');
const web='https://kuo-code-tw.github.io/smart-punch/';
const commit='1234567890abcdef1234567890abcdef12345678';
const version='V261125.'+(parseInt(commit.slice(0,8),16)%100000).toString().padStart(5,'0');
function fixture({href=web,fail=false,invalid=false,offline=false,busy=false}={}){
 const calls=[],redirects=[],messages=[],stored=new Map([['keep','local data']]);
 const status={set textContent(v){messages.push(v)},title:''};
 const window={location:{href,replace:v=>redirects.push(v)},navigator:{onLine:!offline},
  sessionStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
  document:{readyState:'loading',addEventListener(){},hidden:false,activeElement:busy?{tagName:'INPUT'}:null,getElementById:k=>k==='p79LoginVersionStatus'?status:null},
  setTimeout:()=>0,clearTimeout(){},fetch:async url=>{calls.push(url);if(fail)return{ok:false,status:503};
   if(url.includes('api.github.com'))return{ok:true,json:async()=>({tag_name:'port79-windows-lite-20261125-'+commit.slice(0,12)})};
   return{ok:true,json:async()=>({version:invalid?'bad':version,commit})};}};
 const module={exports:{}};new Function('window','module','URL','AbortController',src)(window,module,URL,AbortController);
 return {api:module.exports,calls,redirects,messages,stored,status};
}
(async()=>{
 let f=fixture();let r=await f.api.check(true);
 assert.equal(r.web.version,version);assert.equal(f.calls.length,1);assert.equal(f.redirects.length,0);
 await f.api.startUpdate();assert.equal(f.redirects.length,1);assert.equal(new URL(f.redirects[0]).searchParams.get('_homeUpdated'),version);
 f=fixture({fail:true});r=await f.api.check(true);assert.equal(r.web,null);assert.equal(r.webError,'HTTP 503');assert.equal(f.redirects.length,0);
 await f.api.startUpdate();assert.equal(f.redirects.length,1);assert.equal(new URL(f.redirects[0]).searchParams.has('_homeUpdated'),false);assert(new URL(f.redirects[0]).searchParams.has('_updateAt'));assert.equal(f.stored.get('keep'),'local data');
 f=fixture({invalid:true});await f.api.startUpdate();assert.equal(f.redirects.length,1);assert.equal(new URL(f.redirects[0]).searchParams.has('_homeUpdated'),false);
 f=fixture({fail:true,offline:true});await f.api.startUpdate();assert.equal(f.redirects.length,0);assert(f.messages.some(x=>x.includes('網路未連線')));
 f=fixture({busy:true});f.stored.set('p79_loaded_home_build_v1','V261124.00000');await f.api.check(true);assert.equal(f.redirects.length,0);
 f=fixture({href:'https://local.example/?windowsBundle='+version,fail:true});await f.api.startUpdate();assert.equal(f.redirects.length,0);
 f=fixture({href:'https://other.example/',fail:true});await f.api.check(true);assert.equal(f.calls.length,2);
 console.log('PASS same-manifest deduplication, manual reload on HTTP/format failure, offline retention, safe automatic refresh, native isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
