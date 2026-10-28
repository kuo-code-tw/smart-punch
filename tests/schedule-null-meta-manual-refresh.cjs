const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const from=html.indexOf('    function p79ApplySchedulePayload('),to=html.indexOf('    async function loadCloudData(',from);
assert(from>=0&&to>from);
const ui={
 employees:Array.from({length:4},(_,i)=>({id:'C'+i,name:'指揮手'+i})),
 scheduleOrderNumber:x=>Number(x)||0,cloneScheduleEmployee:x=>({...x}),
 applySchedulePersonnelOverrides:()=>{},scheduleGroupIsMeaningful:()=>true,
 window:{P79ScheduleRestSummary:{clear(){},acceptRows(){}}},
};
vm.createContext(ui);vm.runInContext(html.slice(from,to),ui);
const day=n=>'2026-11-'+String(n).padStart(2,'0');
const originals=Array.from({length:4},(_,i)=>({
 empId:'C'+i,month:'2026-11',
 schedule:{...Object.fromEntries(Array.from({length:30},(_,j)=>[day(j+1),j%3===0?'早':j%3===1?'中':'休'])),
 __meta:{[day(1)]:null,[day(2)]:{overtimeReport:{id:'REPORT-'+i,category:'休'}},[day(3)]:null}}
}));
const raw=JSON.stringify(originals);
ui.p79ApplySchedulePayload({employees:ui.employees.map(e=>({...e,empId:e.id,jobTitle:'指揮手'})),schedules:originals,leaveRecords:[],leaveCoverAssignments:[]},'2026-11');
for(let i=0;i<4;i++){
 assert.deepEqual(JSON.parse(JSON.stringify(ui.monthlyScheduleMeta['C'+i][day(1)])),{});
 assert.equal(ui.monthlyScheduleMeta['C'+i][day(2)].overtimeReport.id,'REPORT-'+i);
 assert.equal(ui.monthlyScheduleData['C'+i][day(1)],'早');
 assert.equal(ui.monthlyScheduleData['C'+i][day(30)],'休');
}
assert.equal(JSON.stringify(originals),raw,'normalizing local display metadata cannot mutate official GAS snapshot');
const refreshStart=html.indexOf('    async function manualRefreshSchedule()'),refreshEnd=html.indexOf('    function startScheduleFullAutoSync()',refreshStart);
assert(refreshStart>=0&&refreshEnd>refreshStart);
const run=async(fail)=>{
 let calls=[],notice=[],alertMessages=[],lock=0,redraw=0;
 const button={disabled:false,innerHTML:'重新讀取'};
 const c={Date,Promise,Error,console,port79ScheduleLastAutoSyncAt:123,
  document:{getElementById:id=>id==='schedule-refresh-btn'?button:null},
  flushSchedulePendingWrites:async()=>true,
  loadScheduleCloudWithRetry:async()=>{calls.push('cloud');return true},
  buildRoleTabsAndRender:()=>{redraw++;if(fail)throw new TypeError("Cannot read properties of null (reading 'overtimeReport')")},
  p79ScheduleLastRenderError:'',
  p79SchedulePreviewRenderError:function(error){this.p79ScheduleLastRenderError=error.message;calls.push('render-error')},
  showScheduleNotice:(...p)=>notice.push(p),
  refreshOrAcquireScheduleEditLock:async()=>{lock++;},
  renderTodaySchedulePanel:()=>{},
  alert:m=>alertMessages.push(m)
 };
 vm.createContext(c);vm.runInContext(html.slice(refreshStart,refreshEnd),c);
 await c.manualRefreshSchedule();
 return{calls,notice,lock,redraw,button,alertMessages};
};
(async()=>{
 const fail=await run(true);
 assert.equal(fail.lock,0,'unrenderable read cannot report complete UI recovery');
 assert.equal(fail.notice.length,1,'manual refresh must surface render-specific failure');
 assert.match(fail.notice[0][0],/雲端資料已讀取，但正式班表渲染失敗/);
 assert.equal(fail.button.disabled,false,'button must be usable after an error');
 const ok=await run(false);
 assert.equal(ok.lock,1);assert.equal(ok.notice.length,0);assert.equal(ok.button.disabled,false);
 const ed=fs.readFileSync('assets/port79-special-days-editor.js','utf8');
 const store=new Map();
 const browser={console,Date,Promise,JSON,Array,Set,
  localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
  P79SpecialOvertime:{electionDates:()=>[]},addEventListener(){}};
 vm.createContext(browser);vm.runInContext(ed,browser);
 browser.P79SpecialDaysEditor.configure({
  read:async()=>({ok:true,source:'cloud',schemaVersion:1,revision:'REV-1',rows:[{date:'2026-11-04',kind:'election'}]}),
  write:async()=>({ok:true,source:'cloud',schemaVersion:1,revision:'REV-2',rows:[]}),
  onChange:()=>{throw new TypeError("Cannot read properties of null (reading 'overtimeReport')")}
 });
 const confirmed=await browser.P79SpecialDaysEditor.refresh();
 assert.equal(confirmed.revision,'REV-1','successful GAS special-date read must survive a UI redraw exception');
 assert.equal(browser.P79SpecialDaysEditor.state().rows.length,1);
 console.log('PASS 4 command staff, 30 November dates: null metadata safe; formal overtime IDs preserved; manual refresh distinguishes GET/render; confirmed special cloud dates survive renderer error');
})().catch(e=>{console.error(e);process.exitCode=1});
