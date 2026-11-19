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
// 加班類型各人獨立選擇，僅作待申報偏好，正式核對仍以班表與打卡為準。
const overtimeTypes=['休息日加班','平日延時加班','國定假日加班','例假加班'];
function overtimeTypeField(date,row,workerKey){
 const key=workerKey+'OvertimeType',selected=String(row[key]||'');
 return '<div class="p79-worker-overtime"><label>本位加班類型</label><select data-date="'+date+'" data-field="'+key+'"><option value="">依本人班表判斷</option>'+
  overtimeTypes.map(type=>'<option value="'+safe(type)+'"'+(selected===type?' selected':'')+'>'+safe(type)+'</option>').join('')+
  '</select><small>此選項獨立於其他代班人員，申報前仍須核對班表與打卡。</small></div>';
}
function legacyRedraw(){
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
  if(!rows.has(date))rows.set(date,{id:crypto.randomUUID(),applicant:'',applicantOverride:false,first:'',second:'',secondVisible:false,applicantJob:'',firstJob:'',secondJob:'',firstOvertimeType:'',secondOvertimeType:''});
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
  return '<section class="p79-simple-day"><strong>'+date+'（'+['日','一','二','三','四','五','六'][new Date(date+'T12:00:00Z').getUTCDay()]+'）</strong>'+applicantInfo+extraApplicant+'<div class="p79-simple-grid">'+field('first','第一位代班',available,leave?'請選擇代班人員':'請先選上方請假人員')+overtimeTypeField(date,row,'first')+'</div>'+(row.secondVisible?'<div class="p79-simple-second">'+field('second','第二位代班（選填）',available.filter(p=>String(p.empId)!==row.first),'不安排第二位')+overtimeTypeField(date,row,'second')+'<button type="button" class="btn btn-sec" data-remove="'+date+'">移除</button></div>':'<button type="button" class="btn btn-sec p79-simple-add" data-add="'+date+'">＋ 第二位代班</button>')+'<small>'+(row.second?'兩位各代4小時':'一位代8小時')+'</small></section>';
 }).join('')||'<p>請選擇有效日期，最多62天。</p>';
 root.querySelectorAll('select[data-date]').forEach(el=>el.onchange=()=>{
  const row=rows.get(el.dataset.date);row[el.dataset.field]=el.value;
  if(el.dataset.field==='applicant'){row.first='';row.second='';row.firstJob='';row.secondJob='';row.firstOvertimeType='';row.secondOvertimeType='';}
  if(el.dataset.field==='applicantJob'){row.applicant='';row.first='';row.second='';row.firstJob='';row.secondJob='';row.firstOvertimeType='';row.secondOvertimeType='';}
  if(el.dataset.field==='firstJob'||el.dataset.field==='first'){row.firstOvertimeType='';if(el.dataset.field==='firstJob')row.first='';}
  if(el.dataset.field==='secondJob'||el.dataset.field==='second'){row.secondOvertimeType='';if(el.dataset.field==='secondJob')row.second='';}
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
  row.first='';row.second='';row.firstJob='';row.secondJob='';row.firstOvertimeType='';row.secondOvertimeType='';
  redraw();
 });
 root.querySelectorAll('[data-add]').forEach(el=>el.onclick=()=>{rows.get(el.dataset.add).secondVisible=true;redraw();});
 root.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{const row=rows.get(el.dataset.remove);row.secondVisible=false;row.second='';row.secondOvertimeType='';redraw();});
}

let smartDay='',smartMonthKey='',smartSerial=0,smartRosters=null,smartLeaves=[],smartCovers=[],smartLoadStatus='';
function smartOptions(date,row,target,people){
 return {date,people,target,selected:[row.first,row.second].filter(Boolean),mode:row.secondVisible?'two':'one',
  jobFilter:row.filterJob||'',nameFilter:row.filterName||'',advancedOpen:row.advancedOpen===true,slotJobs:row.slotJobs||[],
  rosters:smartRosters,leaves:smartLeaves,covers:smartCovers,excludeLeaveId:row.id||'',scope:'new'};
}
function refreshSmartRosters(){
 const picker=window.P79SmartCoverPicker,helper=window.P79LeaveCoverSuggest;
 if(!picker||!helper||!$id('adminCreateLeaveDialog')?.open)return;
 const dateList=days(),months=[...new Set(dateList.map(x=>x.slice(0,7)))];
 const requested=months.join(',');
 if(requested===smartMonthKey)return;
 smartMonthKey=requested;const serial=++smartSerial;
 smartRosters=null;smartLeaves=[];smartCovers=[];
 if(!months.length)return;
 const token=leaveRequestToken();
 if(!token){smartLoadStatus='尚未驗證管理員身分，請重新登入';return;}
 smartLoadStatus='正在核對正式班表與已核准請假…';
 void Promise.all(months.map(month=>jsonFetch(GAS_URL+'?action=getScheduleDataSecure&gcToken='+encodeURIComponent(token)+
   '&month='+encodeURIComponent(month)+'&_='+Date.now(),{cache:'no-store',redirect:'follow'},22000)
   .then(data=>({...data,month:data.month||month})))).then(payloads=>{
  const rosters=helper.mergeRosters(payloads);
  if(serial!==smartSerial||!$id('adminCreateLeaveDialog')?.open)return;
  smartRosters=rosters;
  smartLeaves=[...(typeof leaveRecords!=='undefined'?leaveRecords:[]),...payloads.flatMap(x=>x.leaveRecords||[])];
  smartCovers=[...(window.p79LeaveCoverAssignments||[]),...payloads.flatMap(x=>x.leaveCoverAssignments||[])];
  smartLoadStatus='正式班表已核對；排休人員優先推薦，實際加班仍需審核。';
  const people=leaveCreatePeople();
  dateList.forEach(date=>{
   const row=rows.get(date);if(!row||row.manual||row.first)return;
   const id=row.applicantOverride?row.applicant:String($id('adminCreateLeaveEmployee')?.value||'');
   const target=people.find(p=>String(p.empId)===id);
   const ids=picker.recommend(smartOptions(date,row,target,people),row.secondVisible?'two':'one');
   row.first=ids[0]||'';row.second=ids[1]||'';
  });
  redraw();
 }).catch(error=>{
  if(serial!==smartSerial)return;
  smartRosters=null;
  smartLoadStatus='正式班表未完成核對：'+String(error?.message||error)+'。可以人工選人，但不會自動指定。';
  redraw();
 });
}
function redraw(){
 if(!window.P79SmartCoverPicker)return legacyRedraw();
 const root=$id('adminCreateLeaveDailyRows'),picker=window.P79SmartCoverPicker;
 if(!root)return;
 const daily=$id('adminCreateLeaveDaily').checked,plain=$id('adminCreateLeaveNoCover').checked;
 root.hidden=!daily||plain;
 $id('adminCreateLeaveWorkers').hidden=daily||plain;
 $id('adminCreateLeaveRecommendation').hidden=daily&&!plain;
 const applicant=$id('adminCreateLeaveApplicantWrap');if(applicant)applicant.hidden=false;
 if(root.hidden)return;
 const people=leaveCreatePeople(),list=days();
 if(!list.length){root.innerHTML='<p>請選擇有效請假日期，最多62天。</p>';return;}
 if(!list.includes(smartDay))smartDay=list[0];
 list.forEach(date=>{if(!rows.has(date))rows.set(date,{id:crypto.randomUUID(),applicant:'',applicantOverride:false,first:'',second:'',secondVisible:false,applicantJob:'',firstJob:'',secondJob:'',firstOvertimeType:'',secondOvertimeType:''});});
 refreshSmartRosters();
 const row=rows.get(smartDay),effectiveId=row.applicantOverride?row.applicant:String($id('adminCreateLeaveEmployee')?.value||'');
 const target=people.find(p=>String(p.empId)===String(effectiveId));
 const options=picker.candidates(smartOptions(smartDay,row,target,people));
 if(!options.some(x=>x.id===row.first&&!x.disabled)){row.first='';row.firstOvertimeType='';}
 if(!options.some(x=>x.id===row.second&&!x.disabled)||row.second===row.first){row.second='';row.secondOvertimeType='';}
 if(!row.secondVisible){row.second='';row.secondOvertimeType='';}
 const daysHtml=list.length===1?'':'<div class="p79-smart-cover-days" role="group" aria-label="選擇每日代班">'+list.map(date=>{
  const r=rows.get(date);
  return '<button type="button" data-new-day="'+safe(date)+'" aria-pressed="'+(date===smartDay)+'">'+safe(date.slice(5))+'｜'+(r.first&&(!r.secondVisible||r.second)?'已選':'待選')+'</button>';
 }).join('')+'</div>';
 const basePerson=people.find(p=>String(p.empId)===String($id('adminCreateLeaveEmployee')?.value||''));
 const applicantMeta=target?'｜職稱：'+safe(picker.personJob(target)):'';
 const override=(list.length===1&&!row.applicantOverride?'':'<div class="p79-smart-cover-applicant"><strong>請假人員：'+safe(target?.name||'請先選擇請假人員')+'</strong><small>'+applicantMeta+'</small>'+
  '<button type="button" data-applicant-toggle="'+safe(smartDay)+'">'+(row.applicantOverride?'↩ 使用上方請假人員':'本日不同請假人員')+'</button></div>')+
  (row.applicantOverride?'<div class="p79-smart-cover-override"><label>本日請假人員</label><select data-smart-applicant="'+safe(smartDay)+'"><option value="">請選擇本日請假人員</option>'+
   people.map(p=>'<option value="'+safe(p.empId)+'"'+(row.applicant===String(p.empId)?' selected':'')+'>'+safe(p.name||p.empId)+'｜'+safe(leavePersonJob(p))+'</option>').join('')+'</select></div>':'');
 const personOvertime=(key,id)=>id?'<div class="p79-smart-cover-overtime"><strong>'+safe(people.find(p=>String(p.empId)===String(id))?.name||id)+'｜加班類型（申報前待核對）</strong>'+
   overtimeTypeField(smartDay,row,key)+'</div>':'';
 const overtimeOptions=personOvertime('first',row.first)+personOvertime('second',row.second);
 root.innerHTML=daysHtml+'<div class="p79-smart-cover-day">'+override+
  picker.render(smartOptions(smartDay,row,target,people))+
  (smartLoadStatus&&/未完成|無法|失敗|尚未/.test(smartLoadStatus)?
   '<p class="p79-smart-cover-hint">'+safe(smartLoadStatus)+'</p>':'')+
  (overtimeOptions?'<details class="p79-smart-cover-advanced-overtime"><summary>加班類型選項（選填）</summary>'+
   overtimeOptions+'</details>':'')+'</div>';
 root.querySelectorAll('[data-new-day]').forEach(el=>el.onclick=()=>{smartDay=el.dataset.newDay;redraw();});
 root.querySelectorAll('[data-applicant-toggle]').forEach(el=>el.onclick=()=>{
  row.applicantOverride=!row.applicantOverride;
  row.applicant=row.applicantOverride?String(basePerson?.empId||''):'';
  row.first='';row.second='';row.manual=false;row.firstOvertimeType='';row.secondOvertimeType='';
  redraw();
 });
 root.querySelectorAll('[data-smart-applicant]').forEach(el=>el.onchange=()=>{
  row.applicant=el.value;row.first='';row.second='';row.manual=false;row.firstOvertimeType='';row.secondOvertimeType='';redraw();
 });
 root.querySelectorAll('select[data-field]').forEach(el=>el.onchange=()=>{row[el.dataset.field]=el.value;});
 picker.bind(root,action=>{
  const entry=rows.get(action.date),date=action.date;
  if(!entry)return;
  if(action.kind==='advanced'){entry.advancedOpen=action.value===true;return;}
  if(action.kind==='filter-job'){
   entry.filterJob=action.value;entry.filterName='';
   redraw();return;
  }
  if(action.kind==='filter-name'){
   entry.filterName=action.value;
   redraw();return;
  }
  entry.manual=true;
  if(action.kind==='mode'){
   entry.secondVisible=action.value==='two';
   if(!entry.secondVisible){entry.second='';entry.secondOvertimeType='';}
  }else if(action.kind==='slot-job'){
   if(![0,1].includes(action.slot)||action.slot===1&&!entry.secondVisible)return;
   const newJob=String(action.value||''),priorId=action.slot===0?entry.first:entry.second;
   const options=picker.candidates(smartOptions(date,entry,target,people));
   const previous=options.find(x=>x.id===priorId);
   entry.slotJobs=Array.isArray(entry.slotJobs)?[...entry.slotJobs]:[];
   entry.slotJobs[action.slot]=newJob;
   if(previous&&newJob&&picker.personJob(previous.person)!==newJob){
    if(action.slot===0){entry.first='';entry.second='';entry.firstOvertimeType='';entry.secondOvertimeType='';}
    else{entry.second='';entry.secondOvertimeType='';}
   }
  }else if(action.kind==='slot'){
   if(![0,1].includes(action.slot)||action.slot===1&&!entry.secondVisible)return;
   const id=String(action.id||''),available=picker.candidates(smartOptions(date,entry,target,people));
   if(id&&!available.some(x=>x.id===id&&!x.disabled)){
    $id('adminCreateLeaveMessage').textContent='此人員已有請假、代班或班別衝突，請重新選擇。';redraw();return;
   }
   if(action.slot===1&&!entry.first){
    $id('adminCreateLeaveMessage').textContent='請先選擇第一位代班人員。';redraw();return;
   }
   if(id&&id===(action.slot===0?entry.second:entry.first)){
    $id('adminCreateLeaveMessage').textContent='兩位代班人員不能是同一人。';redraw();return;
   }
   if(action.slot===0){
    entry.first=id;
    if(!entry.first){entry.first=entry.second||'';entry.second='';}
   }else entry.second=id;
   entry.firstOvertimeType='';entry.secondOvertimeType='';
  }else if(action.kind==='recommend'){
   const p=people.find(x=>String(x.empId)===String(entry.applicantOverride?entry.applicant:$id('adminCreateLeaveEmployee')?.value||''));
   const ids=picker.recommend(smartOptions(date,entry,p,people),entry.secondVisible?'two':'one');
   if(!ids.length){$id('adminCreateLeaveMessage').textContent='當日沒有已核對的排休候選人，請人工選擇。';return;}
   entry.first=ids[0]||'';entry.second=ids[1]||'';
   entry.slotJobs=[]; // Auto-picked workers may use different job titles.
   entry.firstOvertimeType='';entry.secondOvertimeType='';
  }else if(action.kind==='pick'){
   const available=picker.candidates(smartOptions(date,entry,target,people));
   if(!available.some(x=>x.id===action.id&&!x.disabled))return;
   entry.slotJobs=[]; // Advanced list may have mixed job titles.
   if(!action.checked){
    if(entry.first===action.id){entry.first=entry.second||'';entry.second='';}
    else if(entry.second===action.id)entry.second='';
   }else if(entry.first===action.id||entry.second===action.id)return;
   else if(!entry.first)entry.first=action.id;
   else if(entry.secondVisible&&!entry.second)entry.second=action.id;
   else{$id('adminCreateLeaveMessage').textContent='已達本日人數上限，請先取消其他人員。';return;}
   entry.firstOvertimeType='';entry.secondOvertimeType='';
  }
  $id('adminCreateLeaveMessage').textContent='';
  redraw();
 });
}

window.p79RenderDailyCreateCover=redraw;
document.addEventListener('change',event=>{if(event.target?.id==='adminCreateLeaveNoCover')redraw();});
window.openAdminCreateLeave=async function(...args){
 rows.clear();smartDay='';smartMonthKey='';smartRosters=null;smartLeaves=[];smartCovers=[];smartLoadStatus='';++smartSerial;
 await originalOpen(...args);
 if(!$id('adminCreateLeaveDialog').open)return;
 $id('adminCreateLeaveDaily').checked=true;
 redraw();
};
// Consecutive days for one applicant are ONE leave record. Each day's cover
// stays separate inside dailyAssignments. Different applicants form distinct runs.
async function saveDaily(){
 if(adminCreateLeaveBusy)return;
 if(!adminSession||leaveAccess!=='manage'){alert('沒有新增請假管理權限');return;}
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
   if(window.P79SmartCoverPicker&&ids.length!==(row.secondVisible?2:1))throw Error(date+' 請按代班模式完整勾選人員');
   if(window.P79SmartCoverPicker){
    const opts=window.P79SmartCoverPicker.candidates(smartOptions(date,row,employee,people));
    if(ids.some(id=>!opts.some(x=>x.id===id&&!x.disabled)))throw Error(date+' 已核准請假或重複代班人員不得儲存');
   }
   if(!String(employee.dept||'').trim())throw Error(date+' 請假人員未設定部門');
   for(const id of ids){
    const worker=people.find(p=>String(p.empId)===String(id));
    if(!worker||String(worker.empId)===String(employee.empId)||String(worker.dept||'').trim()!==String(employee.dept||'').trim())
     throw Error(date+' 代班人員必須是同部門在職的其他人員');
   }
   plans.push({date,id:row.id,employee,ids,mode:ids.length===2?'two':'one',
    overtimeTypeByWorker:{[String(row.first)]:row.firstOvertimeType||'',...(row.second?{[String(row.second)]:row.secondOvertimeType||''}:{})}});
  }
 }catch(e){notice.textContent=e.message;return;}
 // Create one approved leave per uninterrupted run of dates for the same employee.
 // A deliberately changed applicant starts a separate application.
 const groups=[];
 for(const p of plans){
  const last=groups[groups.length-1];
  const contiguous=last&&Date.parse(p.date+'T00:00:00Z')-Date.parse(last.endDate+'T00:00:00Z')===86400000;
  if(last&&contiguous&&String(last.employee.empId)===String(p.employee.empId)){
   last.endDate=p.date;last.days++;last.plans.push(p);
  }else groups.push({id:p.id,employee:p.employee,startDate:p.date,endDate:p.date,days:1,plans:[p]});
 }
 for(const group of groups)group.dailyAssignments=group.plans.map(p=>({date:p.date,mode:p.mode,workerIds:p.ids}));
 const button=$id('adminCreateLeaveSave'),done=[],entries=[];
 adminCreateLeaveBusy=true;button.disabled=true;button.textContent='請假及代班儲存中…';
 try{
  const fresh=await p79ReadCurrentLeaveCoverState();
  if(!fresh?.ok||!Array.isArray(fresh.leaveRecords)||!Array.isArray(fresh.leaveCoverAssignments))
   throw Error(fresh?.error||'無法核對雲端資料');
  for(const group of groups){
   const employee=group.employee,span=group.startDate===group.endDate?group.startDate:group.startDate+' ～ '+group.endDate;
   notice.textContent='正在儲存 '+span+'｜'+employee.name+'（'+group.days+' 天合併一筆）';
   // Never create an overlapping multi-day request over older one-day records.
   // Those require a deliberate migration including their cover/overtime links.
   const overlapping=fresh.leaveRecords.filter(l=>
    String(l.empId)===String(employee.empId)&&String(l.leaveType)===String(type)&&
    String(l.status)==='已核准'&&
    normalizeLeaveFilterDate(l.startTime||l.startDate)<=group.endDate&&
    normalizeLeaveFilterDate(l.endTime||l.endDate||l.startTime||l.startDate)>=group.startDate);
   if(overlapping.some(l=>normalizeLeaveFilterDate(l.startTime||l.startDate)!==group.startDate||
    normalizeLeaveFilterDate(l.endTime||l.endDate||l.startTime||l.startDate)!==group.endDate))
    throw Error(span+' 已有部分重疊的請假紀錄（可能是舊版逐日單），為避免重複扣假與代班，請先整併既有資料');
   const assignment=group.dailyAssignments[0];
   const plan=p79PlanLeaveCoverRequest(fresh.leaveRecords,fresh.leaveCoverAssignments,{
    id:group.id,empId:employee.empId,leaveType:type,startDate:group.startDate,endDate:group.endDate,
    mode:assignment.mode,workerIds:assignment.workerIds,dailyAssignments:group.dailyAssignments
   });
   group.id=plan.leaveId;
   // Retain the same application ID across all dates on retry.
   group.plans.forEach(p=>{const row=rows.get(p.date);if(row)row.id=plan.leaveId;});
   if(!plan.existing){
    await postCloud({action:'addLeaveRecord',leave:{
     id:plan.leaveId,empId:employee.empId,attNo:employee.attNo||'',name:employee.name||'',dept:employee.dept||'',
     leaveType:type,startDate:group.startDate,endDate:group.endDate,days:group.days,
     reason:$id('adminCreateLeaveReason').value.trim(),status:'已核准',source:'manual-admin'
    }});
    fresh.leaveRecords.push({id:plan.leaveId,empId:employee.empId,leaveType:type,startDate:group.startDate,endDate:group.endDate,status:'已核准'});
   }
   if(!plan.covered){
    notice.textContent='請假已儲存，正在同步 '+span+' 的 '+group.days+' 天代班明細…';
    const result=await postCloud({action:'saveLeaveCoverAssignment',leaveId:plan.leaveId,
     mode:assignment.mode,workerIds:assignment.workerIds,dailyAssignments:group.dailyAssignments});
    if(!result?.ok||result.dailyAssignmentsSaved!==true)
     throw Error(span+' 每日代班未獲雲端完整確認；請核對後再試，不會重複新增請假');
    for(const daily of group.dailyAssignments)
     fresh.leaveCoverAssignments.push({leaveEmpId:employee.empId,leaveId:plan.leaveId,
      startDate:daily.date,endDate:daily.date,mode:daily.mode,workerIds:daily.workerIds});
    const confirmedEntries=[];
    for(const p of group.plans)for(const id of p.ids){
     const worker=people.find(e=>String(e.empId)===String(id));
     confirmedEntries.push({leaveId:plan.leaveId,empId:String(id),name:worker?.name||'',
      date:p.date,forEmpId:String(employee.empId),preferredType:p.overtimeTypeByWorker[String(id)]||''});
    }
    // Save pending overtime handoffs even when a later group cannot be confirmed.
    p79AppendLeaveHandoffEntries(confirmedEntries);entries.push(...confirmedEntries);
   }
   done.push(span+' '+employee.name);
  }
  // Close immediately when ALL leave and cover saves are confirmed.
  $id('adminCreateLeaveDialog').close();
  setStatus('✅ 已儲存 '+groups.length+' 筆請假（共 '+plans.length+' 天），每日代班已同步','success');
  if(entries.length){
   try{
    p79ActivateLeaveHandoff();p79UpdateLeaveHandoffBanner();
    if(typeof window.p79LaunchLeaveOvertimeAfterSave==='function')window.p79LaunchLeaveOvertimeAfterSave();
   }catch(error){setStatus('✅ 請假與代班已儲存，但加班申報視窗未成功開啟：'+String(error?.message||error),'warn');}
  }
  void loadCloud(false,true);
 }catch(error){
  notice.textContent='已確認 '+done.length+' 筆連續假期：'+done.join('、')+'。未完成：'+String(error?.message||error)+'。視窗與資料已保留，請先核對雲端避免重複新增。';
  void loadCloud(false,true);
 }finally{
  adminCreateLeaveBusy=false;button.disabled=false;button.textContent='儲存請假並安排代班';
 }
}
window.saveAdminCreateLeave=function(){
 if($id('adminCreateLeaveDaily')?.checked&&!$id('adminCreateLeaveNoCover')?.checked)return saveDaily();
 return originalSave();
};
})();