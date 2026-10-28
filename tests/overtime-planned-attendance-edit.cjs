'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');
function extract(name){
 const start=html.indexOf('function '+name+'(');
 const prefix=html.slice(start-6,start)==='async '?start-6:start;
 const end=html.indexOf('\n        }',start);
 assert(start>=0&&end>start,'expected '+name);
 return html.slice(prefix,end+10);
}
const IN={id:'IN-1',empId:'E1',attNo:'11',timeStr:'2026/10/28 07:45:00',status:'上班簽到'};
const OUT={id:'OUT-1',empId:'E1',attNo:'11',timeStr:'2026/10/28 15:48:00',status:'下班簽退'};
const base={empId:'E1',attNo:'11',name:'測試員',dateKey:'2026-10-28',clockIn:IN,clockOut:OUT};
const stamp=r=>Date.parse(String(r?.timeStr||'').replaceAll('/','-').replace(' ','T').replace(/(\d\d:\d\d)$/,'$1:00')+'+08:00');
function setup(){
 const opened=[],notices=[],months=[],rowsRendered=[],closed=[];
 let canEdit=true,queued=false,loaded=true,nextRows=[];
 const ctx={Number,Date,Math,JSON,Array,String,Set,Map,console,records:[],currentEmp:{empId:'ADMIN'},
 p79OvertimePlannedDisplayedRows:[base],p79OvertimeCalculationCache:{signature:'OLD'},
 canPerformAdminAction:()=>canEdit,currentPort79SsoToken:()=> 'token',
 window:{p79V5QueueInfoForId:()=>queued?{pending:true}:null},
 showToast:(message,tone)=>notices.push({message,tone}),
 getAttendanceRecordType:r=>String(r.status||'').includes('上班')?'IN':'OUT',
 p79DirectAttendanceTimestamp:stamp,
 normalizeScheduleDateKey:x=>String(x||'').replaceAll('/','-'),
 getAttendanceDateKey:x=>String(x||'').slice(0,10),
 normalizeAttendanceStatsAttNo:x=>String(x||'').trim(),
 loadAttendanceMonthFromCloud:async(month)=>{months.push(month);ctx.records=nextRows;return loaded},
 renderOvertimeStats:()=>rowsRendered.push(1),
 p79CloseOvertimePlannedDialog:()=>closed.push(1),
 openEditRecordModal:(...args)=>{opened.push(args);return 'OPENED'},
 formatEditableAttendanceTimeCell:(record,type,editable)=>editable?'EDIT '+type:record.timeStr,
 encodeURIComponent,escapeHtml:x=>String(x||'')};
 vm.createContext(ctx);
 for(const name of ['p79FindPlannedAttendanceEditRecord','p79OpenPlannedAttendanceEditor','p79OvertimePendingPunchCell'])
  vm.runInContext(extract(name),ctx);
 return {ctx,opened,notices,months,rowsRendered,closed,setCanEdit:v=>canEdit=v,setQueued:v=>queued=v,setLoaded:v=>loaded=v,setCloudRows:v=>nextRows=v};
}
(async()=>{
 let t=setup();t.ctx.records=[IN,OUT];
 assert.match(t.ctx.p79OvertimePendingPunchCell(base,'IN','2026-10-28',0),/p79OpenPlannedAttendanceEditor\(0,'IN'\)/,'displayed timestamp is directly clickable');
 assert.match(t.ctx.p79OvertimePendingPunchCell(base,'OUT','2026-10-28',0),/✎ 修改/,'OUT also directly editable');
 await t.ctx.p79OpenPlannedAttendanceEditor(0,'IN');
 assert.equal(t.opened.length,1,'same original attendance editor opens');
 assert.equal(t.months.length,0,'already loaded official punch need not fetch entire month');
 assert.equal(t.opened[0][0],IN.id);assert.equal(t.opened[0][1],'IN');assert.equal(t.opened[0][5],true,'force cloud baseline check before save');
 assert.equal(t.closed.length,1,'close planned dialog before native attendance editor');
 t=setup();t.setCloudRows([IN,OUT]);
 await t.ctx.p79OpenPlannedAttendanceEditor(0,'IN');
 assert.deepEqual(t.months,['2026-10'],'missing local attendance automatically reads official month');
 assert.equal(t.opened.length,1);assert.equal(t.rowsRendered.length,1,'overtime UI refreshes from official attendance');
 t=setup();t.setCloudRows([{...IN,empId:'OTHER'},OUT]);
 await t.ctx.p79OpenPlannedAttendanceEditor(0,'IN');
 assert.equal(t.opened.length,0,'wrong employee ID is never edited');
 assert.match(t.notices.at(-1).message,/紀錄不唯一|已異動/);
 t=setup();t.setCloudRows([IN,{...IN,timeStr:'2026/10/28 09:00:00'}]);
 await t.ctx.p79OpenPlannedAttendanceEditor(0,'IN');
 assert.equal(t.opened.length,0,'duplicate punch IDs cannot be edited');
 t=setup();t.setCloudRows([{...IN,timeStr:'2026/10/28 07:50:00'}]);
 await t.ctx.p79OpenPlannedAttendanceEditor(0,'IN');
 assert.equal(t.opened.length,0,'changed cloud punch time never silently replaced');
 t=setup();t.setLoaded(false);
 await t.ctx.p79OpenPlannedAttendanceEditor(0,'IN');
 assert.equal(t.opened.length,0,'cloud error never opens unknown record');
 t=setup();t.setCanEdit(false);
 await t.ctx.p79OpenPlannedAttendanceEditor(0,'IN');
 assert.equal(t.months.length,0);assert.equal(t.opened.length,0,'permissions checked before cloud lookup');
 t=setup();t.setQueued(true);
 await t.ctx.p79OpenPlannedAttendanceEditor(0,'IN');
 assert.equal(t.months.length,0);assert.equal(t.opened.length,0,'pending outbox blocks edits');
 t=setup();t.ctx.p79OvertimePlannedDisplayedRows=[{...base,clockIn:{...IN,id:''}}];
 await t.ctx.p79OpenPlannedAttendanceEditor(0,'IN');
 assert.equal(t.months.length,0);assert.equal(t.opened.length,0,'missing ID cannot create synthetic record');
 t=setup();t.ctx.records=[OUT];await t.ctx.p79OpenPlannedAttendanceEditor(0,'OUT');
 assert.equal(t.opened.length,1);assert.equal(t.opened[0][1],'OUT','clock-out retains original OUT kind');

 assert(html.includes('p79RefreshLinkedOvertimeAfterAttendanceCloudSave(originalTimeStr,r.timeStr)'),'updated time triggers linked cache refresh after cloud ACK');
 assert(html.includes('p79RefreshLinkedOvertimeAfterAttendanceCloudSave(newRecord.timeStr)'),'missing-punch creation triggers linked cache refresh after cloud ACK');
 assert(html.includes('for(const month of months)p79QueueConfirmedRosterRecheck(month)'),'changed months re-read official roster and overtime');
 const syncCtx={months:[],repaint:0,p79OvertimeCalculationCache:{old:true},
   normalizeScheduleDateKey:x=>String(x||'').replaceAll('/','-'),
   getAttendanceDateKey:x=>String(x||'').slice(0,10)};
 syncCtx.p79QueueConfirmedRosterRecheck=month=>syncCtx.months.push(month);
 syncCtx.p79RenderOnlyVisibleAttendanceView=()=>syncCtx.repaint++;
 vm.createContext(syncCtx);
 vm.runInContext(extract('p79RefreshLinkedOvertimeAfterAttendanceCloudSave'),syncCtx);
 syncCtx.p79RefreshLinkedOvertimeAfterAttendanceCloudSave('2026/09/30 23:59','2026/10/01 00:02');
 assert.deepEqual(syncCtx.months,['2026-09','2026-10'],'cross-month edit refreshes original and revised month');
 assert.equal(syncCtx.repaint,1,'one repaint for each confirmed write');
 assert.equal(syncCtx.p79OvertimeCalculationCache,null,'overtime cache invalidated');
 assert(html.includes("p79OvertimePendingPunchCell(row,'IN',todayKey,index)")&&html.includes("p79OvertimePendingPunchCell(row,'OUT',todayKey,index)"));
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
 console.log('PASS planned overtime attendance editor: auto month sync, IN/OUT edit, identity/type/time protection, no fake IDs, permissions, original editor, cloud-confirmed cache refresh');
})().catch(error=>{console.error(error);process.exitCode=1});
