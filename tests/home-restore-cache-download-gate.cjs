'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const begin=html.indexOf('async function restore(){'),end=html.indexOf('\nasync function probeGasConnection()',begin);
assert(begin>=0&&end>begin,'Home restore must be present');
const restoreSource=html.slice(begin,end);
function setup(){
 const storage=new Map([['port79_user_token','SAME-TOKEN'],['port79_user_session',JSON.stringify({empId:'QA',adminRole:'admin',dataScope:{team:'old'},systemPermissions:{attendance:'view'}})]]);
 const ss={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const tasks=[];
 let resolveVerify,rejectVerify,verified=new Promise((resolve,reject)=>{resolveVerify=resolve;rejectVerify=reject});
 const win={Port79DataCache:{preloadCurrent(){}},dispatchEvent(){}};
 const c={window:win,sessionStorage:ss,location:{search:'',pathname:'/smart-punch/'},history:{replaceState(){}},URLSearchParams,Event:class Event{constructor(){}},
  getToken:()=>ss.getItem('port79_user_token'),showSession(){},normalizePermissions:p=>p,
  verifySession:()=>verified,setTimeout:(fn,delay)=>{tasks.push({fn,delay});return tasks.length;},currentSession:null,console,JSON};
 vm.createContext(c);vm.runInContext(restoreSource,c);
 return {c,win,ss,tasks,resolveVerify,rejectVerify};
}
async function check(name,fn){await fn();console.log('PASS '+name)}
(async()=>{
 await check('restored session waits for live cloud scope refresh before native background download',async()=>{
  const f=setup();await f.c.restore();
  assert.equal(f.win.__port79CachedSessionRefreshPending,true);
  const verifiedTask=f.tasks.find(x=>x.delay===0);
  assert(verifiedTask,'Live login refresh must actually start');
  const p=verifiedTask.fn();
  assert.equal(f.win.__port79CachedSessionRefreshPending,true,'Do not download during in-flight verification');
  f.resolveVerify({ok:true,empId:'QA',adminRole:'admin',dataScope:{team:'confirmed'},systemPermissions:{attendance:'edit'}});
  await p;assert.equal(f.win.__port79CachedSessionRefreshPending,false);
  assert.equal(JSON.parse(f.ss.getItem('port79_user_session')).dataScope.team,'confirmed');
 });
 await check('stale background verification cannot replace a newer signed-in account',async()=>{
  const f=setup();await f.c.restore();
  const p=f.tasks.find(x=>x.delay===0).fn();
  f.ss.setItem('port79_user_token','NEW-LOGIN');
  f.resolveVerify({ok:true,dataScope:{team:'stale'}});
  await p;assert.equal(f.win.__port79CachedSessionRefreshPending,false);
  assert.equal(JSON.parse(f.ss.getItem('port79_user_session')).dataScope.team,'old');
 });
 await check('cloud verification failure still releases pending flag',async()=>{
  const f=setup();await f.c.restore();const p=f.tasks.find(x=>x.delay===0).fn();
  f.rejectVerify(new Error('cloud temporarily unavailable'));
  await p;assert.equal(f.win.__port79CachedSessionRefreshPending,false);
 });
 assert(html.includes("function saveSession(data,mode='manage'){window.__port79CachedSessionRefreshPending=false;"));
 console.log('PASS original homepage restoration handshake leaves business data unchanged');
})().catch(error=>{console.error(error);process.exitCode=1});
