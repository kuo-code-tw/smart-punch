'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const cover=fs.readFileSync('backend/leave-cover-fast-save.gs','utf8');
function fixture({rows=[],mode='one',leaveStatus='已核准',denied=false,badReadback=false,restShift='休',conflict=false}={}){
 const list=rows.map(r=>r.slice()),events=[];let writes=0,cleanups=0,attendanceReads=0;
 const sheet={getLastRow:()=>list.length+1,appendRow:r=>{writes++;events.push('write');list.push(r.slice());},
  getRange:(row,col,count,width)=>({getValues:()=>{const v=list.slice(row-2,row-2+count).map(r=>r.slice());if(badReadback&&writes&&v[0])v[0][0]='CORRUPT';return v;},setValues:values=>{writes++;events.push('write');values.forEach((r,i)=>{list[row-2+i]=r.slice();});}})};
 const leaves=[{id:'L1',empId:'LEAVER',status:leaveStatus,startTime:'2026-11-28',endTime:'2026-11-28'}];
 const c={Date,JSON,Set,Array,Object,String,Error,
  gcRequireSystemPermission_:()=>{events.push('permission');if(denied)throw Error('denied');return {empId:'ADMIN',name:'管理者'};},
  normalizeEmpId_:v=>String(v||'').trim().toUpperCase(),normalizeText_:v=>String(v||'').trim(),
  SHEET_LEAVE:'leave',LEAVE_HEADERS:[],P79_LEAVE_COVER_SHEET:'covers',P79_LEAVE_COVER_HEADERS:Array(8),
  getSheetFast_:()=>({}),readLeaveRecords_:()=>leaves,p79DateOnly_:v=>v instanceof Date?v.toISOString().slice(0,10):String(v||'').slice(0,10),
  p79GetEmployeeMasterCached_:()=>[{empId:'LEAVER',dept:'A'},{empId:'WORKER',dept:'A'},{empId:'SECOND',dept:'A'}],isEmployeeActive_:()=>true,
  Utilities:{formatDate:d=>d.toISOString().slice(0,10)},
  p79CleanupOrphanLeaveCovers_:()=>cleanups++,p79GetOvertimeReportContext_:()=>attendanceReads++,
  p79ReadLeaveCoverAssignments_:()=>conflict?[{leaveId:'OTHER',workerIds:['WORKER'],startDate:'2026-11-28',endDate:'2026-11-28'}]:[],
  readScheduleMonthOnly_:()=>[{empId:'WORKER',schedule:{'2026-11-28':restShift}}],ensureSheet_:()=>sheet,
  p79WriteLeaveCoverRows_:(sh,values)=>{events.push('fallback');writes++;list.splice(0,list.length,...values.map(r=>r.slice()));},
  touchLeaveSyncRevision_:()=>events.push('leave-revision'),touchScheduleSyncRevision_:()=>events.push('schedule-revision')};
 vm.createContext(c);vm.runInContext(cover,c);
 const save=()=>c.p79SaveLeaveCoverAssignment_({}, {token:'fixture',leaveId:'L1',mode,workerIds:mode==='two'?['WORKER','SECOND']:['WORKER']});
 return {save,list,events,stats:()=>({writes,cleanups,attendanceReads})};
}
const unrelated=Array.from({length:1000},(_,i)=>['OLD'+i,'OTHER','2026-11-01','2026-11-01','one','["OTHER"]','before','date']);
let t=fixture({rows:unrelated}),r=t.save();assert.equal(r.ok,true);assert.equal(t.stats().writes,1);assert.equal(t.stats().cleanups,0);assert.equal(t.stats().attendanceReads,0);assert.deepEqual(t.list.slice(0,1000),unrelated);assert.equal(r.handoffContext,null);assert.equal(r.handoffDeferred,true);assert(t.events.indexOf('write')<t.events.indexOf('leave-revision'));
t=fixture({rows:[['L1','LEAVER','2026-11-28','2026-11-28','one','["WORKER"]','original','time']]});r=t.save();assert.equal(r.duplicate,true);assert.equal(t.stats().writes,0);assert.equal(t.list[0][6],'original');
t=fixture({rows:[['L1','LEAVER','2026-11-28','2026-11-28','one','["SECOND"]','original','time'],...unrelated]});t.save();assert.equal(t.stats().writes,1);assert.equal(t.list[0][5],'["WORKER"]');assert.deepEqual(t.list.slice(1),unrelated);
t=fixture({rows:[['L1'],...unrelated,['L1']]});t.save();assert(t.events.includes('fallback'));assert.equal(t.list.filter(r=>r[0]==='L1').length,1);assert.deepEqual(t.list.slice(0,1000),unrelated);
for(const options of [{denied:true},{leaveStatus:'待審核'},{restShift:'早',mode:'rest'},{conflict:true}]){t=fixture(options);assert.throws(t.save);assert.equal(t.stats().writes,0);}
t=fixture({badReadback:true});assert.throws(t.save,/讀回/);assert(!t.events.includes('leave-revision'));
const {apply}=require('../scripts/apply-gas-leave-save-fast.cjs');
const release="    if (employeeLock) {\n      try {\n        employeeLock.releaseLock();\n      } catch (ignore) {}\n    }\n    if (lock) {\n      try {\n        lock.releaseLock();\n      } catch (ignore) {}\n    }";
const template=`const API_VERSION = '2026.10.31.V72-MY-ROSTER-SELF-ONLY';
function port79DoPostCore_(data) {
  let scheduleSaveUnchanged = false;
  const action=data.action,employeeLock=null,lock={releaseLock:()=>events.push('unlock')};
  try {
    const fastAuthAction=false,fastScheduleMonthSave=action==='saveOvertimeReportDirect',scheduleLockAction=false;
    const ss = scheduleLockAction ? null : getSpreadsheet_(fastAuthAction || fastScheduleMonthSave || false);
    events.push('locked');
    switch(action){
      case 'saveOvertimeReportDirect':
        return jsonOutput(p79SaveDirectOvertimeReport_(ss,data));
      default:return jsonOutput({ok:true});
    }
  } finally {
${release}
    if (action && p79IsScheduleMutationAction_(action) && !scheduleSaveUnchanged) {touchScheduleSyncRevision_();}
    touchSyncRevision_();
  }
}
function parsePostData_(){}
function p79SaveLeaveCoverAssignment_(ss,data){return {ok:true};}
function nextFunction(){}
`;
const patched=apply(template,cover);new vm.Script(patched);
assert.throws(()=>apply(patched),/already/);assert.throws(()=>apply(template.replace('  let scheduleSaveUnchanged = false;','')),/Expected/);
for(const action of ['saveOvertimeReportDirect','addLeave','addLeaveRecord','saveLeaveCoverAssignment']){
 let revision=10,fast;const events=[];
 const c={events,JSON,String,getSpreadsheet_:v=>{fast=v;return {};},jsonOutput:r=>{events.push('serialize');return JSON.parse(JSON.stringify(r));},
  p79SaveDirectOvertimeReport_:()=>({ok:true,id:'R',report:{id:'R'}}),touchScheduleSyncRevision_:()=>{assert(!events.includes('unlock'));events.push('revision');return ++revision;},
  getLeaveSyncRevision_:()=>20,getEmployeeAuthRevision_:()=>30,p79IsScheduleMutationAction_:a=>a==='saveOvertimeReportDirect',touchSyncRevision_:()=>{assert(!events.includes('unlock'));events.push('global-revision');}};
 vm.createContext(c);vm.runInContext(patched,c);const result=c.port79DoPostCore_({action,date:'2026-11-28'});
 assert.equal(fast,true,'leave writes skip unrelated sheet initialization');assert.equal(events.at(-1),'unlock');
 if(action==='saveOvertimeReportDirect'){assert.equal(result.revision,'11:20:30:2026-11');assert.equal(revision,11,'finally cannot invalidate the returned revision');assert(events.indexOf('revision')<events.indexOf('serialize'));}
}
console.log('PASS GAS fast leave initialization; one-row cover writes/readback; retry/no-op; validation and conflict guards; no hidden cleanup/attendance fetch; revision ACK finalized inside lock without double bump');
