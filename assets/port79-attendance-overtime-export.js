/* PORT79 考勤日期右鍵：加班明細匯出 + GAS 雲端匯出稽核。永不寄送郵件。 */
(function(){
'use strict';
if(!/\/attendance\/?/.test(location.pathname))return;
const dialogId='p79OvertimeDateExportDialog';
const cache=new Map();
let currentDate='',currentRows=[],latestAudit=[],auditAvailable=false,loading=false,exporting=false,viewOnly=false;
const h=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=x=>String(x||'').trim().toUpperCase();
const dateValid=x=>/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(String(x||''));
const token=()=>typeof getAttendanceEmployeeMasterToken==='function'?String(getAttendanceEmployeeMasterToken()||''):'';
const gas=()=>typeof getActiveGasUrl==='function'?String(getActiveGasUrl()||''):'';
const notify=(message,type='info')=>{if(typeof showToast==='function')showToast(message,type);else console.info(message);};
function sheetRows(json,date){
 const persons=new Map((Array.isArray(json.employees)?json.employees:[]).map(e=>[id(e.empId||e.id),e]));
 const unique=new Set(),out=[];
 for(const row of (Array.isArray(json.schedules)?json.schedules:[])){
  const empId=id(row.empId),meta=row.schedule?.__meta?.[date]||{};
  if(!empId||meta.overtimeExcluded===true)continue;
  const revoked=new Set((meta.overtimeRevocations||[]).filter(x=>x?.confirmed===true).map(x=>String(x.reportId)));
  const reports=[...(Array.isArray(meta.overtimeReports)?meta.overtimeReports:[]),meta.overtimeReport].filter(Boolean);
  const person=persons.get(empId)||row;
  for(const report of reports){
    const reportId=String(report?.id||'').trim(),key=empId+'|'+reportId;
    if(!reportId||revoked.has(reportId)||unique.has(key))continue;
    unique.add(key);
    out.push({date,empId,reportId,report,employeeName:String(person.name||row.name||empId),
      department:String(person.dept||row.dept||''),jobTitle:String(person.jobTitle||row.jobTitle||'')});
  }
 }
 return out.sort((a,b)=>a.employeeName.localeCompare(b.employeeName,'zh-Hant')||a.reportId.localeCompare(b.reportId));
}
async function api(action,body,method='GET'){
 const base=gas(),key=token();
 if(!base||!key)throw Error('尚未取得有效的考勤登入與雲端連線，請重新登入');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  let response;
  if(method==='GET'){
   const url=new URL(base,location.href);
   url.searchParams.set('action',action);
   url.searchParams.set('gcToken',key);
   for(const [k,v] of Object.entries(body||{}))url.searchParams.set(k,String(v));
   url.searchParams.set('_',String(Date.now()));
   response=await fetch(url.toString(),{cache:'no-store',signal:controller.signal});
  }else{
   response=await fetch(base,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
     body:JSON.stringify({action,gcToken:key,...body}),cache:'no-store',signal:controller.signal});
  }
  const raw=await response.text();
  let data;try{data=JSON.parse(raw);}catch(e){throw Error('雲端未回傳正確資料，請確認 GAS 正式部署');}
  if(!response.ok||data.ok===false)throw Error(data.error||'雲端回傳失敗');
  return data;
 }finally{clearTimeout(timer);}
}
function ensureDialog(){
 let d=document.getElementById(dialogId);if(d)return d;
 d=document.createElement('dialog');d.id=dialogId;
 d.setAttribute('aria-label','考勤日期加班明細匯出');
 d.style.cssText='width:min(970px,calc(100vw - 20px));max-height:88vh;padding:0;border:1px solid #cbd5e1;border-radius:16px;color:#0f172a;background:white;box-shadow:0 22px 70px #0f172a5c;';
 d.innerHTML='<div style="padding:16px 18px 12px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:12px"><div><div id="p79OtExportTitle" style="font-weight:800;font-size:19px">匯出加班明細</div><small style="color:#64748b">考勤日期右鍵開啟。只有正式申報且未撤銷的加班才列入匯出。</small></div><button type="button" id="p79OtExportClose" style="background:#e2e8f0;border-radius:9px;padding:8px 11px;font-weight:700">✕ 關閉</button></div><div id="p79OtExportStatus" role="status" style="margin:12px 18px;color:#475569;font-size:13px"></div><div style="max-height:55vh;overflow:auto;margin:0 18px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#eff6ff"><th style="padding:9px">選擇</th><th>姓名</th><th>工號</th><th>加班類型</th><th>時段</th><th>申報時數</th><th>匯出狀態</th></tr></thead><tbody id="p79OtExportRows"></tbody></table></div><div style="padding:14px 18px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap"><button type="button" id="p79OtExportReload" style="padding:9px 14px;border-radius:9px;background:#e0f2fe;color:#075985;font-weight:700">重新核對</button><button type="button" id="p79OtExportSave" style="padding:9px 16px;border-radius:9px;background:#047857;color:white;font-weight:800">匯出所選加班明細</button></div>';
 document.body.appendChild(d);
 d.querySelector('#p79OtExportClose').addEventListener('click',()=>d.close());
 d.querySelector('#p79OtExportReload').addEventListener('click',()=>open(currentDate,true,viewOnly));
 d.querySelector('#p79OtExportSave').addEventListener('click',exportSelected);
 d.addEventListener('click',e=>{if(e.target===d)d.close();});
 return d;
}
function setStatus(s){const el=ensureDialog().querySelector('#p79OtExportStatus');if(el)el.textContent=s;}
function statusOf(row){
 const found=latestAudit.filter(x=>x.date===row.date&&id(x.empId)===row.empId&&String(x.reportId)===row.reportId);
 if(!found.length)return {label:auditAvailable?'尚未匯出':'雲端紀錄未確認',done:false};
 // 報表可能以相同申報 ID 修改，必須用摘要再次比對，避免誤標。
 const valid=found.filter(x=>!row.version||x.version===row.version);
 if(!valid.length)return {label:'申報已更新／需重新匯出',done:false};
 const last=valid[valid.length-1];
 return {label:'已匯出｜'+String(last.actor||'管理員')+'｜'+String(last.exportedAt||'').slice(0,16).replace('T',' '),done:true};
}
function showRows(){
 const body=ensureDialog().querySelector('#p79OtExportRows');
 if(!currentRows.length){body.innerHTML='<tr><td colspan="'+(viewOnly?'5':'7')+'" style="text-align:center;padding:24px;color:#64748b">當日沒有有效的正式加班申報；此日期不能標記為「已申報」。</td></tr>';return;}
 body.innerHTML=currentRows.map((r,i)=>{
  const stat=viewOnly?{done:false,label:''}:statusOf(r),cls=stat.done?'color:#047857':'color:#a16207';
  return '<tr style="border-bottom:1px solid #e2e8f0">'
   +(viewOnly?'':'<td style="text-align:center;padding:9px"><input type="checkbox" data-p79-export-index="'+i+'" '+(stat.done?'':'checked')+'></td>')
   +'<td style="padding:9px">'+h(r.employeeName)+'</td><td>'+h(r.empId)+'</td><td>'+h(r.report.typeName||r.report.category||'加班')+'</td>'
   +'<td>'+h(r.report.code||[r.report.overtimeStart,r.report.overtimeEnd].filter(Boolean).join('–'))+'</td><td>'+h(r.report.declaredHours??'')+'</td>'
   +(viewOnly?'':'<td style="'+cls+';font-weight:700">'+h(stat.label)+'</td>')+'</tr>';
 }).join('');
}
async function digest(report){
 if(!crypto?.subtle)return '';
 const encoded=new TextEncoder().encode(JSON.stringify(report));
 const bytes=await crypto.subtle.digest('SHA-256',encoded);
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function stamp(){
 const date=new Date();
 return date.getFullYear()+String(date.getMonth()+1).padStart(2,'0')+String(date.getDate()).padStart(2,'0')+'_'+String(date.getHours()).padStart(2,'0')+String(date.getMinutes()).padStart(2,'0');
}
async function fetchMonth(month,force){
 const key=token();
 const existing=cache.get(month);
 if(!force&&existing&&existing.token===key&&Date.now()-existing.at<45000)return existing.data;
 const data=await api('getScheduleDataSecure',{month});
 cache.set(month,{at:Date.now(),token:key,data});
 return data;
}
async function open(date,force=false,reportedOnly=false){
 if(!dateValid(date))return notify('請先選擇正確的考勤日期','warning');
 if(loading||exporting){notify('上一份加班報表仍在處理中，請完成後再切換日期','warning');return;}
 const d=ensureDialog();
 currentDate=date;viewOnly=reportedOnly===true;
 d.querySelector('#p79OtExportTitle').textContent=viewOnly?date+'｜已申報加班紀錄':'匯出 '+date+' 加班明細';
 d.querySelector('#p79OtExportSave').style.display=viewOnly?'none':'';
d.querySelector('thead th:first-child').style.display=viewOnly?'none':'';
 d.querySelector('thead th:last-child').style.display=viewOnly?'none':'';
 if(!d.open)d.showModal();
 loading=true;d.querySelector('#p79OtExportSave').disabled=true;setStatus('正在核對正式班表與雲端匯出紀錄…');
 d.querySelector('#p79OtExportRows').innerHTML='';
 try{
  const month=date.slice(0,7);
  const [schedule,auditResult]=await Promise.all([
    fetchMonth(month,force),
    viewOnly?Promise.resolve({ok:false}):api('getOvertimeExportAudit',{month}).then(x=>({ok:true,data:x})).catch(e=>({ok:false,error:e}))
  ]);
  currentRows=sheetRows(schedule,date);
  await Promise.all(currentRows.map(async r=>{r.version=await digest(r.report);}));
  auditAvailable=auditResult.ok&&auditResult.data.auditVersion===1;
  latestAudit=auditAvailable?(auditResult.data.entries||[]):[];
  const done=currentRows.filter(row=>statusOf(row).done).length;
  const hint=auditAvailable?'雲端稽核已連線；每筆記錄含匯出者、時間及申報編號。':'後端匯出紀錄尚未啟用：仍可下載明細，但本次不會顯示為「已匯出」，請部署新版 GAS。';
  setStatus(viewOnly?'雲端正式有效申報 '+currentRows.length+' 筆（已撤銷紀錄排除）；僅供查看，不會新增、取消或修改申報。':'正式申報 '+currentRows.length+' 筆｜已匯出 '+done+' 筆｜未匯出 '+(currentRows.length-done)+' 筆。'+hint);
  showRows();if(!viewOnly)void refreshDateBadges(month);
 }catch(error){currentRows=[];showRows();setStatus('讀取失敗：'+(error?.message||error));notify('加班明細讀取失敗：'+(error?.message||error),'warning');}
 finally{loading=false;d.querySelector('#p79OtExportSave').disabled=false;}
}
async function ensureSheetLibrary(){
 if(typeof XLSX!=='undefined'&&XLSX?.utils)return XLSX;
 if(typeof p79LoadXlsxLibrary==='function')await p79LoadXlsxLibrary();
 else if(typeof ensureExcelLibrary==='function')await ensureExcelLibrary();
 if(typeof XLSX==='undefined'||!XLSX?.utils||!XLSX?.writeFile)throw Error('試算表套件尚未載入，無法匯出');
 return XLSX;
}
async function exportSelected(){
 const d=ensureDialog(),button=d.querySelector('#p79OtExportSave');
 if(button.disabled||exporting)return;
 const indices=[...d.querySelectorAll('input[data-p79-export-index]:checked')].map(x=>Number(x.dataset.p79ExportIndex));
 const selected=indices.map(i=>currentRows[i]).filter(Boolean);
 if(!selected.length)return notify('請先勾選要匯出的加班明細','warning');
 button.disabled=true;exporting=true;
 const exportDate=currentDate;
 try{
  const sheet=await ensureSheetLibrary();
  const header=['日期','姓名','工號','部門','職稱','加班類型','加班時段','開始時間','結束時間','申報時數','申報狀態','申報編號','備註'];
  const values=selected.map(r=>[r.date,r.employeeName,r.empId,r.department,r.jobTitle,r.report.typeName||r.report.category||'加班',r.report.code||'',r.report.overtimeStart||'',r.report.overtimeEnd||'',r.report.declaredHours??'',r.report.planned===true?'預排／待核對':'正式申報',r.reportId,r.report.note||'']);
  const book=sheet.utils.book_new(),tab=sheet.utils.aoa_to_sheet([header,...values]);
  tab['!cols']=[{wch:14},{wch:16},{wch:17},{wch:20},{wch:17},{wch:20},{wch:19},{wch:12},{wch:12},{wch:13},{wch:17},{wch:35},{wch:30}];
  sheet.utils.book_append_sheet(book,tab,'加班明細');
  const fileName='加班明細_'+exportDate.replaceAll('-','')+'_'+stamp()+'.xlsx';
  sheet.writeFile(book,fileName);
  setStatus('已發起下載 '+selected.length+' 筆加班明細，正在寫入雲端匯出紀錄…');
  const requestId='OTEXPORT-'+Date.now()+'-'+Math.random().toString(36).slice(2,12);
  try{
   const result=await api('recordOvertimeReportExport',{date:exportDate,requestId,fileName,
     entries:selected.map(r=>({empId:r.empId,reportId:r.reportId,version:r.version}))},'POST');
   if(result.auditVersion!==1||Number(result.count)!==selected.length)throw Error('後端未回傳完整記錄');
   notify('加班明細已匯出，雲端已記錄 '+selected.length+' 筆','success');
   exporting=false;
   await open(exportDate,true);
  }catch(error){
   setStatus('試算表已發起下載，但雲端未確認匯出紀錄：'+(error?.message||error)+'。請勿將這些人員標示為已匯出；需部署／檢查 GAS。');
   notify('匯出完成，但雲端稽核尚未確認','warning');
  }
 }catch(error){setStatus('匯出失敗：'+(error?.message||error));notify('匯出加班明細失敗：'+(error?.message||error),'warning');}
 finally{exporting=false;button.disabled=false;}
}
async function refreshDateBadges(month){
 if(!auditAvailable||!cache.has(month))return;
 const data=cache.get(month).data;
 const buttons=document.querySelectorAll('#p79AttendanceDateStrip button[data-p79-attendance-date]');
 for(const btn of buttons){
  const date=btn.dataset.p79AttendanceDate;
  if(!date||date.slice(0,7)!==month)continue;
  // 先清理舊標記，僅依正式有效申報與對應版號統計，不以整日一次匯出推斷全部人員。
  btn.querySelector('[data-p79-export-badge]')?.remove();
  const reports=sheetRows(data,date);
  if(!reports.length)continue;
  const versions=await Promise.all(reports.map(r=>digest(r.report)));
  const done=reports.filter((r,i)=>latestAudit.some(a=>a.date===date&&id(a.empId)===r.empId&&String(a.reportId)===r.reportId&&!!versions[i]&&String(a.version)===versions[i])).length;
  if(done){
   const mark=document.createElement('small');
   mark.dataset.p79ExportBadge='1';
   mark.style.cssText='display:inline-block;margin-left:5px;border-radius:5px;padding:1px 4px;background:#dcfce7;color:#166534;font-size:10px';
   mark.textContent=done===reports.length?'已匯出':'已匯'+done+'/'+reports.length;
   btn.appendChild(mark);
  }
  btn.title='按右鍵：匯出此日加班明細'+(done?'（目前已記錄 '+done+'/'+reports.length+' 筆）':'');
 }
}
document.addEventListener('contextmenu',e=>{
 const button=e.target.closest?.('#p79AttendanceDateStrip button[data-p79-attendance-date]');
 const input=e.target.closest?.('#attendanceRecordActionsHost input[type="date"]');
 if(!button&&!input)return;
 const date=button?.dataset.p79AttendanceDate||input?.value;
 if(!dateValid(date))return;
 e.preventDefault();void open(date);
});
document.addEventListener('keydown',e=>{
 if(!(e.shiftKey&&e.key==='F10'||e.key==='ContextMenu'))return;
 const target=e.target.closest?.('#p79AttendanceDateStrip button[data-p79-attendance-date]');
 if(!target)return;
 e.preventDefault();void open(target.dataset.p79AttendanceDate);
});
window.P79AttendanceOvertimeExport={open,openReported:date=>open(date,true,true)};
})();