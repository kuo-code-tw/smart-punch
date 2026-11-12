'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('leave/index.html','utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0,name);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n}',a)+2);}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};}
const tick=()=>new Promise(r=>setImmediate(r));
function setup({admin=true,cache=null}={}){
 const calls=[],statuses=[],renders=[];let token='manager-token';
 const data={ok:true,employees:[{empId:'E1'}],leaveRecords:[{id:'OLD',startDate:'2026-09-01'},{id:'CROSS',startDate:'2026-10-31',endDate:'2026-11-02'}],leaveCoverAssignments:[],leaveCoverCancellations:[]};
 const nodes={filterMonth:{value:'2026-11'},employeeLeaveReauth:{hidden:true}};
 const c={Promise,Map,Date,Error,URL,encodeURIComponent,console:{warn(){}},GAS_URL:'https://script.google.com/macros/s/test/exec',adminSession:admin?{}:null,adminToken:token,employees:[],leaveRecords:[],currentEmployee:null,p79LeaveCloudDataReady:false,p79LeaveLoadGeneration:0,p79LeaveReads:new Map(),
 window:{Port79DataCache:{getDisplaySnapshot:async()=>cache}},storedToken:()=>token,leaveRequestToken:()=>token,p79LeaveEmployeeEntry:()=>false,
 $:id=>nodes[id],setStatus:m=>statuses.push(m),populateDepartments(){},renderAll(){renders.push(c.leaveRecords.map(l=>l.id))},p79ShowPendingLeavePrompt(){},p79ReconcileLeaveHandoff:async()=>{},p79LeaveMatchesMonth:()=>true,p79LeaveAuthError:m=>/auth/.test(m),p79EmployeeLeaveReauth(){c.reauth=true},p79RenewEmployeeLeaveSession:async()=>false,
 jsonFetch:(url,options,timeout)=>{const d=deferred();calls.push({url,options,timeout,...d});return d.promise;}};
 vm.createContext(c);for(const name of ['p79StartLeaveRead','p79PrepareLeaveEntryRead','p79HydrateLeaveComputerCache','loadCloud'])vm.runInContext(fn(name),c);
 return{c,calls,statuses,renders,data,setToken:v=>token=v};
}
(async()=>{
 // Cold entry: a complete response can finish before identity, but cannot paint until verification.
 let x=setup();x.c.adminSession=null;const identity=deferred();
 const entry=x.c.p79PrepareLeaveEntryRead();assert.equal(x.calls.length,1);
 const loading=x.c.loadCloud(false,false,identity.promise,entry);
 x.calls[0].resolve(x.data);await tick();assert.equal(x.renders.length,0);
 x.c.adminSession={empId:'MANAGER'};identity.resolve(true);assert.equal(await loading,true);
 assert.equal(x.calls.length,1);assert.equal(x.c.leaveRecords.length,2,'all history and cross-month records survive for balance calculations');
 // Hash-only SSO may have removed the fragment without persisting a storage token.
 x=setup();x.c.storedToken=()=>'';const hashOnly=x.c.loadCloud();x.calls[0].resolve(x.data);assert.equal(await hashOnly,true);
 // Denied SSO never exposes manager data or starts employee fallback.
 x=setup({admin:false});const denied=x.c.p79PrepareLeaveEntryRead();x.calls[0].resolve(x.data);
 assert.equal(await x.c.loadCloud(false,false,Promise.resolve(false),denied),false);assert.equal(x.renders.length,0);assert.equal(x.calls.length,1);
 x=setup();x.c.p79LeaveEmployeeEntry=()=>true;assert.equal(x.c.p79PrepareLeaveEntryRead(),null);assert.equal(x.calls.length,0);
 // Cache appears while the network is pending; cloud replaces it. No extra fetch for overlapping refreshes.
 x=setup({cache:{data:{ok:true,employees:[{empId:'E1'}],leaveRecords:[{id:'CACHE'}]}}});
 const first=x.c.loadCloud();await tick();assert.equal(x.renders[0][0],'CACHE');
 const second=x.c.loadCloud();assert.equal(x.calls.length,1);assert.equal(x.calls[0].timeout,18000);
 x.calls[0].resolve(x.data);assert.equal(await first,false);assert.equal(await second,true);assert.equal(x.renders.at(-1)[0],'OLD');
 // Timeout ends one ordinary read, preserves rows, and never claims fresh confirmation.
 x=setup({cache:{data:{ok:true,employees:[{empId:'E1'}],leaveRecords:[{id:'CACHE'}]}}});
 const failed=x.c.loadCloud();await tick();x.calls[0].reject(Error('timeout'));
 assert.equal(await failed,false);assert.equal(x.calls.length,1);assert.equal(x.c.leaveRecords[0].id,'CACHE');assert(x.statuses.at(-1).includes('未完成'));
 // A fresh post-write read bypasses an older active read and rejects failure even with rows present.
 x=setup();const old=x.c.loadCloud();const fresh=x.c.loadCloud(false,true);assert.equal(x.calls.length,2);assert.equal(x.calls[1].timeout,22000);
 x.calls[1].reject(Error('readback failed'));await assert.rejects(fresh,/readback failed/);x.calls[0].resolve(x.data);assert.equal(await old,false);assert.equal(x.renders.length,0);
 x=setup();const staleFresh=x.c.loadCloud(false,true);x.setToken('other-account');x.calls[0].resolve(x.data);await assert.rejects(staleFresh,/尚未確認/);
 // Slow disk data cannot replace a newer cloud response.
 x=setup();const disk=deferred();x.c.window.Port79DataCache.getDisplaySnapshot=()=>disk.promise;
 const fast=x.c.loadCloud();x.calls[0].resolve(x.data);assert.equal(await fast,true);
 disk.resolve({data:{employees:[],leaveRecords:[{id:'STALE'}]}});await tick();assert.equal(x.renders.length,1);assert.equal(x.c.leaveRecords[0].id,'OLD');
 // A change of account or endpoint invalidates already-started reads and cache hydration.
 for(const change of [x=>x.setToken('new-manager'),x=>x.c.adminSession={},x=>x.c.GAS_URL+='-new']){
  x=setup();const pending=x.c.loadCloud();change(x);x.calls[0].resolve(x.data);assert.equal(await pending,false);assert.equal(x.renders.length,0);
 }
 // With no preview, the one bounded roster fallback is visibly incomplete and never returns success.
 x=setup();const fallback=x.c.loadCloud();x.calls[0].reject(Error('busy'));await tick();assert.equal(x.calls.length,2);assert.equal(x.calls[1].timeout,8000);
 x.calls[1].resolve({ok:true,employees:[{empId:'E1'}]});assert.equal(await fallback,false);assert(x.statuses.at(-1).includes('餘額待核對'));
 // Employee renewal is retained and employee entry cannot load a manager display snapshot.
 x=setup({admin:false,cache:{data:x.data}});x.setToken('employee-old');x.c.p79RenewEmployeeLeaveSession=async()=>{x.setToken('employee-new');return true};
 const employee=x.c.loadCloud();x.calls[0].resolve({ok:false,error:'auth expired'});await tick();assert.equal(x.calls.length,2);
 assert(new URL(x.calls[1].url).searchParams.get('token')==='employee-new');x.calls[1].resolve(x.data);assert.equal(await employee,true);assert.equal(x.c.leaveRecords.length,0);
 // Read failures are settled even if speculative SSO is still pending (no unhandled rejection).
 x=setup();const speculative=x.c.p79PrepareLeaveEntryRead();x.calls[0].reject(Error('network'));assert((await speculative.result).error);
 // Timing diagnostics contain only action, duration and outcome, never URL/token/payload.
 x=setup();Object.assign(x.c,{AbortController,setTimeout,clearTimeout,location:{href:'https://example.test/leave/'},fetch:async()=>({ok:true,text:async()=>JSON.stringify({ok:true,employees:[{name:'PRIVATE'}]})})});
 vm.runInContext(fn('jsonFetch'),x.c);await x.c.jsonFetch('https://script.google.com/macros/s/test/exec?action=getLeaveData&token=SECRET');
 const diagnostics=JSON.stringify(x.c.window.p79LeaveLoadTimings);assert(diagnostics.includes('getLeaveData'));assert(!/SECRET|PRIVATE|script.google/.test(diagnostics));
 console.log('PASS leave entry: parallel reads with verified identity, deduplication, bounded failure, cache/cloud races, strict fresh readback, account/endpoint isolation, full history, employee renewal and private timing diagnostics');
})().catch(e=>{console.error(e);process.exitCode=1});
