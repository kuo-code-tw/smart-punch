'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-route-name-autofill.js','utf8');
const catalog=JSON.parse(fs.readFileSync('data-sources/route-service-names.json','utf8'));
assert.equal(Object.keys(catalog.routes).length,15);
const fetches=[],events=[],memory=new Map();
const window={localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},
 fetch:async(u)=>{fetches.push(u);return {ok:true,json:async()=>catalog}},
 Event:class{constructor(type){this.type=type}},dispatchEvent:e=>events.push(e.type)};
const ctx={window,Date,Promise,console,Error,Object,String};
vm.createContext(ctx);vm.runInContext(source,ctx);
(async()=>{
 assert.equal(window.P79RouteNameAuto.lookup('JSH'),'','not loaded before request');
 const [one,two]=await Promise.all([window.P79RouteNameAuto.ensure(),window.P79RouteNameAuto.ensure()]);
 assert.equal(fetches.length,1,'concurrent renders share one request');
 assert.equal(one,true);
 for(const c of ['JSH','JTS','KVS','NT2','TPS'])assert.equal(window.P79RouteNameAuto.lookup(c),catalog.routes[c].zh);
 assert.equal(window.P79RouteNameAuto.lookup('UNSEEN'),'');
 assert(events.includes('p79-route-name-updated'),'redraw after catalog update');
 await window.P79RouteNameAuto.ensure();
 assert.equal(fetches.length,1,'no repeated reads while data is fresh');
 const data={...catalog,routes:{...catalog.routes,ABC:{zh:'中國－東南亞新航線',source:'https://example.com'}}};
 window.P79RouteNameAuto._apply(data);
 assert.equal(window.P79RouteNameAuto.lookup('ABC'),'中國－東南亞新航線','future catalogue additions appear without UI edits');
 window.P79RouteNameAuto._apply({schema_version:1,routes:{BAD:{zh:'<script>BAD</script>'}}});
 assert.equal(window.P79RouteNameAuto.lookup('BAD'),'','invalid source must not inject HTML');
 console.log('PASS 15 routes, concurrency, daily cache, new-code auto-fill and unsafe name rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
