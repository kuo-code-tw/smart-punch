'use strict';
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
function extract(name){
 const match=new RegExp('        (?:async )?function '+name+'\\(').exec(html);
 a(match,'missing real '+name);
 const from=match.index,end=html.indexOf('\n        }',from);
 a(end>from,'unterminated '+name);
 return html.slice(from,end+10);
}
const time='2026/10/29 07:32:00',id='PUNCH-IN-1';
const record={id,empId:'E1',attNo:'0007',name:'測試人員',status:'上班簽到',timeStr:time,note:''};
const clone=r=>({...r});
function setup({rowEmp='E1',rowAtt='0007',cloudRecord=record,missingModule=false}={}){
 const opened=[],messages=[],notices=[],statuses=[],mounts=[],restores=[],syncs=[];
 const hidden=new Set(['hidden']);
 const modal={classList:{contains:v=>hidden.has(v),remove:v=>hidden.delete(v),add:v=>hidden.add(v)}};
 const dom={editRecordModal:modal};
 const c={Date,Math,Number,String,Set,Map,JSON,Promise,setTimeout:fn=>{fn();return 1},
  requestAnimationFrame:fn=>fn(),document:{getElementById:id=>dom[id]||null},
  records:[clone(record)],p79OvertimePlannedDisplayedRows:[{empId:rowEmp,attNo:rowAtt,name:'測試人員',dateKey:'2026-10-29',clockIn:clone(record),clockOut:null}],
  p79AttendanceEditOpenGeneration:0,p79WorkhoursEditConflict:null,
  activeEditingAttendanceRecord:null,activeEditingAttendanceRecordSnapshot:null,
  currentEmp:{empId:'ADMIN'},canPerformAdminAction:()=>true,requireAdminAction:()=>true,
  currentPort79SsoToken:()=> 'ADMIN-TOKEN',
  normalizeAttendanceStatsAttNo:x=>String(x??'').trim(),getAttendanceRecordType:r=>r.status==='上班簽到'?'IN':'OUT',
  p79DirectAttendanceTimestamp:r=>Date.parse(r.timeStr.replaceAll('/','-').replace(' ','T')+'+08:00'),
  p79PlannedPunchNotice:(...args)=>notices.push(args),showToast:(...args)=>messages.push(args),
  p79MountAttendanceModalInPlannedDialog:modalId=>{mounts.push(modalId);return true;},
  p79RestoreAttendanceModalFromPlannedDialog:id=>restores.push(id),
  p79FillAttendanceEditForm:r=>opened.push(r.id),
  p79SetAttendanceEditCloudState:(ready,message)=>statuses.push({ready,message}),
  p79AttendanceEditFormFingerprint:()=> 'unchanged',
  p79PrepareWorkhoursEdit:async()=>{if(missingModule)throw Error('模組尚未載入');return clone(cloudRecord);},
  p79WorkhoursEditEquivalent:(a,b)=>a.id===b.id&&a.empId===b.empId&&a.attNo===b.attNo&&a.status===b.status&&a.timeStr===b.timeStr,
  p79OvertimeCalculationCache:{},loadAttendanceMonthFromCloud:async()=>{syncs.push(1);return true;},
  normalizeScheduleDateKey:v=>String(v).replaceAll('/','-'),getAttendanceDateKey:v=>String(v).slice(0,10)
 };
 c.window={p79V5QueueInfoForId:()=>null,p79V5PrepareAttendanceEdit:()=>Promise.resolve(clone(cloudRecord))};
 vm.createContext(c);
 for(const f of ['p79AuditRecordIdentityMatches','openEditRecordModal','p79FindPlannedAttendanceEditRecord','p79OpenPlannedAttendanceEditor'])
  vm.runInContext(extract(f),c);
 return{c,modal,opened,messages,notices,statuses,mounts,restores,syncs};
}
(async()=>{
 let t=setup();
 await t.c.p79OpenPlannedAttendanceEditor(0,'IN');
 a(t.opened.length>=1,'real original editor is reached, not a mock');
 a(t.opened.every(openedId=>openedId===id),'initial fill and cloud-confirmed redraw must use the same original ID');
 a.equal(t.modal.classList.contains('hidden'),false,'editor opens inside the existing planned dialog');
 a.equal(t.statuses.at(-1).ready,true,'fresh matching cloud punch permits saving');
 a.deepEqual(t.mounts,['editRecordModal']);
 a.equal(t.syncs.length,0,'existing matching original requires no month-wide reload');
 a(!t.notices.some(x=>String(x[0]).includes('無法開啟')),'no missing-function warning');
 a.equal(t.c.p79AuditRecordIdentityMatches({empId:'E1',attNo:'0007'},record),true);
 a.equal(t.c.p79AuditRecordIdentityMatches({empId:'OTHER',attNo:'0007'},record),false,'conflicting employee ID must never edit');
 a.equal(t.c.p79AuditRecordIdentityMatches({empId:'E1',attNo:'OTHER'},record),false,'conflicting attendance number must never edit');
 a.equal(t.c.p79AuditRecordIdentityMatches({name:'相同名字'},record),false,'name alone is insufficient evidence');
 a.equal(t.c.p79AuditRecordIdentityMatches({attNo:'0007'},{...record,empId:''}),true,'legacy record may match exact attendance number');
 t=setup({rowEmp:'OTHER'});
 await t.c.p79OpenPlannedAttendanceEditor(0,'IN');
 a.equal(t.opened.length,0,'cross-person mismatch never opens editor');
 a.equal(t.mounts.length,0,'failed original identity does not mount editable overlay');
 a(t.notices.some(x=>/異動|編號不唯一/.test(String(x[0]))));
 t=setup({rowAtt:'0999'});
 await t.c.p79OpenPlannedAttendanceEditor(0,'IN');
 a.equal(t.opened.length,0,'mismatched attendance number cannot edit despite same empId');
 a.equal(t.modal.classList.contains('hidden'),true);
 a.equal(t.restores.length,1,'failed identity check restores mounted modal');
 t=setup({cloudRecord:{...record,timeStr:'2026/10/29 07:34:00'}});
 await t.c.p79OpenPlannedAttendanceEditor(0,'IN');
 a.equal(t.modal.classList.contains('hidden'),false,'form remains open for a cloud edit conflict');
 a.equal(t.statuses.at(-1).ready,false,'changed cloud baseline disables save');
 t=setup({missingModule:true});
 await t.c.p79OpenPlannedAttendanceEditor(0,'IN');
 a.equal(t.statuses.at(-1).ready,false,'unavailable module never silently grants save');
 console.log('PASS real planned editor: helper present; same-employee opens; cloud confirm; wrong employee/attNo blocked; changed cloud and missing module stay read-only');
})().catch(e=>{console.error(e);process.exitCode=1});
