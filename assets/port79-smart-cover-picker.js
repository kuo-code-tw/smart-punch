/* Shared, read-only smart cover selector for both leave entry points.
   No record is written until each host workflow performs its existing cloud preflight. */
(function(root){
 'use strict';
 const norm=v=>String(v??'').trim().toUpperCase();
 const str=v=>String(v??'').trim();
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const day=v=>str(v).slice(0,10).replaceAll('/','-');
 const active=p=>!/^(resigned|terminated|inactive|leave|loa|離職|留停)$/.test(str(p?.employmentStatus||'active').toLowerCase());
 const kind=v=>str(v).replace(/\s+/g,'');
 const personUnit=p=>str(p?.unit||p?.unitName)||'未設定單位';
 const personJob=p=>str(p?.jobTitle||p?.deptDetail||p?.role)||'未設定職稱';
 const stroke=new Intl.Collator('zh-TW-u-co-stroke',{numeric:true});
 const orderedOptions=list=>[...new Set(list)].sort(stroke.compare);
 const byNameStroke=(a,b)=>stroke.compare(str(a.person?.name||a.id),str(b.person?.name||b.id))||str(a.id).localeCompare(str(b.id));
 // Filters only change list visibility, never eligibility or saved worker ids.
 function visible(options,{jobFilter='',nameFilter=''}={}){
  // Filters restrict the visible list, not who can legally be assigned.
  // Filtering by employee ID avoids ambiguous duplicate Chinese names.
  return options.filter(x=>(!jobFilter||personJob(x.person)===jobFilter)&&
    (!nameFilter||norm(x.id)===norm(nameFilter)));
 }
 const isRest=v=>/^(休|例|例休|排休|休假日|休息日|例假|國|國定|國定假日)$/.test(kind(v));
 function inRange(date,start,end){
  const s=day(start),e=day(end||start);
  return !!date&&!!s&&s<=date&&date<=(e||s);
 }
 function isLeave(person,date,leaves){
  return (leaves||[]).some(l=>norm(l.empId)===norm(person.empId)&&
    !/駁回|取消|撤銷|作廢/.test(str(l.status))&&
    inRange(date,l.startDate||l.startTime,l.endDate||l.endTime||l.startDate||l.startTime));
 }
 function hasCover(person,date,covers,excludeLeaveId){
  return (covers||[]).some(c=>str(c.leaveId)!==str(excludeLeaveId)&&
    (Array.isArray(c.workerIds)?c.workerIds:[]).some(id=>norm(id)===norm(person.empId))&&
    inRange(date,c.startDate,c.endDate));
 }
 function rosterLabel(rosters,id,date){
  const r=rosters instanceof Map?rosters.get(norm(id)):null;
  if(!r)return '';
  return str(r[date]||r[date.slice(-2)]||r[String(Number(date.slice(-2)))]);
 }
 function candidates({people=[],target=null,date='',rosters=null,leaves=[],covers=[],excludeLeaveId=''}={}){
  if(!target||!str(target.dept))return [];
  const sameDept=people.filter(p=>norm(p.empId)&&norm(p.empId)!==norm(target.empId)&&
    str(p.dept)===str(target.dept)&&active(p));
  const title=p=>str(p.jobTitle||p.deptDetail||p.role);
  const rotation=Number.isFinite(Date.parse(date+'T12:00:00Z'))?
    Math.floor(Date.parse(date+'T12:00:00Z')/86400000):0;
  return sameDept.map((person,index)=>{
    const shift=rosterLabel(rosters,person.empId,date);
    const rest=isRest(shift);
    const leave=isLeave(person,date,leaves),occupied=hasCover(person,date,covers,excludeLeaveId);
    const targetShift=rosterLabel(rosters,target.empId,date);
    const sameScheduledShift=!!shift&&!!targetShift&&!rest&&kind(shift)===kind(targetShift);
    const disabled=leave||occupied||sameScheduledShift;
    const sameJob=!!title(target)&&title(target)===title(person);
    const verified=!!shift;
    const priority=!disabled&&rest&&sameJob;
    const note=leave?'已有請假，無法指派':occupied?'已有其他代班，無法指派':sameScheduledShift?'與請假者同班次，禁止重疊指派':
      rest?'當日排休・加班類型待核對':
      shift?'當日班別：'+shift+'・需核對時間衝突':'班表待確認・僅供人工選擇';
    const score=disabled?100:rest?(sameJob?0:1):(sameJob?2:3);
    return {person,id:str(person.empId),shift,rest,verified,sameJob,disabled,priority,note,score,index};
  }).sort((a,b)=>a.score-b.score||((a.index+rotation)%Math.max(1,sameDept.length))-((b.index+rotation)%Math.max(1,sameDept.length)));
 }
 function recommend(params,mode){
  const options=visible(candidates(params),params),take=mode==='two'?2:1;
  // Auto-pick only when the official roster actually contains a rest entry.
  return options.filter(p=>p.rest&&!p.disabled&&p.verified).slice(0,take).map(p=>p.id);
 }
 function period(target,date,rosters,mode,index){
  const shift=rosterLabel(rosters,target?.empId,date);
  // Two distinct four-hour replacements must follow the actual verified
  // shift, never hard-code the middle shift for an early or overnight worker.
  if(mode==='two'){
   if(/^(早|早班)$/.test(shift))return index===0?'08:00–12:00':'12:00–16:00';
   if(/^(中|中班)$/.test(shift))return index===0?'16:00–20:00':'20:00–24:00';
   // Verified same-day two-person late-shift cover is credited 16–20 / 20–24;
   // historical next-morning overtime is accounted separately by the formal backend.
   if(/^(晚|晚班)$/.test(shift))return index===0?'16:00–20:00':'20:00–24:00';
   return (index===0?'前段':'後段')+' 4H（正式班別待核對）';
  }
  const base=/^(早|早班)$/.test(shift)?'08:00–16:00':
    /^(中|中班)$/.test(shift)?'16:00–24:00':
    /^(晚|晚班)$/.test(shift)?'次日 00:00–08:00':'';
  if(mode==='one')return base||'整段 8H（時間待核對）';
  if(!base)return (index===0?'前段':'後段')+' 4H（時間待核對）';
  if(shift.startsWith('早'))return index===0?'08:00–12:00':'12:00–16:00';
  if(shift.startsWith('中'))return index===0?'16:00–20:00':'20:00–24:00';
  return index===0?'次日 00:00–04:00':'次日 04:00–08:00';
 }
 function render({people=[],target=null,date='',selected=[],mode='one',rosters=null,leaves=[],covers=[],excludeLeaveId='',scope='',jobFilter='',nameFilter='',advancedOpen=false,slotJobs=[]}={}){
  const options=candidates({people,target,date,rosters,leaves,covers,excludeLeaveId});
  const wanted=mode==='two'?2:1;
  const valid=selected.filter(id=>options.some(x=>x.id===str(id)&&!x.disabled)).slice(0,wanted);
  const official=rosters instanceof Map&&rosters.size>0;
  const qualified=options.filter(x=>!x.disabled).length;
  const jobs=orderedOptions(options.map(x=>personJob(x.person)));
  const byJob=jobFilter?options.filter(x=>personJob(x.person)===jobFilter):options;
  const names=[...byJob].sort(byNameStroke);
  const matched=visible(options,{jobFilter,nameFilter}).sort(byNameStroke);
  const jobChoices=jobs.map(value=>'<option value="'+esc(value)+'"'+(jobFilter===value?' selected':'')+'>'+esc(value)+'</option>').join('');
  const nameChoices=names.map(x=>'<option value="'+esc(x.id)+'"'+(norm(nameFilter)===norm(x.id)?' selected':'')+'>'+
   esc(str(x.person.name||x.id)+'（'+x.id+'）')+'</option>').join('');
  const filterHtml='<div class="p79-smart-cover-filters">'+
   '<label class="p79-smart-cover-filter-label">職稱<select data-smart-action="filter-job" aria-label="依職稱篩選代班人員">'+
   '<option value="">全部職稱</option>'+jobChoices+'</select></label>'+
   '<label class="p79-smart-cover-filter-label">姓名<select data-smart-action="filter-name" aria-label="依姓名篩選代班人員">'+
   '<option value="">全部姓名</option>'+nameChoices+'</select></label></div>';
  // In two-person mode the two physical assignments are independent. The
  // optional job/name filters narrow the checkbox list only; they must never
  // hide the second person's choices or force a second slot to one candidate.
  // In each 4-hour position choose the job title BEFORE the worker's name.
  // Default to the leave applicant's role for quick selection, yet permit
  // different positions to use different roles and an explicit "all" choice.
  // Advanced checkbox filters remain completely independent.
  const slotHtml='<div class="p79-smart-cover-slots" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin:4px 0">'+
   (mode==='two'?[0,1]:[0]).map(slot=>{
    const id=valid[slot]||'',other=valid[1-slot]||'',firstRequired=slot===1&&!valid[0];
    const person=options.find(x=>x.id===id);
    const applicantJob=personJob(target);
    const defaultJob=person?personJob(person.person):(jobs.includes(applicantJob)?applicantJob:'');
    const chosenJob=Array.isArray(slotJobs)&&typeof slotJobs[slot]==='string'?slotJobs[slot]:defaultJob;
    const slotOptions=options.filter(x=>!chosenJob||personJob(x.person)===chosenJob).sort(byNameStroke);
    const eligibleCount=slotOptions.filter(x=>!x.disabled&&x.id!==other).length;
    const slotLabel=mode==='one'?'代班人員（8 小時）':slot===0?'第一位代班（早班加班 4 小時）':'第二位代班（晚班加班 4 小時）';
    const jobOptions='<option value=""'+(chosenJob===''?' selected':'')+'>全部職稱</option>'+
     jobs.map(job=>'<option value="'+esc(job)+'"'+(chosenJob===job?' selected':'')+'>'+
      esc(job)+'</option>').join('');
    const optionsHtml=slotOptions.map(x=>{
     const unavailable=x.disabled||x.id===other;
     return '<option value="'+esc(x.id)+'"'+(x.id===id?' selected':'')+
      (unavailable?' disabled':'')+'>'+esc(str(x.person.name||x.id)+'（'+x.id+'）'+
      (chosenJob?'':'｜'+personJob(x.person))+
      '｜'+(x.shift||'班表待核')+(x.id===other?'｜已選為另一位':x.disabled?'｜'+x.note:''))+'</option>';
    }).join('');
    return '<div class="p79-smart-cover-slot">'+
     '<strong>'+slotLabel+'</strong>'+
     '<span class="p79-smart-cover-slot-period">'+esc(period(target,date,rosters,mode,slot))+'</span>'+
     '<div class="p79-smart-cover-slot-fields">'+
     '<label class="p79-smart-cover-filter-label">職稱'+
     '<select data-smart-action="slot-job" data-smart-slot="'+slot+'" aria-label="'+slotLabel+'職稱">'+jobOptions+'</select></label>'+
     '<label class="p79-smart-cover-filter-label">姓名'+
     '<select data-smart-action="slot" data-smart-slot="'+slot+'" aria-label="'+slotLabel+'姓名"'+
     (firstRequired?' disabled':'')+'>'+
     '<option value="">'+(firstRequired?'請先選第一位':'請選擇人員')+'</option>'+
     optionsHtml+'</select></label></div>'+
     '<small class="p79-smart-cover-slot-count">'+(eligibleCount?'本職稱可選 '+eligibleCount+' 位':'本職稱沒有可選人員，請更換職稱')+'</small>'+
     '</div>';
   }).join('')+'</div>';
  const rows=matched.map(x=>'<label class="p79-smart-cover-person'+(valid.includes(x.id)?' selected':'')+(x.disabled?' excluded':'')+'">'+
   '<input type="checkbox" data-smart-action="pick" data-smart-id="'+esc(x.id)+'"'+(valid.includes(x.id)?' checked':'')+(x.disabled?' disabled':'')+'>'+
   '<span class="p79-smart-cover-person-content"><strong>'+esc(x.person.name||x.id)+'</strong><small>'+esc(personJob(x.person))+'｜'+esc(x.shift||'班表待核')+'</small><small>'+esc(x.note)+'</small></span>'+
   (x.priority?'<span class="p79-smart-cover-priority">優先推薦</span>':'')+'</label>').join('');
  const preview=valid.map((id,i)=>{
    const p=options.find(x=>x.id===id);
    return '<div class="p79-smart-cover-preview-row"><span>'+esc(p.person.name||id)+'</span><strong>'+esc(period(target,date,rosters,mode,i))+'</strong><small>加班待核對</small></div>';
  }).join('');
  const alert=!official?'尚未讀到完整正式班表，請人工核對；不會盲目自動勾選。':
    mode==='two'&&qualified<2?'目前同部門僅有 '+qualified+' 位初步可選人員，尚無法完成兩人代班；請核對排班、請假與候選人。':
    qualified===0?'當日沒有通過初步條件的代班人員；請核對班表與請假。':
    '優先推薦依排休與同職稱排序；儲存前仍核對請假、代班衝突與休息條件。';
  const countText='已勾選 '+valid.length+' / '+wanted+' 位｜顯示 '+matched.length+' 位候選人'+
   ((jobFilter||nameFilter)?'（篩選不影響已勾選人員）':'');
  const totalText='合計 '+(valid.length*(mode==='two'?4:8))+' / 8 小時';
  const quickStatus=valid.length===wanted?
   '✓ 已選好 '+wanted+' 位，預排'+(mode==='two'?'每人 4':' 8')+' 小時（加班另核對）':
   '請選擇 '+wanted+' 位代班人員（已選 '+valid.length+' 位）';
  return '<div class="p79-smart-cover-picker" data-smart-date="'+esc(date)+'" data-smart-scope="'+esc(scope)+'">'+
   '<div class="p79-smart-cover-toolbar"><span class="p79-smart-cover-caption">代班方式</span>'+
   '<div class="p79-smart-cover-modes"><button type="button" data-smart-action="mode" data-smart-value="one" aria-pressed="'+(mode==='one')+'">1 人 8H</button>'+
   '<button type="button" data-smart-action="mode" data-smart-value="two" aria-pressed="'+(mode==='two')+'">2 人各 4H</button></div>'+
   '<button type="button" class="p79-smart-cover-recommend" data-smart-action="recommend"'+(!official?' disabled':'')+'>✦ 自動推薦</button></div>'+
   slotHtml+
   '<div class="p79-smart-cover-quick-status" aria-live="polite">'+esc(quickStatus)+'</div>'+
   ((qualified<wanted)?'<p class="p79-smart-cover-hint">'+esc(alert)+'</p>':'')+
   '<details class="p79-smart-cover-advanced" data-smart-action="advanced"'+(advancedOpen?' open':'')+'>'+
   '<summary>進階篩選／查看全部候選人（選填）</summary>'+
   '<div class="p79-smart-cover-advanced-body">'+filterHtml+
   '<div class="p79-smart-cover-summary">'+countText+'</div>'+
   '<div class="p79-smart-cover-list">'+(rows||'<p class="p79-smart-cover-hint">目前篩選沒有符合的候選人，請調整職稱或姓名</p>')+'</div>'+
   '<div class="p79-smart-cover-preview"><strong>指派預覽</strong>'+(preview||'<p class="p79-smart-cover-hint">請勾選人員</p>')+
   '<div class="p79-smart-cover-total">'+totalText+'</div></div>'+
   '<p class="p79-smart-cover-hint">'+esc(alert)+'</p></div></details></div>';
 }
 function bind(root,onAction){
  if(!root||typeof root.querySelectorAll!=='function')return;
  root.querySelectorAll('[data-smart-action]').forEach(node=>{
   const act=node.dataset.smartAction;
   if(act==='pick')node.onchange=()=>onAction({kind:'pick',date:node.closest('.p79-smart-cover-picker')?.dataset.smartDate||'',id:node.dataset.smartId,checked:!!node.checked});
   else if(act==='slot')node.onchange=()=>onAction({kind:'slot',date:node.closest('.p79-smart-cover-picker')?.dataset.smartDate||'',slot:Number(node.dataset.smartSlot),id:node.value});
   else if(act==='slot-job')node.onchange=()=>onAction({kind:'slot-job',date:node.closest('.p79-smart-cover-picker')?.dataset.smartDate||'',slot:Number(node.dataset.smartSlot),value:node.value});
   else if(act==='advanced')node.ontoggle=()=>onAction({kind:'advanced',date:node.closest('.p79-smart-cover-picker')?.dataset.smartDate||'',value:!!node.open});
   else if(act==='filter-job'||act==='filter-name')node.onchange=()=>onAction({kind:act,date:node.closest('.p79-smart-cover-picker')?.dataset.smartDate||'',value:node.value});
   else node.onclick=()=>onAction({kind:act,date:node.closest('.p79-smart-cover-picker')?.dataset.smartDate||'',value:node.dataset.smartValue||''});
  });
 }
 root.P79SmartCoverPicker={candidates,recommend,render,bind,isRest,period,personUnit,personJob,visible};
})(typeof window!=='undefined'?window:globalThis);
