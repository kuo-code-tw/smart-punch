// Planned overtime: actual punch edit/backfill stays in the modal dialog.
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
const extract=name=>{
 const i=html.search(new RegExp('        (?:async )?function '+name+'\\('));
 const end=html.indexOf('\n        }',i);
 a(i>=0&&end>i,'real function missing: '+name);
 return html.slice(i,end+10);
};
const host=()=>({children:[],
 appendChild(node){node.parentNode?.removeChild?.(node);this.children.push(node);node.parentNode=this;return node;},
 removeChild(node){const i=this.children.indexOf(node);if(i>=0)this.children.splice(i,1);node.parentNode=null;},
 insertBefore(node,target){node.parentNode?.removeChild?.(node);const i=this.children.indexOf(target);this.children.splice(i<0?this.children.length:i,0,node);node.parentNode=this;},
 replaceChild(node,target){node.parentNode?.removeChild?.(node);const i=this.children.indexOf(target);a(i>=0,'restore anchor exists');this.children[i]=node;target.parentNode=null;node.parentNode=this;}});
const origin=host(),dialog=Object.assign(host(),{open:true,closeCount:0,close(){this.closeCount++;this.open=false},showModal(){this.open=true}});
const state=()=>{const x=new Set(['hidden']);return{contains:k=>x.has(k),add:k=>x.add(k),remove:k=>x.delete(k)}};
const edit={id:'editRecordModal',classList:state()},add={id:'addRecordModal',classList:state()},toggle={setAttribute(){},title:''};
origin.appendChild(edit);origin.appendChild(add);
const nodes={p79OvertimePlannedDialog:dialog,p79OvertimePlannedToggle:toggle,editRecordModal:edit,addRecordModal:add};
const shown=[],records=[{id:'IN1',empId:'E1',attNo:'7',status:'上班簽到',timeStr:'2026/10/28 23:38:00'}];
const planned={empId:'E1',attNo:'7',name:'測試員工',dateKey:'2026-10-28',reportVerified:true,overtimeReport:{planned:true,id:'PLAN'},clockIn:records[0],clockOut:null};
const c={window:null,document:{getElementById:id=>nodes[id]||null,createComment:txt=>({textContent:txt})},
 p79OvertimePlannedDisplayedRows:[planned],records,p79PlannedAttendanceModalAnchors:new Map(),
 currentEmp:{empId:'ADMIN'},canPerformAdminAction:()=>true,currentPort79SsoToken:()=> 'USER-1',
 p79DirectAttendanceTimestamp:r=>Date.parse(r.timeStr.replaceAll('/','-').replace(' ','T')+'+08:00'),
 getAttendanceRecordType:r=>r.status==='上班簽到'?'IN':'OUT',
 normalizeAttendanceStatsAttNo:n=>String(n||'').trim(),loadAttendanceMonthFromCloud:async()=>true,
 normalizeScheduleDateKey:s=>String(s).replaceAll('/','-'),getAttendanceDateKey:s=>s.slice(0,10),
 renderOvertimeStats(){},p79OvertimeCalculationCache:null,
 encodeURIComponent,decodeURIComponent,Date,Intl,Set,Map,String,Array,Number,JSON,console,
 showToast:msg=>shown.push(msg),
 openEditRecordModal:async(...args)=>{shown.push({kind:'edit',args});edit.classList.remove('hidden');return true},
 openRowManualAdd:async(...args)=>{shown.push({kind:'add',args});add.classList.remove('hidden');return true}};
c.window=c;vm.createContext(c);
for(const name of ['p79PlannedPunchNotice','p79SyncOvertimePlannedDialogState','p79MountAttendanceModalInPlannedDialog',
 'p79RestoreAttendanceModalFromPlannedDialog','p79PlannedAttendanceModalIsOpen',
 'p79PlannedDialogCancel','p79PlannedDialogClosed','p79CloseOvertimePlannedDialog',
 'p79ToggleOvertimePlanned','p79FindPlannedAttendanceEditRecord',
 'p79OpenPlannedAttendanceEditor','p79OpenPlannedMissingPunchEditor'])
 vm.runInContext(extract(name),c);
(async()=>{
 await c.p79OpenPlannedAttendanceEditor(0,'IN');
 a.equal(dialog.open,true,'edit never closes parent planned list');
 a.equal(dialog.closeCount,0);
 a.equal(edit.parentNode,dialog,'real editor in native top-layer dialog');
 a.equal(shown.at(-1).kind,'edit');
 a.equal(shown.at(-1).args[0],'IN1','use exact original punch ID');
 a.equal(shown.at(-1).args[1],'IN','use original IN type');
 a.equal(shown.at(-1).args[2],records[0].timeStr,'use original time for cloud revalidation');
 a.equal(shown.at(-1).args[5],true,'force official-cloud baseline check');
 c.p79CloseOvertimePlannedDialog();
 a.equal(dialog.closeCount,0,'close blocked during editing');
 const cancel={prevented:false,preventDefault(){this.prevented=true}};
 c.p79PlannedDialogCancel(cancel);a.equal(cancel.prevented,true,'Esc cannot discard unsaved edit');
 edit.classList.add('hidden');c.p79RestoreAttendanceModalFromPlannedDialog('editRecordModal');
 a.equal(edit.parentNode,origin,'editor returns to original DOM location');
 await c.p79OpenPlannedMissingPunchEditor(0,'OUT');
 a.equal(add.parentNode,dialog,'shared missing-punch form inside planned dialog');
 a.equal(dialog.open,true,'missing OUT never jumps to main page');
 const call=shown.at(-1);
 a.equal(call.kind,'add');
 a.equal(decodeURIComponent(call.args[0]),'E1');
 a.equal(decodeURIComponent(call.args[1]),'2026/10/28');
 a.equal(call.args[2],'下班簽退');
 a.equal(decodeURIComponent(call.args[3]),'IN1','new OUT pairs with existing IN');
 c.p79CloseOvertimePlannedDialog();a.equal(dialog.closeCount,0,'close blocked during backfill');
 add.classList.add('hidden');c.p79RestoreAttendanceModalFromPlannedDialog('addRecordModal');
 a.equal(add.parentNode,origin);
 c.p79CloseOvertimePlannedDialog();a.equal(dialog.closeCount,1,'parent closes once edit complete');
 dialog.open=true;planned.dateKey='2026-12-01';
 await c.p79OpenPlannedMissingPunchEditor(0,'OUT');
 a.equal(add.parentNode,origin,'future day never mounts form');
 planned.dateKey='2026-10-28';c.canPerformAdminAction=()=>false;
 await c.p79OpenPlannedMissingPunchEditor(0,'OUT');
 a.equal(add.parentNode,origin,'missing permission cannot open');
 a(html.includes("p79RestoreAttendanceModalFromPlannedDialog('editRecordModal')"),'shared edit close restores overlay');
 a(html.includes("p79RestoreAttendanceModalFromPlannedDialog('addRecordModal')"),'shared add close restores overlay');
 a(html.includes('onclick="p79OpenPlannedMissingPunchEditor('),'button uses in-dialog handler');
 a(!html.includes("p79CloseOvertimePlannedDialog();openRowManualAdd("),'old jump-back handler removed');
 a(html.includes('p79RenderOnlyVisibleAttendanceView();'),'existing save refreshes the visible view');
 console.log('PASS planned in-dialog edit/add: exact ID, linked missing OUT, restore after save/cancel, Esc/close, future and permission guard');
})().catch(e=>{console.error(e);process.exit(1)});
