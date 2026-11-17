/* PORT79 Leave V115 — visual/detail enhancement.
 * No automatic writes. All mutations continue through legacy authorized handlers. */
(function(){
'use strict';
const byId=x=>document.getElementById(x);
const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim().toUpperCase();
const dateOnly=v=>{
 const m=String(v??'').match(/(\d{4}-\d{2}-\d{2})/);
 return m?m[1]:'';
};
const viewType=v=>/^(特休假|特休|特別休假|年假)$/.test(String(v||''))?'年假':String(v||'未設定假別');
function personList(){try{return Array.isArray(employees)?employees:[]}catch(_){return [];}}
function records(){try{return Array.isArray(leaveRecords)?leaveRecords:[]}catch(_){return [];}}
function leaveValue(emp){try{return leaveBalanceInfo(emp)}catch(_){return {effectiveRemaining:null,newlyApproved:0,entitled:null,used:null}}}
function fmt(v){return v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v).toFixed(1)+' 天':'—'}
function updateCreatePreview(){
 const root=byId('p79CreatePreview');if(!root)return;
 const selected=byId('adminCreateLeaveEmployee')?.value;
 const emp=personList().find(p=>norm(p.empId)===norm(selected));
 const info=emp?leaveValue(emp):{effectiveRemaining:null,newlyApproved:0,entitled:null,used:null};
 const remaining=info.effectiveRemaining;
 const days=Number(byId('adminCreateLeaveDays')?.value)||0;
 const start=dateOnly(byId('adminCreateLeaveStart')?.value),end=dateOnly(byId('adminCreateLeaveEnd')?.value);
 const type=byId('adminCreateLeaveType')?.value||'';
 const annual=/特休|年假/.test(type);
 const deduct=annual?days:0;
 const after=remaining==null?null:Math.round((remaining-deduct)*10)/10;
 const conflicts=emp&&start&&end?records().filter(l=>
  norm(l.empId)===norm(emp.empId)&&String(l.status||'')!=='已駁回'&&
  (dateOnly(l.startDate||l.startTime)<=end&&dateOnly(l.endDate||l.endTime||l.startDate||l.startTime)>=start)
 ):[];
 const ok=!!emp&&!!days&&!!start&&!!end&&start<=end&&!conflicts.length&&(!annual||after!=null&&after>=0);
 byId('p79CreatePreviewPerson').innerHTML=emp?'<b>'+html(emp.name)+'（'+html(emp.empId)+'）</b><small>'+html(emp.dept||'未設定單位')+'｜'+html(emp.jobTitle||emp.deptDetail||'未設定職稱')+'</small>':'<b>尚未選擇請假人員</b><small>選擇正式在職名冊後顯示額度</small>';
 const cells={p79CreatePreviewBalance:fmt(remaining),p79CreatePreviewUsed:fmt(info.newlyApproved),p79CreatePreviewDays:days?fmt(deduct):'—',p79CreatePreviewAfter:after==null?'待確認':fmt(after)};
 for(const [key,value] of Object.entries(cells)){const el=byId(key);if(el)el.textContent=value;}
 const msg=byId('p79CreatePreviewStatus');
 if(msg){msg.classList.toggle('good',ok);msg.textContent=
  !emp?'請先選擇正式在職員工。':
  !start||!end||!days?'請選擇有效請假日期，送出前將再次核對正式資料。':
  conflicts.length?'注意：目前載入資料中有 '+conflicts.length+' 筆日期重疊的請假紀錄，請核對。':
  annual&&after==null?'尚無已確認的年假額度，需先核對人資匯入資料。':
  annual&&after<0?'預估餘額不足，請先核對年假額度。':
  '目前預覽未發現請假日期重疊；正式儲存仍以雲端資料核對為準。';
 }
}
function initPreview(){
 const dialog=byId('adminCreateLeaveDialog');if(!dialog)return;
 dialog.addEventListener('change',updateCreatePreview);
 dialog.addEventListener('input',updateCreatePreview);
 dialog.addEventListener('click',e=>{if(e.target.closest('#adminCreateLeaveEmployee,#adminCreateLeaveJob,.p79-day-applicant-switch'))queueMicrotask(updateCreatePreview);});
 new MutationObserver(()=>{if(dialog.open)updateCreatePreview()}).observe(dialog,{attributes:true,attributeFilter:['open']});
 updateCreatePreview();
}
/* New read-only detail screen for the real selected record; no fabricated audit history. */
function cell(label,value){return '<div class="p79-detail-cell"><small>'+html(label)+'</small><b>'+html(value??'—')+'</b></div>';}
function getDetailDialog(){
 let dialog=byId('p79LeaveDetailDialog');if(dialog)return dialog;
 dialog=document.createElement('dialog');dialog.id='p79LeaveDetailDialog';
 document.body.appendChild(dialog);
 dialog.addEventListener('click',e=>{
  const action=e.target.closest('[data-p79-detail-action]')?.dataset.p79DetailAction;
  if(!action)return;
  if(action==='close'){dialog.close();return;}
  if(action==='print'){window.print();return;}
  const record=records().find(l=>String(l.id)===String(dialog.dataset.leaveId));
  if(!record||!hasManage())return;
  if(action==='approve'||action==='reject'){
   const next=action==='approve'?'已核准':'已駁回';
   if(String(record.status)===next)return;
   dialog.close();
   void Promise.resolve(setLeaveStatus(String(record.id),next));
  }
  if(action==='delete'){
   dialog.close();
   void Promise.resolve(deleteLeave(String(record.id)));
  }
  if(action==='cover'){dialog.close();p79OpenLeaveCover(String(record.id));}
 });
 return dialog;
}
function hasManage(){try{return leaveAccess==='manage'}catch(_){return false;}}
function openLeaveDetail(rawId){
 const record=records().find(l=>String(l.id)===String(rawId));
 if(!record)return;
 const emp=personList().find(e=>norm(e.empId)===norm(record.empId)||record.attNo&&String(e.attNo||'')===String(record.attNo));
 const info=emp?leaveValue(emp):{effectiveRemaining:null,newlyApproved:0};
 const status=String(record.status||'待審核');
 const start=dateOnly(record.startDate||record.startTime),end=dateOnly(record.endDate||record.endTime||record.startDate||record.startTime);
 const workers=(window.p79LeaveCoverAssignments||[]).filter(x=>String(x.leaveId)===String(record.id))
  .flatMap(x=>x.workerIds||[]).map(x=>String(x));
 const uniqueWorkers=[...new Set(workers)];
 const workerNames=uniqueWorkers.map(x=>personList().find(e=>norm(e.empId)===norm(x))?.name||x);
 const month=start.slice(0,7),other=records().filter(l=>norm(l.empId)===norm(record.empId)&&dateOnly(l.startDate||l.startTime).startsWith(month))
  .sort((a,b)=>String(b.startDate||b.startTime).localeCompare(String(a.startDate||a.startTime))).slice(0,12);
 const approveAt=record.approvedAt||record.reviewedAt||record.updatedAt||'';
 const approver=record.approvedBy||record.reviewedBy||'';
 const stateBg=status==='已核准'?'#dff9e8':status==='已駁回'?'#ffe6eb':'#fff3d5';
 const stateFg=status==='已核准'?'#137849':status==='已駁回'?'#b12647':'#a16d0e';
 const dialog=getDetailDialog();
 dialog.dataset.leaveId=String(record.id);
 const editable=hasManage();
 const actions='<div class="p79-detail-actions">'+
 (editable?'<button type="button" class="primary" data-p79-detail-action="approve"'+(status==='已核准'?' disabled':'')+'>✓ 核准</button><button type="button" class="reject" data-p79-detail-action="reject"'+(status==='已駁回'?' disabled':'')+'>✕ 駁回</button><button type="button" class="delete" data-p79-detail-action="delete">刪除</button>':'')+
 '<button type="button" data-p79-detail-action="print">列印</button><button type="button" data-p79-detail-action="close">關閉</button></div>';
 dialog.innerHTML='<div class="p79-detail-heading"><div><h2>▣ 請假明細／審核</h2><div style="font-size:12px;color:#6a819d;margin-top:5px">依雲端已載入的正式請假資料顯示</div></div>'+actions+'</div>'+
 '<div class="p79-detail-body"><div class="p79-detail-columns">'+
 '<div class="p79-detail-stack">'+
 '<section class="p79-detail-card"><h3>♙ 申請基本資料</h3><div class="p79-detail-grid">'+
 cell('申請人員',record.name||emp?.name||'—')+cell('員工編號',record.empId||record.attNo||'—')+
 cell('單位',record.dept||emp?.dept||'—')+cell('職稱',emp?.jobTitle||emp?.deptDetail||'—')+
 cell('請假類型',viewType(record.leaveType))+cell('請假期間',(start||'—')+' ～ '+(end||'—'))+
 cell('請假天數',fmt(record.days??record.hours))+
 '</div><div class="p79-detail-note" style="margin-top:12px"><b>申請事由：</b>'+html(record.reason||'未填寫')+'</div></section>'+
 '<section class="p79-detail-card"><h3>♧ 代班與加班資訊</h3><div class="p79-detail-grid">'+
 cell('代班人員',workerNames.length?workerNames.join('、'):'無已儲存的代班人員')+
 cell('代班紀錄',uniqueWorkers.length+' 位人員')+
 '</div>'+(editable&&status==='已核准'?'<div style="margin-top:12px"><button type="button" data-p79-detail-action="cover">安排／查看代班</button></div>':'')+
 '<p style="color:#7185a1;font-size:12px;margin-bottom:0">加班是否已正式申報，仍須至現有加班明細功能查核。</p></section>'+
 '<section class="p79-detail-card"><h3>◷ 審核資訊</h3><div class="p79-detail-grid">'+
 cell('請假狀態',status)+cell('核准／更新時間',approveAt||'來源未提供')+
 cell('核准人員',approver||'來源未提供')+cell('資料來源',record.source||'正式請假紀錄')+
 '</div></section></div>'+
 '<div class="p79-detail-stack">'+
 '<section class="p79-detail-card"><h3>▣ 剩餘年假摘要</h3><div style="font-size:12px;color:#667f9b;margin-bottom:7px">目前已載入資料核對的剩餘年假</div><div class="p79-detail-balance">'+fmt(info.effectiveRemaining)+'</div>'+
 '<div class="p79-detail-grid" style="margin-top:12px">'+cell('匯入後另核准天數',fmt(info.newlyApproved))+cell('本筆請假天數',fmt(record.days??record.hours))+'</div>'+
 '<p style="font-size:12px;color:#7285a0">目前餘額已包含已核准紀錄的扣抵，不會再次扣除本筆。最終以正式雲端為準。</p></section>'+
 '<section class="p79-detail-card"><h3>♢ 審核狀態</h3><div class="p79-detail-note"><span style="display:inline-block;padding:5px 12px;border-radius:20px;background:'+stateBg+';color:'+stateFg+';font-weight:800">'+html(status)+'</span><p style="margin:10px 0 0">審核與刪除仍使用原系統權限驗證及雲端寫入流程。</p></div></section>'+
 '<section class="p79-detail-card"><h3>☁ 雲端資料核對</h3><div class="p79-detail-note">此畫面是已載入資料的唯讀明細。若資料剛被其他管理員修改，請重新整理後再審核。</div></section>'+
 '</div></div>'+
 '<section class="p79-detail-card p79-detail-history"><h3>▤ 同月其他請假紀錄（'+html(month||'未知月份')+'，共 '+other.length+' 筆）</h3><div style="overflow:auto"><table><thead><tr><th>請假期間</th><th>類型</th><th>天數</th><th>事由</th><th>狀態</th></tr></thead><tbody>'+
 other.map(l=>'<tr><td>'+html(dateOnly(l.startDate||l.startTime)+' ～ '+dateOnly(l.endDate||l.endTime||l.startDate||l.startTime))+'</td><td>'+html(viewType(l.leaveType))+'</td><td>'+html(l.days??l.hours??'—')+'</td><td>'+html(l.reason||'—')+'</td><td>'+html(l.status||'待審核')+'</td></tr>').join('')+
 '</tbody></table></div></section></div>';
 dialog.showModal();
}
function initDetailClicks(){
 const root=byId('adminLeaveBody');if(!root)return;
 root.addEventListener('click',event=>{
  const btn=event.target.closest('[data-p79-detail-id]');
  if(btn){event.preventDefault();openLeaveDetail(btn.dataset.p79DetailId);}
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{initPreview();initDetailClicks();});
else{initPreview();initDetailClicks();}
window.p79OpenLeaveDetail=openLeaveDetail;
})();