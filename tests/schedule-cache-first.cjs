const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0,name);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n    }',a)+6)}
function setup(){
 const events=[],source={textContent:''},main={textContent:''};let cacheResolve,cloudResolve,month='2026-10',token='TOKEN';
 const data={ok:true,month:'2026-10',employees:[],schedules:[]};
 const c={Date,console,AbortController,setTimeout,clearTimeout,encodeURIComponent,document:{getElementById:id=>id==='p79ScheduleDataSource'?source:id==='app-main-container'?main:null},currentScheduleMonthKey:()=>month,currentPort79SsoToken:()=>token,
 p79ScheduleOfficialMonth:'',p79ScheduleOfficialToken:'',p79SchedulePreviewEpoch:0,p79ScheduleSourceState:{},p79ScheduleLocalMutationVersion:0,port79ScheduleDirty:false,scheduleSaveTimer:null,personnelSaveTimer:null,port79ScheduleWriteInFlight:null,p79ScheduleProtectLocalUntil:0,p79ScheduleCloudReadController:null,cloudLoaded:false,activeRoleTab:'F/L',
 canManageSchedule:()=>true,scheduleEditLockState:{mine:true},applyScheduleAccessUi:()=>events.push('access'),buildRoleTabsAndRender:()=>events.push('render'),p79ApplySchedulePayload:d=>events.push(d.origin||'cache'),p79ScheduleRestClient:()=>({refresh:()=>events.push('evidence')}),renderRoleScheduleView:()=>{events.push('direct-render');main.textContent='班表已顯示'},p79SchedulePreviewRenderError:e=>events.push('render-error'),saveAllDataToLocalStorage(){},isGasUrlConfigured:()=>true,GAS_URL:'https://example.invalid/exec',fetch:()=>new Promise(r=>cloudResolve=r)};
 c.window={Port79DataCache:{viewerKey:()=> 'A@admin',getSchedulePreview:()=>new Promise(r=>cacheResolve=r),storeSchedulePreview:async()=>{events.push('persist')}}};
 vm.createContext(c);for(const name of ['p79ScheduleHasOfficialData','p79RenderScheduleDataSource','p79ConfirmScheduleSource','p79StartSchedulePreview','p79RestoreSchedulePreview','scheduleCanEditNow','loadCloudData','cloudPost'])vm.runInContext(fn(name),c);
 return {c,events,source,main,cache:()=>cacheResolve({data,savedAt:Date.now()-3600000}),noCache:()=>cacheResolve(null),cloud:()=>cloudResolve({ok:true,json:async()=>({...data,origin:'cloud'})}),fail:()=>cloudResolve({ok:false,status:503}),month:m=>month=m,token:t=>token=t};
}
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 let t=setup();t.c.p79StartSchedulePreview('2026-10');const pending=t.c.loadCloudData();t.cache();await tick();
 assert(t.events.includes('render'));assert(!t.events.includes('cloud'));assert(t.source.textContent.includes('本機快取'));assert.equal(t.c.scheduleCanEditNow(),false,'editor lock alone must not permit stale cache writes');
 await assert.rejects(t.c.cloudPost({action:'syncSchedules'}),/只能查看/);
 t.cloud();assert(await pending);assert.equal(t.c.scheduleCanEditNow(),true);assert(t.events.includes('persist'));assert(t.source.textContent.includes('雲端班表已更新'));
 t=setup();t.main.textContent='正在讀取班表…';t.c.p79StartSchedulePreview('2026-10');t.cache();await tick();assert(t.events.includes('direct-render'),'cached data must repaint a stuck loading roster');
 t=setup();t.c.buildRoleTabsAndRender=()=>{throw Error('panel failure')};t.c.p79StartSchedulePreview('2026-10');t.cache();await tick();assert(t.events.includes('direct-render'),'a failed auxiliary panel may not block the cached roster');

 t=setup();t.c.p79StartSchedulePreview('2026-10');const fast=t.c.loadCloudData();t.cloud();assert(await fast);t.cache();await tick();assert.equal(t.events.filter(e=>e==='cache').length,0,'slow disk cannot overwrite fresh cloud');
 for(const change of [t=>t.month('2026-11'),t=>t.token('OTHER'),t=>t.c.p79ScheduleLocalMutationVersion++,t=>t.c.port79ScheduleDirty=true,t=>t.c.p79SchedulePreviewEpoch+=2]){
  t=setup();t.c.p79StartSchedulePreview('2026-10');change(t);t.cache();await tick();assert(!t.events.includes('cache'),'stale cache reply rejected');
 }
 t=setup();t.c.p79StartSchedulePreview('2026-10');const failed=t.c.loadCloudData();t.cache();await tick();t.fail();assert.equal(await failed,false);assert(t.source.textContent.includes('雲端更新未完成'));assert(!t.c.scheduleCanEditNow());assert(!t.events.includes('evidence'),'cached preview must not trigger automatic no-punch writes');
 t=setup();t.c.p79StartSchedulePreview('2026-10');const noCache=t.c.loadCloudData();t.noCache();await tick();assert(t.source.textContent.includes('本機沒有'));t.cloud();assert(await noCache);assert(t.c.scheduleCanEditNow());
 t=setup();t.c.p79StartSchedulePreview('2026-10');const failedNoCache=t.c.loadCloudData();t.noCache();await tick();t.fail();assert.equal(await failedNoCache,false);assert(t.events.includes('direct-render'),'cloud failure must end the waiting view even without cache');
 t=setup();t.c.p79StartSchedulePreview('2026-10');const oldCloud=t.c.loadCloudData();t.c.p79SchedulePreviewEpoch+=2;t.cloud();assert.equal(await oldCloud,false,'old response rejected even after round trip to same month');t.cache();await tick();
 assert(!html.includes('window.onload = async function()'));
 assert(!html.includes('<script defer src="https://cdn.jsdelivr.net/npm/xlsx'));
 assert(html.includes("document.addEventListener('DOMContentLoaded', async function()"));
 assert(html.includes('p79StartSchedulePreview(month)'));assert(html.includes('p79StartSchedulePreview(yearMonth)'));
 console.log('PASS cache paints before pending network; read-only until official response; slow disk, month/round-trip, account and local-edit races; cloud failure retains preview; no-cache fallback; lazy Excel and DOM-ready boot');
})().catch(e=>{console.error(e);process.exitCode=1});
