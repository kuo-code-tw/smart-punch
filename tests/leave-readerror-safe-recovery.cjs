'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('leave/index.html','utf8');
function between(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert(a>=0&&b>a,'missing live source: '+start);
 return html.slice(a,b);
}
const readFns=between('const p79LeaveReads=new Map();','function p79PrepareLeaveEntryRead()');
const preflight=between('async function p79ReadCurrentLeaveCoverState(){','function leaveBalanceNumber(');
const ctx={Date,Math,Number,String,Error,Map,Promise,URLSearchParams,encodeURIComponent,
 setTimeout:(fn)=>{fn();return 0;},clearTimeout:()=>{},
 GAS_URL:'https://example.invalid/exec',adminCreateLeaveBusy:false,
 adminToken:'test-token',p79LeaveAuthError:s=>/登入|Token.*失效|權限/.test(String(s)),
 leaveRequestToken:()=>'test-token',
 $:()=>({textContent:''}),
 jsonFetch:null,writeCount:0,
};
vm.createContext(ctx);vm.runInContext(readFns+'\n'+preflight,ctx);
const simulate=(arr)=>{
 const items=[...arr];let calls=0;
 ctx.jsonFetch=async(url,opts,timeout)=>{
  assert.match(url,/action=getLeaveData/);
  assert.equal(opts.cache,'no-store');
  assert(timeout<=18000);
  calls++;
  const item=items.shift();
  if(item instanceof Error)throw item;
  return item;
 };
 return ()=>calls;
};
const fresh={ok:true,employees:[{empId:'A'}],leaveRecords:[],leaveCoverAssignments:[]};
(async()=>{
 assert(ctx.p79LeaveIsTransientReadFailure('ReadError'),'transient cloud read error');
 assert(ctx.p79LeaveIsTransientReadFailure('HTTP 503'),'transient HTTP 5xx');
 assert(ctx.p79LeaveIsTransientReadFailure({error:'後端正在處理',retryable:true}));
 assert(!ctx.p79LeaveIsTransientReadFailure('登入驗證資料不存在'),'auth must not retry');
 assert(!ctx.p79LeaveIsTransientReadFailure('請假人員沒有管理員權限'),'permission must not retry');
 let count=simulate([{ok:false,error:'ReadError',retryable:false},fresh]);
 let result=await ctx.p79ReadOfficialLeaveWithRetry('test-token');
 assert.equal(result.ok,true);
 assert.equal(count(),2,'transient ReadError should retry read and recover');
 count=simulate([Error('雲端回應逾時，請再試一次'),fresh]);
 result=await ctx.p79ReadCurrentLeaveCoverState();
 assert.equal(result.ok,true);
 assert.equal(count(),2,'save preflight should retry a GET timeout without a POST');
 count=simulate([{ok:false,retryable:true,error:'雲端目前正在處理其他資料'},fresh]);
 result=await ctx.p79ReadCurrentLeaveCoverState();
 assert.equal(result.ok,true);
 assert.equal(count(),2,'backend retryable read should recover');
 count=simulate([{ok:false,error:'無權限存取請假資料'},fresh]);
 await assert.rejects(()=>ctx.p79ReadCurrentLeaveCoverState(),/無權限/);
 assert.equal(count(),1,'permanent refusal is not retried');
 count=simulate([{ok:false,error:'ReadError'},{ok:false,error:'ReadError'},{ok:false,error:'ReadError'}]);
 await assert.rejects(()=>ctx.p79ReadCurrentLeaveCoverState(),/未完成（ReadError）/);
 assert.equal(count(),3,'bounded retries; no infinite cloud wait');
 count=simulate([fresh]);
 const a=ctx.p79StartLeaveRead('test-token',false);
 const b=ctx.p79StartLeaveRead('test-token',false);
 const reads=await Promise.all([a,b]);
 assert(reads.every(x=>x.data?.ok===true));
 assert.equal(count(),1,'parallel equivalent reads are deduplicated');
 count=simulate([fresh]);
 const independent=await ctx.p79StartLeaveRead('test-token',true);
 assert.equal(independent.data?.ok,true);
 assert.equal(count(),1,'explicit fresh read never reuses cache');
 assert(html.includes('p79LeaveCloudDataReady=false;'),'failed cloud GET must invalidate stale cloud-readiness state');
 assert(html.includes('目前顯示上次資料，不能當作已儲存確認'),'stale values must be labeled');
 const save=between('async function postCloud(payload){','function readHash(){');
 assert(save.includes('d.rejectedBeforeWrite===true'),'POST remains protected against unsafe replay');
 assert(!readFns.includes("method:'POST'")&&!preflight.includes("method:'POST'"),'new retries only issue read-only GET');
 assert.equal(ctx.writeCount,0,'recovery never writes a leave on behalf of the user');
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
   .filter(x=>!/\bsrc=|application\/json|importmap/.test(x[1]));
 for(const script of scripts)if(script[2].trim())new vm.Script(script[2]);
 console.log('PASS ReadError recovery: safe GET-only retries, no stale authorization, bounded failure, authoritative save preflight, no duplicate POST, page script syntax');
})().catch(error=>{console.error(error);process.exitCode=1;});
