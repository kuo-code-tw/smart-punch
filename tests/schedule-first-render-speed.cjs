const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0,name);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n    }',a)+6)}
const events=[];let release;
const c={Date,console,setTimeout,document:{getElementById:()=>({value:'2026-10'})},isGasUrlConfigured:()=>true,port79ScheduleAutoSyncBusy:false,port79ScheduleDirty:false,scheduleSaveTimer:null,personnelSaveTimer:null,port79ScheduleWriteInFlight:null,p79ScheduleProtectLocalUntil:0,port79ScheduleLastAutoSyncAt:0,loadCloudData:async()=>{events.push('cloud');return true},initDefaultScheduleData:()=>events.push('init'),buildRoleTabsAndRender:()=>events.push('render'),scheduleEditLockState:{mine:true},p79ApplyNoPunchRestFromOfficial:()=>{events.push('attendance');return new Promise(r=>release=r)},saveScheduleMonthToCloud:async()=>{events.push('save');return true},currentScheduleMonthKey:()=> '2026-10'};
vm.createContext(c);vm.runInContext('const p79ScheduleNoPunchTasks=new Map();'+fn('p79QueueScheduleNoPunchReconcile')+';'+fn('loadScheduleCloudWithRetryOnce'),c);
(async()=>{
 for(const reason of ['login','manual']){
  events.length=0;
  const task=c.loadScheduleCloudWithRetryOnce(reason,1);
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(events,['cloud','render'],'display the official roster without waiting for attendance or replacing its shifts');
  assert.equal(await task,true);
  assert.equal(release,undefined,'background attendance reconciliation does not initiate a roster mutation');
 }
 console.log('PASS official roster renders immediately, without default shifts, duplicate render or background saves');

})().catch(e=>{console.error(e);process.exitCode=1});
