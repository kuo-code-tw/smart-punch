(function(g){
'use strict';
const KEY='port79_monthly_rest_overtime_v1',cats=['國','休','例'],esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// balance() receives the official cloud roster; idless annotations are not saved declarations.
const storedReport=r=>!!String(r?.id??'').trim();
const id=x=>String(x||'').trim().toUpperCase(),today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
function balance(emp,roster,month,snapshot=null){
 const quota=g.p79RestQuota(month),start=g.p79MonthlyRestContext.employmentStart(emp),end=Object.keys(roster).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&['離','離職'].includes(roster[d])).sort()[0]||'',dates=Array.from({length:quota.days},(_,i)=>month+'-'+String(i+1).padStart(2,'0')).filter(d=>(!start||d>=start)&&(!end||d<end));
 const counts={'例':0,'休':0,'國':0},off={...counts},reported={...counts},reserved={...counts},conflicts=[];
 quota.slots.filter(s=>(!start||s.sourceDate>=start)&&(!end||s.sourceDate<end)).forEach(s=>counts[s.category]++);
 if(dates.some(d=>!roster[d]))throw Error(emp.name+' 本月班表未排完整，請先補齊');
 const excluded=dates.filter(d=>g.P79RestAttendance?.isLeaveDay(snapshot,emp.empId,d,roster)||(snapshot?.leaveDates||[]).includes(id(emp.empId)+'|'+d)||(snapshot?.leaveCoverAssignments||[]).some(a=>d>=a.startDate&&d<=a.endDate&&(id(a.leaveEmpId)===id(emp.empId)||(a.workerIds||[]).some(x=>id(x)===id(emp.empId)))));
 const allocated=g.p79AllocateRestMonth(roster,roster.__meta||{},month,excluded,start,end).meta;
 const ledger=[],extraRestDates=[];
 for(const d of dates){const m=roster.__meta?.[d]||{},r=m.overtimeReport,allocation=allocated[d];
  const actual=g.P79RestAttendance?.state(snapshot,emp.empId,d)||'unknown';
  const scheduledRest=cats.includes(allocation?.restCategory)&&!allocation.restQuotaOvertime;
  const leave=g.P79RestAttendance?.isLeaveDay(snapshot,emp.empId,d,roster)||false;
  if(leave){ledger.push({date:d,kind:'leave',category:'',actual});if(r&&cats.includes(r.category)){if(storedReport(r))reported[r.category]++;ledger.push({date:d,kind:storedReport(r)?'reported':'unconfirmed',category:r.category,actual,reportId:r.id});conflicts.push({date:d,reportId:r.id,reason:'請假日期與未休加班申報重疊，保留原申報額度待核對'});}continue;}
  // One employee/date can consume the quota only once. A surviving report replaces
  // that date's roster allocation, while a completed no-card shift is actual rest.
  if(r&&cats.includes(r.category)&&actual!=='rest'){
   if(storedReport(r))reported[r.category]++;
   else conflicts.push({date:d,reason:'加班標記沒有儲存識別碼，未扣已申報額度，請核對雲端紀錄'});
   ledger.push({date:d,kind:storedReport(r)?'reported':'unconfirmed',category:r.category,actual,reportId:r.id});
   if(actual==='missing')conflicts.push({date:d,reportId:r.id,reason:'單邊缺卡，原申報保留待核對'});
  }else{
   if(scheduledRest){const kind=actual==='open'?'reserved':'off';(kind==='reserved'?reserved:off)[allocation.restCategory]++;ledger.push({date:d,kind,category:allocation.restCategory,actual});}
   else if(actual==='rest')extraRestDates.push(d);
   if(r&&cats.includes(r.category)&&actual==='rest')conflicts.push({date:d,reportId:r.id,reason:'整班無卡已按休假，原申報不列有效加班'});
  }
 }
 // Supplement the shared schedule allocation with actual, non-leave no-card days.
 for(const c of ['例','休','國']){const n=Math.min(extraRestDates.length,Math.max(0,counts[c]-off[c]-reserved[c]-reported[c]));for(const date of extraRestDates.splice(0,n)){off[c]++;ledger.push({date,kind:'off',category:c,actual:'rest'});}}
 for(const date of extraRestDates)ledger.push({date,kind:'excessRest',category:'',actual:'rest'});
 for(const c of cats){const excess=off[c]+reported[c]+reserved[c]-counts[c];if(excess>0)conflicts.push({date:'',reason:c+'已休、預排休與已申報合計超出額度'+excess+'天，請核對既有申報或排休'});}
 const remaining=Object.fromEntries(cats.map(c=>[c,Math.max(0,counts[c]-off[c]-reported[c]-reserved[c])]));
 const unused=Object.fromEntries(cats.map(c=>[c,Math.max(0,counts[c]-off[c]-reserved[c])]));
 return {quota:counts,off,reported,reserved,unused,remaining,dates,conflicts,ledger:ledger.sort((a,b)=>a.date.localeCompare(b.date))};
}
function ruleFor(date,roster,pair,category,rules){
 const allowed=rules.filter(r=>r[0]===category);
 if(pair){const found=g.P79Overtime.inferRule(pair.start,pair.end,date,allowed,category);return found||null;}
 const range={早:'08-16',中:'16-24',晚:'24-08'}[roster[date]];
 return allowed.find(r=>r[6]+'-'+r[7]===range)||null;
}
function sortRows(rows){
 const rank=r=>r.saved?2:(!r.planned&&r.status==='可申報'?0:1);
 return rows.sort((a,b)=>rank(a)-rank(b)||cats.indexOf(a.category)-cats.indexOf(b.category)||String(a.date).localeCompare(String(b.date))||String(a.name).localeCompare(String(b.name),'zh-Hant-u-co-stroke')||id(a.empId).localeCompare(id(b.empId)));
}
function plan(snapshot,people,month,rules){
 const rows=[],balances=[],issues=[],states=[],rosters=new Map((snapshot.schedules||[]).map(r=>[id(r.empId),r.schedule])),pairsByKey=new Map();
 for(const pair of snapshot.pairs||[]){const key=id(pair.empId)+'|'+pair.date;if(!pairsByKey.has(key))pairsByKey.set(key,[]);pairsByKey.get(key).push(pair);}
 const leaveDates=new Set(snapshot.leaveDates||[]),currentDate=today();
 const weekOf=date=>Number(date.slice(8))<=21?0:Number(date.slice(8))<=28?1:2;
 for(const emp of people){
  const roster=rosters.get(id(emp.empId));
  if(!roster){issues.push(emp.name+' 沒有本月班表');continue;}
  let b;try{b=balance(emp,roster,month,snapshot)}catch(e){issues.push(e.message);continue;}
  balances.push({emp,...b});
  b.conflicts.forEach(x=>issues.push(emp.name+' '+x.date+'：'+x.reason));
  const candidates=[];
  for(const date of b.dates){
   const m=roster.__meta?.[date]||{};
   if(Number(date.slice(8))<15||!['早','中','晚','國','休','例'].includes(roster[date])||m.overtimeReport||m.overtime||m.forEmpId||m.coverAssignmentId||m.overtimeExcluded||leaveDates.has(id(emp.empId)+'|'+date)||g.P79RestAttendance?.isLeaveDay(snapshot,emp.empId,date,roster))continue;
   const pairs=pairsByKey.get(id(emp.empId)+'|'+date)||[];
   if(!['早','中','晚'].includes(roster[date])&&!pairs.length)continue;
   if(pairs.length>1||!pairs.length&&date<currentDate)continue;
   const pair=pairs[0],byCategory=new Map();
   for(const category of cats){const rule=ruleFor(date,roster,pair,category,rules);if(rule)byCategory.set(category,rule);}
   candidates.push({date,pair,byCategory});
  }
  states.push({emp,b,candidates,used:new Set(),weekCount:[0,0,0],remaining:{...b.remaining}});
 }
 // Schedule the whole group together rather than finishing one person first.
 // Actual eligible attendance always precedes future plans; distribute each person's
 // dates across weeks before maximizing the number sharing each eligible date.
 for(const category of cats)for(const planned of [false,true]){
  while(true){
   const byDate=new Map();
   for(const state of states){
    if(!state.remaining[category])continue;
    const available=state.candidates.filter(c=>!state.used.has(c.date)&&(!c.pair)===planned&&c.byCategory.has(category));
    if(!available.length)continue;
    const minWeek=Math.min(...available.map(c=>state.weekCount[weekOf(c.date)]));
    for(const candidate of available){
     if(state.weekCount[weekOf(candidate.date)]!==minWeek)continue;
     if(!byDate.has(candidate.date))byDate.set(candidate.date,[]);
     byDate.get(candidate.date).push({state,candidate});
    }
   }
   if(!byDate.size)break;
   const [date,group]=[...byDate].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]))[0];
   for(const {state,candidate} of group){
    const rule=candidate.byCategory.get(category);
    rows.push({id:crypto.randomUUID(),empId:state.emp.empId,name:state.emp.name,date,category,rule:rule.slice(),checked:false,status:planned?'預排／待核對':'可申報',planned});
    state.used.add(date);state.weekCount[weekOf(date)]++;state.remaining[category]--;
   }
  }
 }
 for(const state of states)for(const category of cats)for(let n=0;n<state.remaining[category];n++)issues.push(state.emp.name+'「'+category+'」尚有1天找不到可申報日期或相符時段');
 return {rows:sortRows(rows),balances,issues};
}
function reportProgress(model,empId=null){
 const result=Object.fromEntries(cats.map(c=>[c,{remaining:0,selected:0,saved:0,after:0,over:0}]));
 for(const b of model.balances.filter(b=>empId==null||id(b.emp.empId)===id(empId)))for(const c of cats){
  const rows=model.rows.filter(r=>id(r.empId)===id(b.emp.empId)&&r.category===c),saved=rows.filter(r=>r.saved).length,selected=rows.filter(r=>r.checked&&!r.saved).length;
  const remaining=Math.max(0,b.remaining[c]-saved),t=result[c];
  t.remaining+=remaining;t.selected+=selected;t.saved+=saved;t.after+=Math.max(0,remaining-selected);t.over+=Math.max(0,selected-remaining);
 }
 return result;
}
function personSummary(model,empId){
 const b=model.balances.find(b=>id(b.emp.empId)===id(empId));if(!b)return '';
 const p=reportProgress(model,empId);
 return ['例','休','國'].map(c=>c+p[c].remaining).join('／');
}
function auditText(model,empId){
 const b=model.balances.find(b=>id(b.emp.empId)===id(empId));if(!b)return '';
 const p=reportProgress(model,empId),label={off:'已休',reserved:'預排休',reported:'既有申報',unconfirmed:'未確認標記（不扣已報）',leave:'請假（不扣例／休／國）',excessRest:'額度以外無卡休息'};
 const lines=[b.emp.name+'｜逐日額度核對',personSummary(model,empId)];
 for(const c of ['例','休','國'])lines.push(c+'：應休 '+b.quota[c]+'－已休 '+b.off[c]+'－預排休 '+b.reserved[c]+'－既有申報 '+b.reported[c]+'－本次已成功 '+p[c].saved+'＝未報 '+p[c].remaining+'；勾選 '+p[c].selected+'，報後 '+p[c].after);
 lines.push('',...(b.ledger||[]).map(x=>x.date+' '+(x.category||'')+' '+label[x.kind]+(x.actual==='rest'&&x.kind==='off'?'（整班無卡）':'')));
 lines.push(...model.rows.filter(r=>id(r.empId)===id(empId)&&(r.saved||r.checked)).map(r=>r.date+' '+r.category+' '+(r.saved?'本次已核對成功':'本次勾選，尚未申報')));
 if(b.conflicts.length)lines.push('','需核對：',...b.conflicts.map(x=>(x.date?x.date+' ':'')+x.reason));
 return lines.join('\n');
}
function styles(){if(document.getElementById('p79MonthlyRestStyle'))return;const el=document.createElement('style');el.id='p79MonthlyRestStyle';el.textContent=`#p79MonthlyRest{width:min(1080px,calc(100vw - 24px));max-height:90dvh;padding:0;border:0;border-radius:14px;color:#0f172a;background:#fff;box-shadow:0 20px 80px #0005;font:14px sans-serif}#p79MonthlyRest::backdrop{background:#0f172a88}#p79MonthlyRest header,#p79MonthlyRest footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;background:#f1f5f9}#p79MonthlyRest footer{flex-wrap:wrap}#p79MonthlyRest #mrResult{flex:1;min-width:150px;font-weight:700;color:#0369a1}#p79MonthlyRest .body{padding:12px 16px;overflow:auto;max-height:calc(90dvh - 120px)}#p79MonthlyRest .filters{display:flex;gap:8px;flex-wrap:wrap;align-items:end}#p79MonthlyRest label{display:flex;flex-direction:column;gap:4px;font-size:12px}#p79MonthlyRest input,#p79MonthlyRest select{border:1px solid #cbd5e1;padding:6px;border-radius:7px;background:white;color:#0f172a;max-width:100%}#p79MonthlyRest button{padding:7px 12px;border:0;border-radius:8px;background:#e2e8f0;color:#0f172a;cursor:pointer}#p79MonthlyRest button.primary{background:#0369a1;color:white}#p79MonthlyRest button:disabled{opacity:.5;cursor:wait}#p79MonthlyRest table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:12px}#p79MonthlyRest th,#p79MonthlyRest td{padding:7px 5px;border-bottom:1px solid #e2e8f0;text-align:center}#p79MonthlyRest .scroll{overflow:auto;margin-top:10px}#p79MonthlyRest .國{background:#fef3c7;color:#92400e}#p79MonthlyRest .休{background:#dbeafe;color:#1e40af}#p79MonthlyRest .例{background:#fee2e2;color:#991b1b}#p79MonthlyRest td.person{white-space:nowrap;min-width:170px}#p79MonthlyRest .person-progress{display:inline-block;padding:0;background:transparent;font-size:12px;color:#0369a1;white-space:nowrap}#p79MonthlyRest #mrStatus{white-space:pre-line;line-height:1.6;margin:10px 0;color:#475569}`;document.head.appendChild(el);}
async function open(){
 const a=g.p79MonthlyRestContext;if(!a?.canReport())return alert('沒有申報加班權限');
 if(document.getElementById('p79MonthlyRest'))return;styles();
 const el=document.createElement('dialog');el.id='p79MonthlyRest';
 el.innerHTML=`<header><b>每月未休假加班</b><button data-close>關閉</button></header><div class="body"><div class="filters"><label>月份<input id="mrMonth" type="month" value="${esc(a.month()||today().slice(0,7))}"></label><label>部門<select id="mrDept"></select></label><label>職稱<select id="mrJob"></select></label><label>人員<select id="mrEmp"></select></label><button class="primary" id="mrLoad">讀取未休／建議日期</button></div><p style="font-size:12px;color:#64748b">未休額度依排班系統配對結果；姓名後顯示尚待申報的例／休／國天數。</p><div id="mrStatus" role="status">選好月份與人員後，讀取班表及出勤紀錄。</div><div class="scroll"><table><thead><tr><th><input id="mrAll" type="checkbox" aria-label="全選"></th><th>日期</th><th>姓名</th><th>假別</th><th>出勤時段</th><th>申報時數</th><th>狀態</th></tr></thead><tbody id="mrRows"></tbody></table></div></div><footer><button data-close>取消</button><span id="mrResult" role="status" aria-live="polite">尚未送出申報</span><button id="mrSave" class="primary" disabled>申報勾選項目</button></footer>`;
 document.body.appendChild(el);el.showModal();
 const q=s=>el.querySelector(s),setStatus=x=>q('#mrStatus').textContent=x;let busy=false,model=null,snapshot=null,rules=[],stop=false,loadedMonth='',loadedPeople=[],lastFailure='';
 const people=a.employees().slice().sort((x,y)=>String(x.name).localeCompare(String(y.name),'zh-Hant-u-co-stroke'));
 function options(values,all){return '<option value="">'+all+'</option>'+values.map(v=>'<option>'+esc(v)+'</option>').join('');}
 const job=e=>e.jobTitle||e.deptDetail||'未設定';q('#mrDept').innerHTML=options([...new Set(people.map(e=>e.dept||'一般'))],'全部部門');
 function filter(){const dept=q('#mrDept').value;return people.filter(e=>!dept||(e.dept||'一般')===dept);}
 function jobs(){q('#mrJob').innerHTML=options([...new Set(filter().map(job))],'全部職稱');names();}
 function names(){q('#mrEmp').innerHTML='<option value="">全部人員</option>'+filter().filter(e=>!q('#mrJob').value||job(e)===q('#mrJob').value).map(e=>'<option value="'+esc(e.empId)+'">'+esc(e.name)+'</option>').join('');invalidate();}
 function invalidate(){lastFailure='';model=null;q('#mrRows').innerHTML='';q('#mrResult').textContent='尚未送出申報';q('#mrSave').disabled=true;q('#mrAll').checked=false;}
 q('#mrDept').onchange=jobs;q('#mrJob').onchange=names;q('#mrEmp').onchange=invalidate;q('#mrMonth').onchange=invalidate;jobs();
 function controls(disabled){el.querySelectorAll('.filters input,.filters select,.filters button,#mrAll,#mrRows input,#mrRows select').forEach(e=>e.disabled=disabled);q('#mrSave').disabled=disabled||!model?.rows.some(r=>r.checked&&!r.saved);el.querySelectorAll('[data-close]').forEach(e=>{e.textContent=disabled?'完成目前這筆後停止':'關閉';});}
 el.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(busy){stop=true;setStatus('將在目前這筆完成後停止，已確認儲存的資料會保留。');}else el.close();});el.oncancel=e=>{if(busy){e.preventDefault();stop=true;}};el.onclose=()=>el.remove();
 function paint(){
  sortRows(model.rows);
  const progress=reportProgress(model),sum=key=>cats.reduce((n,c)=>n+progress[c][key],0);
  const personLabels=new Map(model.balances.map(b=>[id(b.emp.empId),personSummary(model,b.emp.empId)]));
  const pendingRows=model.rows.filter(r=>!r.saved);
  q('#mrAll').checked=pendingRows.length>0&&pendingRows.every(r=>r.checked);q('#mrAll').indeterminate=pendingRows.some(r=>r.checked)&&!q('#mrAll').checked;
  q('#mrSave').textContent='申報勾選項目（'+sum('selected')+' 天）';
  q('#mrResult').textContent='已核對成功 '+model.rows.filter(r=>r.saved).length+' 筆／待核對 '+model.rows.filter(r=>r.attempted&&!r.saved).length+' 筆／待申報 '+model.rows.filter(r=>!r.saved&&!r.attempted).length+' 筆'+(lastFailure?'｜停止原因：'+lastFailure:'');
  q('#mrRows').innerHTML=model.rows.map((r,i)=>r.saved?'':'<tr data-row="'+i+'"><td><input class="pick" type="checkbox" '+(r.checked?'checked':'')+' '+(r.saved?'disabled':'')+' aria-label="申報 '+esc(r.name)+' '+r.date+'"></td><td><input class="date" type="date" value="'+r.date+'" min="'+loadedMonth+'-01" max="'+loadedMonth+'-'+String(g.p79RestQuota(loadedMonth).days).padStart(2,'0')+'" '+(r.saved?'disabled':'')+'></td><td class="person">'+esc(r.name)+' <button type="button" class="person-progress" data-audit="'+esc(r.empId)+'" title="查看此人逐日額度核對">'+esc(personLabels.get(id(r.empId)))+'</button></td><td class="'+r.category+'"><select class="category" '+(r.saved?'disabled':'')+'>'+cats.filter(c=>rules.some(rule=>rule[0]===c)).map(c=>'<option '+(c===r.category?'selected':'')+'>'+c+'</option>').join('')+'</select></td><td><select class="rule" '+(r.saved?'disabled':'')+'>'+rules.map((rule,k)=>rule[0]===r.category?'<option value="'+k+'" '+(JSON.stringify(rule)===JSON.stringify(r.rule)?'selected':'')+'>'+esc(rule[1])+'</option>':'').join('')+'</select></td><td>'+esc(r.rule[2])+' 小時'+(Number(r.rule[2])<8?'<span style="display:block;color:#b91c1c;font-weight:700">⚠ 未滿8小時</span>':'')+'</td><td>'+esc(r.status)+'</td></tr>').join('');
  q('#mrSave').disabled=!model.rows.some(r=>r.checked&&!r.saved);
 }
 q('#mrRows').onclick=e=>{const button=e.target.closest('[data-audit]');if(button&&model)alert(auditText(model,button.dataset.audit));};
 q('#mrRows').onchange=e=>{const tr=e.target.closest('[data-row]');if(!tr)return;const r=model.rows[Number(tr.dataset.row)];if(r.saved)return;if(!e.target.classList.contains('pick'))r.id=crypto.randomUUID();
  if(e.target.classList.contains('pick'))r.checked=e.target.checked;
  if(e.target.classList.contains('date')){r.date=e.target.value;r.status='日期已改，儲存時重新核對出勤';}
  if(e.target.classList.contains('category')){r.category=e.target.value;const roster=snapshot.schedules.find(x=>id(x.empId)===id(r.empId))?.schedule||{},pair=snapshot.pairs.find(p=>id(p.empId)===id(r.empId)&&p.date===r.date);r.rule=(ruleFor(r.date,roster,pair,r.category,rules)||rules.find(x=>x[0]===r.category)).slice();r.status='假別已改，申報前會重新核對未休額度';}
  if(e.target.classList.contains('rule')){r.rule=rules[Number(e.target.value)].slice();r.status='時段已改，儲存時重新核對出勤';}
  paint();
 };
 q('#mrAll').onchange=()=>{model?.rows.forEach(r=>{if(!r.saved)r.checked=q('#mrAll').checked;});if(model)paint();};
 q('#mrLoad').onclick=async()=>{
  if(busy)return;invalidate();busy=true;controls(true);setStatus('正在同時讀取班表、出勤及雲端加班選項…');
  try{loadedMonth=q('#mrMonth').value;g.p79RestQuota(loadedMonth);loadedPeople=filter().filter(e=>(!q('#mrJob').value||job(e)===q('#mrJob').value)&&(!q('#mrEmp').value||e.empId===q('#mrEmp').value));if(!loadedPeople.length)throw Error('沒有符合的人員');
   const [data,options]=await Promise.all([a.snapshot(loadedMonth),g.P79Overtime.loadRules()]);snapshot=data;rules=options.rows;model=plan(snapshot,loadedPeople,loadedMonth,rules);paint();
   setStatus('已列出 '+model.rows.length+' 筆建議，請勾選要申報的日期。\n'+model.issues.filter(issue=>!issue.includes('已休、預排休與已申報合計超出額度')).join('\n'));
  }catch(e){setStatus('讀取失敗：'+e.message);}finally{busy=false;controls(false);}
 };
 q('#mrSave').onclick=async()=>{
  if(busy||!model)return;const selected=model.rows.filter(r=>r.checked&&!r.saved);if(!selected.length)return;
  const seen=new Set();for(const r of selected){const key=id(r.empId)+'|'+r.date;if(!r.date.startsWith(loadedMonth+'-')||seen.has(key)){setStatus('日期不符或同一人同日重複，請調整後再申報。');return;}seen.add(key);}
  const short=selected.filter(r=>Number(r.rule[2])<8);
  if(short.length&&!confirm('⚠ 有 '+short.length+' 筆未休加班申報未滿8小時：\\n'+short.map(r=>r.name+' '+r.date+'（'+r.rule[2]+'小時）').join('\\n')+'\\n確定仍要申報嗎？'))return;
  busy=true;stop=false;controls(true);lastFailure='';let count=0,failure='',batch=null;
  try{
   setStatus('正在重新核對未休額度與已申報紀錄…');
   const fresh=await a.snapshot(loadedMonth),available=new Map(),usage=new Map();batch=fresh.saveContext;
   for(const emp of loadedPeople.filter(emp=>selected.some(r=>id(r.empId)===id(emp.empId)))){const roster=fresh.schedules.find(x=>id(x.empId)===id(emp.empId))?.schedule;if(!roster)throw Error(emp.name+' 班表已變更，請重新讀取');available.set(id(emp.empId),balance(emp,roster,loadedMonth,fresh).remaining);}
   for(const r of selected){const roster=fresh.schedules.find(x=>id(x.empId)===id(r.empId))?.schedule,meta=roster?.__meta?.[r.date]||{};
    if(meta.overtimeReport?.id===r.id&&meta.overtimeReport.category===r.category&&meta.overtimeReport.code===g.P79Overtime.report(r.rule).code){r.saved=true;r.checked=false;r.status='已核對儲存成功';continue;}
    if(meta.overtimeReport||meta.overtime||meta.forEmpId||meta.coverAssignmentId||(fresh.leaveDates||[]).includes(id(r.empId)+'|'+r.date)||g.P79RestAttendance?.isLeaveDay(fresh,r.empId,r.date,roster))throw Error(r.name+' '+r.date+' 已有加班、代班或請假，請重新讀取');
    if(!balance(loadedPeople.find(e=>id(e.empId)===id(r.empId)),roster,loadedMonth,fresh).dates.includes(r.date))throw Error(r.name+' 日期早於報到日，請重新選擇');
    const key=id(r.empId)+'|'+r.category,n=(usage.get(key)||0)+1;usage.set(key,n);if(n>(available.get(id(r.empId))?.[r.category]||0))throw Error(r.name+'「'+r.category+'」勾選超過目前未休額度，請減少勾選或重新讀取');
   }
   paint();controls(true);
   for(const r of selected){if(stop)break;if(r.saved)continue;setStatus('正在申報 '+(count+1)+'／'+selected.length+'：'+r.name+' '+r.date+' '+r.rule[1]);
    const draft={id:r.id,empId:r.empId,date:r.date,rule:g.P79Overtime.report(r.rule),forEmpId:'',note:'每月未休假加班 '+loadedMonth,preventReplace:true,createdAt:Date.now()};
    sessionStorage.setItem(KEY,JSON.stringify(draft));r.attempted=true;r.status='送出中／待雲端讀回';paint();controls(true);
    let result;try{result=await a.saveReport(draft,batch);}catch(error){r.status='未確認成功：'+error.message;paint();controls(true);throw error;}
    if(result?.ok!==true||result.directOvertimeSaved!==true||result.id!==draft.id)throw Error('雲端尚未確認接收此筆申報');
    r.acknowledged=true;r.checked=false;r.status='雲端已接收／批次核對中';count++;paint();controls(true);
   }
  }catch(e){failure=e.message;}
  finally{
   const pending=model.rows.filter(r=>r.attempted&&!r.saved);
   if(pending.length){
    setStatus('正在一次核對 '+pending.length+' 筆雲端申報…');
    try{
     const verified=await a.snapshot(loadedMonth,true);
     for(const r of pending){const report=verified.schedules.find(x=>id(x.empId)===id(r.empId))?.schedule?.__meta?.[r.date]?.overtimeReport;
      if(report?.id===r.id&&report.category===r.category&&report.code===g.P79Overtime.report(r.rule).code){r.saved=true;r.acknowledged=true;r.checked=false;r.status='雲端讀回已確認';}
      else{r.checked=true;r.status='讀回未確認；保留原編號重試核對';}
     }
     if(!failure&&pending.every(r=>r.saved))sessionStorage.removeItem(KEY);
    }catch(e){failure+=(failure?'；':'')+'批次讀回未確認：'+e.message;pending.forEach(r=>{r.checked=true;r.status='讀回未確認；保留原編號重試核對';});}
   }
   const confirmed=model.rows.filter(r=>r.saved).length,unverified=model.rows.filter(r=>r.attempted&&!r.saved).length;
   setStatus('本次已核對成功 '+confirmed+' 筆。'+(unverified?'另有 '+unverified+' 筆待核對。':'')+(stop?'已停止，其餘未送出。':'')+(failure?'後續停止：'+failure:'成功項目已移出待報清單。'));
   lastFailure=failure;busy=false;paint();controls(false);a.refresh?.();
  }
 };
}
g.P79MonthlyRest={open,plan,balance,ruleFor,sortRows,reportProgress,auditText,personSummary};
})(window);
