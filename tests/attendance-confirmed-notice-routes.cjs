'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('assets/port79-management-link.js','utf8');
const boundary=src.indexOf('(function(){const path=');
assert(boundary>0);
const handlers=new Map();
const c={Date,Set,Map,Promise,JSON,Math,URL,console,
 location:{href:'https://example.invalid/smart-punch/history-data/'},
 addEventListener:(key,cb)=>{if(!handlers.has(key))handlers.set(key,new Set());handlers.get(key).add(cb)},
 removeEventListener:(key,cb)=>handlers.get(key)?.delete(cb),
 fetch:async()=>({ok:true,json:async()=>({ok:true})}),
 sessionStorage:{getItem:()=>null,setItem:()=>{}},
 localStorage:{setItem:()=>{},getItem:()=>null}
};
c.window=c;vm.createContext(c);vm.runInContext(src.slice(0,boundary),c);
async function run(){
 let times=0,allow=true,changes=[];
 const b=c.P79ManagementSync.attach({
  system:'history',isManager:()=>allow,isEditing:()=>false,refresh:async topics=>{times++;changes.push([...topics]);return true},
  makeId:()=> 'TEST-EVENT',gasOrigin:'https://script.google.com',gasPath:'/macros/s/TEST/exec'
 });
 const emit=(key,value)=>{for(const cb of handlers.get('storage')||[])cb({key,newValue:JSON.stringify(value)})};
 emit('port79_attendance_sync_notice_v1',{id:'SYNTHETIC-PUNCH',at:Date.now(),action:'addRecord'});
 assert.equal(b.engine.status().pending.includes('attendance'),true,'confirmed normal punch must reach historical archive and other subscribers');
 assert.equal((await b.engine.synchronize()).ok,true);
 assert.equal(times,1);
 emit('port79_attendance_sync_notice_v1',{id:'SYNTHETIC-PUNCH',at:Date.now()-600000,action:'addRecord'});
 assert.equal(b.engine.status().pending.length,0,'stale notice must not trigger another read');
 emit('port79_attendance_sync_notice_v1',{id:'SYNTHETIC-PUNCH-2',at:Date.now(),action:'deleteRecord'});
 emit('port79_attendance_sync_notice_v1',{id:'SYNTHETIC-PUNCH-2',at:Date.now(),action:'deleteRecord'});
 assert.equal((await b.engine.synchronize()).ok,true);
 assert.equal(times,2,'duplicate confirmed notice is only read once');
 allow=false;
 emit('port79_attendance_sync_notice_v1',{id:'SYNTHETIC-PUNCH-3',at:Date.now(),action:'editRecord'});
 assert.equal(b.engine.status().pending.length,0,'logged-out viewer cannot receive a new notification');
 b.dispose();
 assert.equal(handlers.get('storage')?.size,0,'leave page releases event listeners');
 console.log('PASS cloud-confirmed ordinary punches bridge into the seven-system reader; stale, duplicate, unauthorized and disposal guards');
}
run().catch(e=>{console.error(e);process.exitCode=1});
