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
    const disabled=leave||occupied;
    const sameJob=!!title(target)&&title(target)===title(person);
    const verified=!!shift;
    const priority=!disabled&&rest&&sameJob;
    const note=leave?'已有請假，無法指派':occupied?'已有其他代班，無法指派':
      rest?'當日排休・加班類型待核對':
      shift?'當日班別：'+shift+'・需核對時間衝突':'班表待確認・僅供人工選擇';
    const score=disabled?100:rest?(sameJob?0:1):(sameJob?2:3);
    return {person,id:str(person.empId),shift,rest,verified,sameJob,disabled,priority,note,score,index};
  }).sort((a,b)=>a.score-b.score||((a.index+rotation)%Math.max(1,sameDept.length))-((b.index+rotation)%Math.max(1,sameDept.length)));
 }
 function recommend(params,mode){
  const options=candidates(params),take=mode==='two'?2:1;
  // Auto-pick only when the official roster actually contains a rest entry.
  return options.filter(p=>p.rest&&!p.disabled&&p.verified).slice(0,take).map(p=>p.id);
 }
 function period(target,date,rosters,mode,index){
  const shift=rosterLabel(rosters,target?.empId,date);
  const base=/^(早|早班)$/.test(shift)?'08:00–16:00':
    /^(中|中班)$/.test(shift)?'16:00–24:00':
    /^(晚|晚班)$/.test(shift)?'次日 00:00–08:00':'';
  if(mode==='one')return base||'整段 8H（時間待核對）';
  if(!base)return (index===0?'前段':'後段')+' 4H（時間待核對）';
  if(shift.startsWith('早'))return index===0?'08:00–12:00':'12:00–16:00';
  if(shift.startsWith('中'))return index===0?'16:00–20:00':'20:00–24:00';
  return index===0?'次日 00:00–04:00':'次日 04:00–08:00';
 }
 function render({people=[],target=null,date='',selected=[],mode='one',rosters=null,leaves=[],covers=[],excludeLeaveId='',scope=''}={}){
  const options=candidates({people,target,date,rosters,leaves,covers,excludeLeaveId});
  const wanted=mode==='two'?2:1;
  const valid=selected.filter(id=>options.some(x=>x.id===str(id)&&!x.disabled)).slice(0,wanted);
  const official=rosters instanceof Map&&rosters.size>0;
  const qualified=options.filter(x=>!x.disabled).length;
  const rows=options.map(x=>'<label class="p79-smart-cover-person'+(valid.includes(x.id)?' selected':'')+(x.disabled?' excluded':'')+'">'+
   '<input type="checkbox" data-smart-action="pick" data-smart-id="'+esc(x.id)+'"'+(valid.includes(x.id)?' checked':'')+(x.disabled?' disabled':'')+'>'+
   '<span class="p79-smart-cover-person-content"><strong>'+esc(x.person.name||x.id)+'</strong><small>'+esc(str(x.person.jobTitle||x.person.deptDetail||x.person.role)||'未設定職稱')+'｜'+esc(x.shift||'班表待核')+'</small><small>'+esc(x.note)+'</small></span>'+
   (x.priority?'<span class="p79-smart-cover-priority">優先推薦</span>':'')+'</label>').join('');
  const preview=valid.map((id,i)=>{
    const p=options.find(x=>x.id===id);
    return '<div class="p79-smart-cover-preview-row"><span>'+esc(p.person.name||id)+'</span><strong>'+esc(period(target,date,rosters,mode,i))+'</strong><small>加班待核對</small></div>';
  }).join('');
  const alert=!official?'尚未讀到完整正式班表，請人工核對；不會盲目自動勾選。':
    qualified===0?'當日沒有通過初步條件的代班人員；請核對班表與請假。':
    '優先推薦依排休與同職稱排序；儲存前仍核對請假、代班衝突與休息條件。';
  return '<div class="p79-smart-cover-picker" data-smart-date="'+esc(date)+'" data-smart-scope="'+esc(scope)+'">'+
    '<div class="p79-smart-cover-toolbar"><span class="p79-smart-cover-caption">代班方式</span>'+
    '<div class="p79-smart-cover-modes"><button type="button" data-smart-action="mode" data-smart-value="one" aria-pressed="'+(mode==='one')+'">1 人 8H</button>'+
    '<button type="button" data-smart-action="mode" data-smart-value="two" aria-pressed="'+(mode==='two')+'">2 人各 4H</button></div>'+
    '<button type="button" class="p79-smart-cover-recommend" data-smart-action="recommend"'+(!official?' disabled':'')+'>✦ 排休優先推薦</button></div>'+
    '<div class="p79-smart-cover-summary">已勾選 '+valid.length+' / '+wanted+' 位｜可手動改選</div>'+
    '<div class="p79-smart-cover-list">'+(rows||'<p class="p79-smart-cover-hint">此部門暫無可選的在職代班人員</p>')+'</div>'+
    '<div class="p79-smart-cover-preview"><strong>指派預覽</strong>'+(preview||'<p class="p79-smart-cover-hint">請勾選人員</p>')+
    '<div class="p79-smart-cover-total">合計 '+(valid.length*(mode==='two'?4:8))+' / 8 小時</div></div>'+
    '<p class="p79-smart-cover-hint">'+esc(alert)+'</p></div>';
 }
 function bind(root,onAction){
  if(!root||typeof root.querySelectorAll!=='function')return;
  root.querySelectorAll('[data-smart-action]').forEach(node=>{
   const act=node.dataset.smartAction;
   if(act==='pick')node.onchange=()=>onAction({kind:'pick',date:node.closest('.p79-smart-cover-picker')?.dataset.smartDate||'',id:node.dataset.smartId,checked:!!node.checked});
   else node.onclick=()=>onAction({kind:act,date:node.closest('.p79-smart-cover-picker')?.dataset.smartDate||'',value:node.dataset.smartValue||''});
  });
 }
 root.P79SmartCoverPicker={candidates,recommend,render,bind,isRest,period};
})(typeof window!=='undefined'?window:globalThis);
