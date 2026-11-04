/* PORT79 daily independent leave/cover editor. Each date is a separate approved leave. */
(function(){
'use strict';
const $id=id=>document.getElementById(id);
const originalOpen=window.openAdminCreateLeave;
const originalSave=window.saveAdminCreateLeave;
const days=()=>p79DailyCreateDates();
const rows=new Map();
const safe=s=>esc(String(s??''));
const personOptions=(people,selected,label)=>'<option value="">'+label+'</option>'+people.map(p=>'<option value="'+safe(p.empId)+'"'+(String(p.empId)===String(selected)?' selected':'')+'>'+safe(p.name+'｜'+leavePersonJob(p))+'</option>').join('');
function redraw(){
 const root=$id('adminCreateLeaveDailyRows');
 if(!root)return;
 const daily=$id('adminCreateLeaveDaily').checked,plain=$id('adminCreateLeaveNoCover').checked;
 root.hidden=!daily||plain;
 $id('adminCreateLeaveWorkers').hidden=daily||plain;
 const applicant=$id('adminCreateLeaveApplicantWrap');
 if(applicant)applicant.hidden=false; // 上方統一選請假人員，逐日僅顯示代班
 $id('adminCreateLeaveRecommendation').hidden=daily&&!plain;
 if(root.hidden)return;
 const people=leaveCreatePeople();
 root.innerHTML=days().map(date=>{
  if(!rows.has(date))rows.set(date,{id:crypto.randomUUID(),applicant:'',applicantOverride:false,first:'',second:'',secondVisible:false,applicantJob:'',firstJob:'',secondJob:''});
  const row=rows.get(date);
  const defaultEmpId=String($id('adminCreateLeaveEmployee')?.value||'');
  const leaveId=row.applicantOverride?row.applicant:defaultEmpId;
  const leave=people.find(p=>String(p.empId)===String(leaveId));
  const available=leave?people.filter(p=>String(p.empId)!==String(leave.empId)&&String(p.dept||'').trim()===String(leave.dept||'').trim()):[];
  if(!available.some(p=>String(p.empId)===row.first))row.first='';
  if(!available.some(p=>String(p.empId)===row.second&&row.second!==row.first))row.second='';
  const field=(key,label,choices,placeholder)=>{
   const jobKey=key+'Job',allJobs=[...new Set(choices.map(leavePersonJob))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
   const chosenJob=String(row[jobKey]||'');
   const matched=choices.filter(p=>!chosenJob||leavePersonJob(p)===chosenJob);
   const jobOptions='<option value="">全部職稱</option>'+allJobs.map(job=>'<option value="'+safe(job)+'"'+(job===chosenJob?' selected':'')+'>'+safe(job)+'</option>').join('');
   return '<div class="p79-daily-person"><label>'+label+'職稱</label><select data-date="'+date+'" data-field="'+jobKey+'">'+jobOptions+'</select><label>'+label+'姓名</label><select data-date="'+date+'" data-field="'+key+'">'+personOptions(matched,row[key],placeholder)+'</select></div>';
  };
  const applicantInfo='<div class="p79-day-applicant"><span>請假人員：<strong>'+safe(leave?.name||'請先選上方請假人員')+'</strong>'+(leave?' <small>｜'+safe(leavePersonJob(leave))+'</small>':'')+'</span><button class="btn btn-sec p79-day-applicant-switch" type="button" data-applicant-toggle="'+date+'">'+(row.applicantOverride?'↩ 使用上方人員':'本日不同請假人員')+'</button></div>';
  const extraApplicant=row.applicantOverride?'<div class="p79-day-applicant-override">'+field('applicant','本日請假人員',people,'請選擇本日請假人員')+'</div>':'';
  return '<section class="p79-simple-day"><strong>'+date+'（'+['日','一','二','三','四','五','六'][new Date(date+'T12:00:00Z').getUTCDay()]+'）</strong>'+applicantInfo+extraApplicant+'<div class="p79-simple-grid">'+field('first','第一位代班',available,leave?'請選擇代班人員':'請先選上方請假人員')+'</div>'+(row.secondVisible?'<div class="p79-simple-second">'+field('second','第二位代班（選填）',available.filter(p=>String(p.empId)!==row.first),'不安排第二位')+'<button type="button" class="btn btn-sec" data-remove="'+date+'">移除</button></div>':'<button type="button" class="btn btn-sec p79-simple-add" data-add="'+date+'">＋ 第二位代班</button>')+'<small>'+(row.second?'兩位各代4小時':'一位代8小時')+'</small></section>';
 }).join('')||'<p>請選擇有效日期，最多62天。</p>';
 root.querySelectorAll('select[data-date]').forEach(el=>el.onchange=()=>{
  const row=rows.get(el.dataset.date);row[el.dataset.field]=el.value;
  if(el.dataset.field==='applicant'){row.first='';row.second='';row.firstJob='';row.secondJob='';}
  if(el.dataset.field==='applicantJob'){row.applicant='';row.first='';row.second='';row.firstJob='';row.secondJob='';}
  if(el.dataset.field==='firstJob')row.first='';
  if(el.dataset.field==='secondJob')row.second='';
  if(el.dataset.field==='first'&&row.second===row.first)row.second='';
  redraw();
 });
 root.querySelectorAll('[data-applicant-toggle]').forEach(el=>el.onclick=()=>{
  const row=rows.get(el.dataset.applicantToggle);
  if(!row)return;
  row.applicantOverride=!row.applicantOverride;
  if(row.applicantOverride){
   const base=people.find(p=>String(p.empId)===String($id('adminCreateLeaveEmployee')?.value||''));
   row.applicant=String(base?.empId||'');
   row.applicantJob=base?leavePersonJob(base):'';
  }else{row.applicant='';row.applicantJob='';}
  row.first='';row.second='';row.firstJob='';row.secondJob='';
  redraw();
 });
 root.querySelectorAll('[data-add]').forEach(el=>el.onclick=()=>{rows.get(el.dataset.add).secondVisible=true;redraw();});
 root.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{const row=rows.get(el.dataset.remove);row.secondVisible=false;row.second='';redraw();});
}
window.p79RenderDailyCreateCover=redraw;
document.addEventListener('change',event=>{if(event.target?.id==='adminCreateLeaveNoCover')redraw();});
window.openAdminCreateLeave=async function(...args){
 rows.clear();
 await originalOpen(...args);
 if(!$id('adminCreateLeaveDialog').open)return;
 $id('adminCreateLeaveDaily').checked=true;
 redraw();
};
async function saveDaily(){
 if(adminCreateLeaveBusy)return;
 const dates=days(),people=leaveCreatePeople(),type=$id('adminCreateLeaveType').value;
 const notice=$id('adminCreateLeaveMessage');
 if(!dates.length||!type){notice.textContent='請選擇日期與假別（最多62天）';return;}
 const plans=[];
 try{
  for(const date of dates){
   const row=rows.get(date)||{},effectiveId=row.applicantOverride?row.applicant:String($id('adminCreateLeaveEmployee')?.value||'');
   const employee=people.find(p=>String(p.empId)===String(effectiveId));
   if(!employee)throw Error(date+(row.applicantOverride?' 請選擇本日請假人員':' 請先選擇上方請假人員'));
   const ids=[row.first,row.second].filter(Boolean);
   if(!ids.length||new Set(ids.map(String)).size!==ids.length)throw Error(date+' 請選擇一至兩位不同代班人員');
   if(!String(employee.dept||'').trim())throw Error(date+' 請假人員未設定部門');
   for(const id of ids){
    const worker=people.find(p=>String(p.empId)===String(id));
    if(!worker||String(worker.empId)===String(employee.empId)||String(worker.dept||'').trim()!==String(employee.dept||'').trim())throw Error(date+' 代班人員必須是同部門在職的其他人員');
   }
   plans.push({date,id:row.id,employee,ids,mode:ids.length===2?'two':'one'});
  }
 }catch(e){notice.textContent=e.message;return;}
 const button=$id('adminCreateLeaveSave'),done=[],entries=[];
 adminCreateLeaveBusy=true;button.disabled=true;button.textContent='逐日儲存中…';
 try{
  const fresh=await p79ReadCurrentLeaveCoverState();
  if(!fresh?.ok||!Array.isArray(fresh.leaveRecords)||!Array.isArray(fresh.leaveCoverAssignments))throw Error(fresh?.error||'無法核對雲端資料');
  for(const p of plans){
   notice.textContent='正在儲存 '+p.date+'｜'+p.employee.name;
   const plan=p79PlanLeaveCoverRequest(fresh.leaveRecords,fresh.leaveCoverAssignments,{id:p.id,empId:p.employee.empId,leaveType:type,startDate:p.date,endDate:p.date,mode:p.mode,workerIds:p.ids});
   if(!plan.existing){
    await postCloud({action:'addLeaveRecord',leave:{id:plan.leaveId,empId:p.employee.empId,attNo:p.employee.attNo||'',name:p.employee.name||'',dept:p.employee.dept||'',leaveType:type,startDate:p.date,endDate:p.date,days:1,reason:$id('adminCreateLeaveReason').value.trim(),status:'已核准',source:'manual-admin'}});
    fresh.leaveRecords.push({id:plan.leaveId,empId:p.employee.empId,leaveType:type,startDate:p.date,endDate:p.date,status:'已核准'});
   }
   if(!plan.covered){
    const result=await postCloud({action:'saveLeaveCoverAssignment',leaveId:plan.leaveId,mode:p.mode,workerIds:p.ids});
    if(!result?.ok)throw Error('代班儲存未獲雲端確認');
    fresh.leaveCoverAssignments.push({leaveId:plan.leaveId,startDate:p.date,endDate:p.date,mode:p.mode,workerIds:p.ids});
    for(const id of p.ids){const worker=people.find(e=>String(e.empId)===String(id));entries.push({leaveId:plan.leaveId,empId:String(id),name:worker?.name||'',date:p.date,forEmpId:String(p.employee.empId)});}
   }
   done.push(p.date+' '+p.employee.name);
  }
  $id('adminCreateLeaveDialog').close();
  setStatus('✅ 已儲存 '+done.length+' 筆請假及代班；加班另列待核對，不會自動認定已出勤或已申報','success');
  if(entries.length){
   sessionStorage.setItem('port79_leave_overtime_handoff_v1',JSON.stringify({id:entries[0].leaveId,createdAt:Date.now(),entries}));
   // 請假與代班先完成，僅建立待核對清單；不強制跳入加班表單。
   p79ActivateLeaveHandoff();
   p79UpdateLeaveHandoffBanner();
  }
  void loadCloud(false,true);
 }catch(error){
  notice.textContent='已完成 '+done.length+' 天：'+done.join('、')+'。剩餘未確認：'+String(error?.message||error)+'。請先核對雲端避免重複新增。';
  void loadCloud(false,true);
 }finally{adminCreateLeaveBusy=false;button.disabled=false;button.textContent='儲存請假並安排代班';}
}
window.saveAdminCreateLeave=function(){
 if($id('adminCreateLeaveDaily')?.checked&&!$id('adminCreateLeaveNoCover')?.checked)return saveDaily();
 return originalSave();
};
})();