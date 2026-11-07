'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const cacheSrc=fs.readFileSync('assets/port79-data-cache.js','utf8');
const pager=fs.readFileSync('assets/port79-efficiency-week-month-pager.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const slice=(src,start,end)=>{const a=src.indexOf(start),b=src.indexOf(end,a);assert(a>=0&&b>a,start+' source is available');return src.slice(a,b);};
(async()=>{
 const stamp=Date.now(),month='2026-11',u='https://script.google.com/macros/s/test/exec?action=historyGetMonthData&type=vessel&month='+month;
 let stored={key:'source',savedAt:stamp-120001,data:{ok:true,month,shipMasters:[]}},getCalls=0;
 const env={URL,Date,cacheFreshTtl:()=>120000,actionKey:()=>stored.key,urlInfo:url=>({action:'historyGetMonthData',u:new URL(url)}),viewerKey:()=> 'employee-1',token:()=> 'secret',mutationStamp:()=>0,
  get:async()=>{getCalls++;return stored;}};
 vm.createContext(env);
 vm.runInContext(slice(cacheSrc,'async function getHistoryPreview(url){','const rawFetch='),env);
 assert.equal(await env.getHistoryPreview(u),null,'older than two minutes is not served forever');
 stored.savedAt=Date.now()-5000;
 assert.equal((await env.getHistoryPreview(u)).month,month,'recent offline preview remains available');
 assert.equal(await env.getHistoryPreview(u.replace('2026-11','2026-10')),null,'wrong-month snapshots remain rejected');
 const calls=[],result={vessels:[{workingNo:'LIVE',date:'2026-11-08',rate:22,containers:110}]};
 const ctx={cache:new Map([[month,[{workingNo:'STALE'}]]]),fetchedAt:new Map([[month,Date.now()-120001]]),inflight:new Map(),sessionKey:'session',SOURCE_TTL_MS:120000,LIVE_TTL_MS:120000,HISTORY_TTL_MS:900000,
  taipeiToday:()=> '2026-11-08',Date,URL,Map,Number,Error,Array,
  g:{P79HistoryRead:{read:async(url,opts)=>{calls.push({url,opts});return {ok:true,month,shipMasters:result.vessels};}}},
  model:{analyzeVessels:()=>result}};
 vm.createContext(ctx);
 vm.runInContext(slice(pager,'function freshMonth(ym){','var style='),ctx);
 vm.runInContext(slice(pager,'async function fetchMonth(ym,session){','function daily(p){'),ctx);
 const session={allowed:true,token:'token',gas:'https://script.google.com/macros/s/test/exec'};
 const fresh=await ctx.fetchMonth(month,session);
 assert.equal(fresh[0].workingNo,'LIVE','expired in-memory GPH month rechecks real cloud source');
 assert.equal(calls.length,1);assert.equal(calls[0].opts.forceCloud,true,'the active month bypasses stale historical preview');
 await ctx.fetchMonth(month,session);assert.equal(calls.length,1,'fresh data is reused within bounded TTL');
 assert(ctx.fetchedAt.get(month)>Date.now()-3000,'cloud success timestamps the new data');
 assert(html.includes('port79-data-cache.js?v=20261108-history-freshness-v1'));
 assert(html.includes('port79-efficiency-week-month-pager.js?v=20261108-source-freshness-v1'));
 console.log('PASS home chart stale cached months, live cloud bypass, source timestamps, two-minute history TTL and asset cache busting');
})().catch(error=>{console.error(error);process.exitCode=1});
