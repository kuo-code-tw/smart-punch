'use strict';
// Cross-system notification contract: synthetic events only, absolutely no GAS/cloud writes.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../assets/port79-management-link.js'),'utf8');
const boundary=source.search(/\r?\n\(function\(g\)\{\r?\n/);
assert(boundary>0,'Management transport must retain an independently testable core');
const root={Date,Set,Map,Promise,JSON,Math,console};
root.window=root;
vm.runInNewContext(source.slice(0,boundary),root,{filename:'port79-management-link-core.js'});
const api=root.P79ManagementSync;
assert(api,'Seven system event transport must exist');
const systems=['hr','attendance','leave','schedule','workhours','efficiency','history'];
for(const name of systems)assert(Array.isArray(api.dependencies[name])&&api.dependencies[name].length,name+' must have an explicit topic map');
const paths={
 hrUpsertEmployee:['hr','attendance','leave','schedule','workhours','efficiency'],
 updateLeaveRecord:['attendance','leave','schedule','workhours'],
 editRecord:['attendance','schedule','workhours','history'],
 saveSchedules:['attendance','leave','schedule','workhours','history'],
 saveOvertimeReportDirect:['attendance','leave','schedule','workhours'],
 gcUpsertRecord:['efficiency','history']
};
let successes=0;
(async()=>{
 for(const [action,expected] of Object.entries(paths)){
  const producer=api.create({system:'hr',isManager:()=>true,isEditing:()=>false,refresh:async()=>true,makeId:()=> 'event-'+action});
  const event=producer.acknowledge(action,{ok:true});
  assert(event&&api.validEvent(event),action+' requires a positive domain ACK');
  assert.equal(producer.acknowledge(action,{ok:false}),null,action+' rejected save must not send update');
  assert.equal(producer.acknowledge(action,{ok:true,retryable:true}),null,action+' unresolved retry must not send update');
  for(const system of systems){
   let count=0,receivedTopics=[];
   const client=api.create({system,isManager:()=>true,isEditing:()=>false,refresh:async topics=>{count++;receivedTopics=topics;return true}});
   const shouldReceive=expected.includes(system);
   const received=client.receive(event);
   if(shouldReceive)assert.equal(received,true,action+' -> '+system+' required routing');
   assert.equal(client.receive(event),false,action+' -> '+system+' duplicate blocked');
   assert.equal((await client.synchronize()).ok,true);
   assert.equal(count,received?1:0,action+' -> '+system+' refresh count');
   if(shouldReceive)assert(receivedTopics.length>0,action+' -> '+system+' missing topics');
  }
  successes++;
 }
 const editor=api.create({system:'workhours',isManager:()=>true,isEditing:()=>true,refresh:async()=>{throw Error('must not refresh an open edit')}});
 const msg={v:1,id:'edit-protection',at:Date.now(),topics:['schedule','attendance']};
 assert(editor.receive(msg));
 assert.equal((await editor.synchronize()).reason,'editing','Open edits must defer updates');
 assert.equal(editor.status().pending.length,2,'Deferred edits must preserve pending changes');
 const unauthorized=api.create({system:'schedule',isManager:()=>false,isEditing:()=>false,refresh:async()=>{throw Error('unauthorized')}});
 assert.equal(unauthorized.receive(msg),false,'Unauthorized sessions must not receive management changes');
 console.log('PASS seven-system confirmed-write topic routing, duplicate/error rejection, edit protection and authorization ('+successes+' event families)');
})().catch(err=>{console.error(err);process.exitCode=1});
