const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0,name);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n    }',a)+6)}
const events=[];let release;
const c={Date,console,setTimeout,document:{getElementById:()=>({value:'2026-10'})},isGasUrlConfigured:()=>true,port79ScheduleAutoSyncBusy:false,port79ScheduleDirty:false,scheduleSaveTimer:null,personnelSaveTimer:null,port79ScheduleWriteInFlight:null,p79ScheduleProtectLocalUntil:0,port79ScheduleLastAutoSyncAt:0,loadCloudData:async()=>{events.push('cloud');return true},initDefaultScheduleData:()=>events.push('init'),buildRoleTabsAndRender:()=>events.push('render'),scheduleEditLockState:{mine:true},p79ApplyNoPunchRestFromOfficial:()=>{events.push('attendance');return new Promise(r=>release=r)},saveScheduleMonthToCloud:async()=>{events.push('save');return true},currentScheduleMonthKey:()=> '2026-10'};
vm.createContext(c);vm.runInContext('const p79ScheduleNoPunchTasks=new Map();'+fn('p79QueueScheduleNoPunchReconcile')+';'+fn('loadScheduleCloudWithRetryOnce'),c);
(async()=>{
 const task=c.loadScheduleCloudWithRetryOnce('login',1);await new Promise(r=>setImmediate(r));
 assert.deepEqual(events,['cloud','init','render','attendance'],'roster visible while attendance request is pending');
 assert.equal(await task,true,'cloud read resolves before slow attendance, allowing immediate month navigation');release(0);await new Promise(r=>setImmediate(r));assert.equal(events.filter(x=>x==='render').length,1,'no redundant full render');
 events.length=0;const changed=c.loadScheduleCloudWithRetryOnce('manual',1);await new Promise(r=>setImmediate(r));assert(events.includes('render'));assert(await changed);release(2);await new Promise(r=>setImmediate(r));assert(events.indexOf('render')<events.indexOf('save'));
 const apply=fn('p79ApplyNoPunchRestFromOfficial');assert(apply.includes('requestMutationVersion!==p79ScheduleLocalMutationVersion'));assert(apply.includes('port79ScheduleWriteInFlight'));
 console.log('PASS cloud roster renders before blocked attendance and save; no duplicate full render; local edit guards preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
