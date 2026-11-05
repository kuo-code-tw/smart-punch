'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('schedule/index.html','utf8');
const block=(name,next)=>{
 const start=html.indexOf('    async function '+name+'(');
 assert(start>=0,'missing '+name);
 const stop=html.indexOf(next,start);
 assert(stop>start,'missing '+next);
 return html.slice(start,stop);
};
const refresh=block('refreshOrAcquireScheduleEditLock','    function scheduleEditLockNextDelay');
const acquire=block('manualAcquireScheduleEditLock','    async function manualReleaseScheduleEditLock');
const toggleStart=html.indexOf('window.p79ToggleScheduleLock=async function()');
const toggleEnd=html.indexOf('\nfunction ensureModeModal()',toggleStart);
assert(toggleStart>0&&toggleEnd>toggleStart,'manual lock UI toggle exists');
const toggle=html.slice(toggleStart,toggleEnd);
assert(!refresh.includes("scheduleLockPost('scheduleAcquireEditLock')"),
 'background/focus/login lock check must NEVER acquire');
assert(refresh.includes("scheduleManualEditIntent"),'heartbeat must require explicit edit intent');
assert(html.includes("scheduleManualEditIntent && !!scheduleEditLockState.mine"),
 'edit permissions need manual click');
const saveStart=html.indexOf('    async function saveCurrentTabSchedule()');
const saveEnd=html.indexOf('    async function ',saveStart+20);
assert(saveStart>=0&&saveEnd>saveStart,'find save function');
assert(!html.slice(saveStart,saveEnd).includes('manualAcquireScheduleEditLock()'),
 'clicking save cannot take the editor lock behind the user');
assert(html.includes("if(!scheduleCanEditNow())return requireScheduleEditLock();"),
 'group mutations cannot acquire in the background');
assert(html.includes("if(!scheduleCanEditNow())throw Error('請先按「鎖定編輯」"),
 'month continuation cannot take a lock without explicit action');
const calls=[],button={disabled:false},server={ok:true,locked:false,mine:false,ownerName:'',ownerEmpId:''};
const ctx={
 window:null,console,Date,document:{visibilityState:'visible',getElementById:()=>button},
 scheduleManualEditIntent:false,scheduleEditLockState:{locked:false,mine:false,expiresAt:0},
 scheduleEditLockRefreshBusy:false,scheduleManualLockBusy:false,scheduleLockRequestEpoch:0,
 scheduleLockLastError:'',scheduleLockFailureCount:0,scheduleLockFirstFailureAt:0,
 canManageSchedule:()=>true,
 scheduleLockGet:async()=>{calls.push('GET');return{...server};},
 scheduleLockPost:async action=>{calls.push(action);
   if(action==='scheduleAcquireEditLock'){server.locked=true;server.mine=true;}
   else if(action==='scheduleHeartbeatEditLock'){assert(server.mine);}
   return{...server,acquired:action==='scheduleAcquireEditLock'&&server.mine};
 },
 setScheduleEditLockState:d=>{ctx.scheduleEditLockState={...d};
   if(!d.mine&&!d.acquired)ctx.scheduleManualEditIntent=false;},
 updateScheduleLockBadge:()=>{},applyScheduleAccessUi:()=>{},
 scheduleLockIsTransientNetworkError:()=>false,scheduleLockIsQuotaError:()=>false,
 scheduleNextEditLockPoll:()=>{},scheduleEditLockNextDelay:()=>2000,
 lockBtn:()=>button,
 manualReleaseScheduleEditLock:async()=>{calls.push('release-click');server.mine=false;server.locked=false;
   ctx.scheduleEditLockState={...server};ctx.scheduleManualEditIntent=false;},
 isScheduleSuperAdmin:()=>false,confirm:()=>false,alert:()=>{},
 p79UpdateScheduleLockTop:()=>{}
};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(refresh+acquire+toggle,ctx);
(async()=>{
 await ctx.refreshOrAcquireScheduleEditLock();
 await ctx.refreshOrAcquireScheduleEditLock();
 assert.deepEqual(calls,['GET','GET'],'login and repeated poll are read-only');
 assert.equal(ctx.scheduleEditLockState.mine,false);
 await ctx.p79ToggleScheduleLock();
 assert.equal(calls.filter(x=>x==='scheduleAcquireEditLock').length,1,
   'explicit lock click takes ownership once');
 assert.equal(ctx.scheduleManualEditIntent,true);
 assert.equal(ctx.scheduleEditLockState.mine,true);
 await ctx.refreshOrAcquireScheduleEditLock();
 assert.equal(calls.filter(x=>x==='scheduleHeartbeatEditLock').length,1,
   'only explicit owner renews lease');
 await ctx.p79ToggleScheduleLock();
 assert.equal(calls.filter(x=>x==='release-click').length,1,
   'same button releases');
 assert.equal(ctx.scheduleManualEditIntent,false);
 await ctx.refreshOrAcquireScheduleEditLock();
 assert.equal(calls.filter(x=>x==='scheduleAcquireEditLock').length,1,
   'release + polling do not reacquire');
 // A previously auto-acquired server lease must not be silently renewed on reload.
 server.mine=true;server.locked=true;ctx.scheduleManualEditIntent=false;
 await ctx.refreshOrAcquireScheduleEditLock();
 assert.equal(calls.filter(x=>x==='scheduleHeartbeatEditLock').length,1,
   'inherited old lease must expire unless user clicks');
 assert.equal(ctx.scheduleManualEditIntent,false);
 await ctx.p79ToggleScheduleLock();
 assert.equal(calls.at(-1),'release-click','old lock can be explicitly released');
 assert.equal(calls.filter(x=>x==='scheduleAcquireEditLock').length,1);
 server.locked=true;server.mine=false;server.ownerName='OTHER';
 await ctx.refreshOrAcquireScheduleEditLock();
 await ctx.p79ToggleScheduleLock();
 assert.equal(calls.filter(x=>x==='scheduleAcquireEditLock').length,1,
   'another owner can never be silently preempted');
 console.log('PASS: login, refresh, old lease, explicit acquire/release, heartbeat and foreign owner');
})().catch(e=>{console.error(e);process.exitCode=1});
