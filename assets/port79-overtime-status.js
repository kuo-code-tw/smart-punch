(function(g){
'use strict';
const directFetch=g.fetch?.bind(g);
const labels={reported:'已申報',amended:'已修改・有效',review:'休假超額・待核對',revoked:'已取消／撤銷',unverified:'核對未完成'},uid=x=>String(x||'').trim().toUpperCase(),cats=['例','休','國'];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(row){
 if(row.revocation?.confirmed===true&&row.revocation.reportId===row.id)return 'revoked';
 // A confirmed edit must remain visible when accounting filters "已修改",
 // even when attendance/quota validation is separately incomplete.
 if(row.amendment?.verified)return 'amended';
 if(row.issue)return 'unverified';
 return !row.exempt&&row.excessDays>0?'review':'reported';
}
function filter(rows,q={}){const term=String(q.name||'').trim().toLowerCase(),employee=uid(q.employee);return rows.filter(r=>(!q.status||status(r)===q.status)&&(!q.category||r.category===q.category)&&(!q.dept||r.dept===q.dept)&&(!q.job||r.job===q.job)&&(!employee||uid(r.empId)===employee)&&(!term||[r.name,r.empId].some(v=>String(v).toLowerCase().includes(term))));}
const strokeCollator=new Intl.Collator('zh-Hant-u-co-stroke',{numeric:true});
function sortEmployeesByStroke(people){
 return [...new Map((people||[]).filter(e=>e?.empId&&String(e.name||'').trim())
   .map(e=>[uid(e.empId),{empId:uid(e.empId),name:String(e.name).trim(),dept:String(e.dept||'').trim(),job:String(e.jobTitle||e.deptDetail||e.job||'').trim()}])).values()]
   .sort((a,b)=>strokeCollator.compare(a.name,b.name)||a.empId.localeCompare(b.empId));
}
function employeeFilterOptions(people,dept='',job=''){
 const staff=sortEmployeesByStroke(people);
 const departments=[...new Set(staff.map(e=>e.dept).filter(Boolean))].sort(strokeCollator.compare);
 const inDept=staff.filter(e=>!dept||e.dept===dept);
 const jobs=[...new Set(inDept.map(e=>e.job).filter(Boolean))].sort(strokeCollator.compare);
 const employees=inDept.filter(e=>!job||e.job===job);
 return {departments,jobs,employees};
}
function collect(snapshot,people,month,balance){
 if(snapshot?.attendanceEvidence?.complete!==true||snapshot.attendanceEvidence.month!==month||!Array.isArray(snapshot.schedules))throw Error('考勤或班表尚未完整核對，不能判定休假超額');
 const employees=new Map(people.map(e=>[uid(e.empId),e])),rows=[],issues=[],seen=new Set();
 const R=g.P79OvertimeReason;
 if(!R?.classify)throw Error('特殊日及代班申報分類模組未載入，不能安全判定超額');
 for(const entry of snapshot.schedules){
  const emp=employees.get(uid(entry.empId));if(!emp)continue;
  const roster=entry.schedule||{},meta=roster.__meta||{};
  const valid=([date,m])=>date.startsWith(month+'-')&&!!String(m?.overtimeReport?.id??'').trim()&&
    m.overtimeExcluded!==true&&!(m.overtimeRevocations||[]).some(x=>
     x?.confirmed===true&&String(x.reportId)===String(m.overtimeReport.id));
  const active=Object.entries(meta).filter(valid);
  const countEligible=([date,m])=>!R.classify({empId:emp.empId,date,meta:m,report:m.overtimeReport,roster,snapshot}).exempt;
  const counts=Object.fromEntries(cats.map(c=>[c,active.filter(pair=>countEligible(pair)&&pair[1].overtimeReport.category===c).length]));
  let b,error='',excess={};
  try{
   b=balance(emp,roster,month,snapshot);const off={...b.off};
   let extras=b.ledger.filter(x=>x.kind==='excessRest').length;
   for(const c of cats){
    const n=Math.min(extras,Math.max(0,b.quota[c]-off[c]-b.reserved[c]));
    off[c]+=n;extras-=n;
    excess[c]=Math.max(0,off[c]+b.reserved[c]+counts[c]-b.quota[c]);
   }
  }catch(e){error=e.message;issues.push((emp.name||entry.empId)+'：'+error);}
  const common={empId:emp.empId,name:emp.name||emp.empId,dept:emp.dept||'',job:emp.jobTitle||emp.deptDetail||''};
  for(const [date,m] of Object.entries(meta)){
   if(!date.startsWith(month+'-'))continue;
   const add=(report,audit)=>{
    if(!String(report?.id??'').trim())return;
    const key=uid(emp.empId)+'|'+date+'|'+report.id+'|'+(audit?'revoked':'active');
    if(seen.has(key))return;seen.add(key);
    const reason=R.classify({empId:emp.empId,date,meta:m,report,roster,snapshot});
    const amendment=R.amended(report,m);
    rows.push({...common,id:report.id,date,report:JSON.parse(JSON.stringify(report)),
      category:report.category,type:report.typeName||({例:'例假加班',休:'休息日加班',國:'國定假日加班',延:'平日延長加班',代:'休假代班加班'}[report.category])||report.code,
      period:String(report.overtimeStart||'')+'–'+String(report.overtimeEnd||''),hours:report.declaredHours,
      excessDays:!audit&&!reason.exempt?(excess[report.category]||0):0,issue:!audit?error:'',
      linked:reason.kind==='cover'||!!(m.forEmpId||report.leaveId),reasonLabel:reason.label,
      exemptionNote:reason.detail,exempt:reason.exempt,amendment,note:R.reportNote({empId:emp.empId,date,meta:m,report,roster,snapshot}),
      revocation:audit||null});
   };
   if(valid([date,m]))add(m.overtimeReport,null);
   // A verified cloud revocation remains visible whatever its reason:
   // quota correction, manager cancellation, or amended-and-replaced report.
   for(const audit of m.overtimeRevocations||[]){
    if(audit?.confirmed===true&&audit.report?.id===audit.reportId&&
       uid(audit.empId)===uid(emp.empId)&&audit.date===date&&audit.actor&&audit.at)
      add(audit.report,audit);
   }
  }
 }
 rows.sort((a,b)=>b.date.localeCompare(a.date)||a.empId.localeCompare(b.empId)||a.id.localeCompare(b.id));
 return {rows,issues};
}

/**
 * Lightweight alert driven strictly by saved cloud audit evidence.
 * Do not synthesize "modified" from an ordinary roster update, and never
 * interpret the absence of audit rows as proof that no historical edits happened.
 */
function auditSummary(scheduleEntries,people,month){
 const permitted=new Set((people||[]).map(e=>uid(e.empId)));
 const modified=[],cancelled=[],seen=new Set(),R=g.P79OvertimeReason;
 for(const entry of scheduleEntries||[]){
  const empId=uid(entry.empId);if(!permitted.has(empId))continue;
  const emp=(people||[]).find(e=>uid(e.empId)===empId)||{};
  for(const [date,m] of Object.entries(entry.schedule?.__meta||{})){
   if(!date.startsWith(month+'-')||!m||typeof m!=='object')continue;
   const report=m.overtimeReport;
   const revoked=(m.overtimeRevocations||[]).some(a=>a?.confirmed===true&&String(a.reportId)===String(report?.id));
   if(String(report?.id??'').trim()&&m.overtimeExcluded!==true&&!revoked){
    const amendment=R?.amended?.(report,m);
    if(amendment?.verified===true){
     const key=empId+'|'+date+'|'+report.id+'|modified';
     if(!seen.has(key)){seen.add(key);modified.push({empId,name:emp.name||empId,date,id:report.id,
      at:amendment.modifiedAt||'',kind:'amended'});}
    }
   }
   for(const audit of m.overtimeRevocations||[]){
    if(audit?.confirmed!==true||!String(audit.reportId??'').trim()||
      String(audit.report?.id)!==String(audit.reportId)||
      uid(audit.empId)!==empId||audit.date!==date||!audit.actor||!audit.at)continue;
    const key=empId+'|'+date+'|'+audit.reportId+'|revoked';
    if(seen.has(key))continue;seen.add(key);
    cancelled.push({empId,name:emp.name||empId,date,id:audit.reportId,
      at:audit.at,actor:audit.actor,reason:audit.reason||'',kind:'revoked'});
   }
  }
 }
 const newest=[...modified,...cancelled].sort((a,b)=>String(b.at||b.date).localeCompare(String(a.at||a.date)))[0]||null;
 return {month,modified:modified.length,cancelled:cancelled.length,total:modified.length+cancelled.length,newest};
}
function updateBanner(summary=null,options={}){
 const host=g.document?.getElementById?.('p79OvertimeChangeNotice');if(!host)return;
 const text=host.querySelector('#p79OvertimeChangeText'),edit=host.querySelector('#p79ChangeModified'),
  cancel=host.querySelector('#p79ChangeCancelled'),tip=host.querySelector('#p79ChangeHint');
 if(!text||!edit||!cancel||!tip)return;
 const ready=options.ready===true;
 host.dataset.p79State=!ready?'loading':summary?.total?'changed':'clear';
 if(!ready){
  text.textContent=options.message||'雲端異動紀錄尚未核對';
  tip.textContent='請選擇月份並重新讀取加班紀錄';
 }else if(summary.total){
  text.textContent='本月有 '+summary.total+' 筆加班異動紀錄，請會計核對';
  tip.textContent=summary.newest?
    '最近紀錄：'+summary.newest.name+'／'+summary.newest.date+
      (summary.newest.kind==='revoked'?' 已取消（請勿付款）':' 已修改'):'點選下方查看';
 }else{
  text.textContent='目前未讀到有留痕的加班修改或取消';
  tip.textContent='舊資料若未保留雲端異動歷史，仍須人工核對';
 }
 edit.textContent='查看已修改（'+(ready?summary.modified:'—')+'）';
 cancel.textContent='查看已取消（'+(ready?summary.cancelled:'—')+'）';
 edit.disabled=cancel.disabled=!ready;
}

function accountingCsv(rows){
  const cols=['申報日期','姓名','工號','部門','職稱','申報編號','申報類型','加班時段','申報時數','備註','超額排除原因','會計狀態','修改日期','取代原編號','取消原因','取消人','取消時間'];
  const values=rows.map(r=>[r.date,r.name,r.empId,r.dept,r.job,r.id,r.type,r.period,r.hours,
   r.note,r.exemptionNote||'',status(r)==='revoked'?'已取消（請勿付款）':status(r)==='amended'?'已修改（依目前有效版本）':status(r)==='review'?'已申報待核對':status(r)==='unverified'?'核對未完成':'已申報有效',
   r.amendment?.modifiedAt||'',r.amendment?.priorId||'',r.revocation?.reason||'',r.revocation?.actor||'',r.revocation?.at||'']);
  const safe=v=>{const t=String(v??'');return '"'+(/^[=+@\-]/.test(t)?"'"+t:t).replace(/"/g,'""')+'"';};
  return '\ufeff'+[cols,...values].map(line=>line.map(safe).join(',')).join('\r\n');
 }

function open(options={}){
 const ctx=g.p79OvertimeStatusContext;if(!ctx?.canOpen())return alert('沒有加班申報查看權限');
 const initialState=['attention','amended','revoked','review','unverified'].includes(options.state)?options.state:'attention';
 const preferredMonth=/^\d{4}-(0[1-9]|1[0-2])$/.test(String(options.month||''))?String(options.month):'';
 const preferredEmployee=uid(options.employee);
 const existing=document.getElementById('p79OvertimeStatus');
 if(existing){
  existing.focus();
  if(initialState){
   const select=existing.querySelector('#osState');
   if(select){select.value=initialState;select.dispatchEvent(new Event('change'));}
  }
  if(preferredEmployee){
   const target=(ctx.employees()||[]).find(e=>uid(e.empId)===preferredEmployee);
   if(target){
    const dept=existing.querySelector('#osDept'),job=existing.querySelector('#osJob'),employee=existing.querySelector('#osEmployee');
    if(dept){dept.value=String(target.dept||'').trim();dept.dispatchEvent(new Event('change'));}
    if(job){job.value=String(target.jobTitle||target.deptDetail||target.job||'').trim();job.dispatchEvent(new Event('change'));}
    if(employee&&[...employee.options].some(o=>o.value===preferredEmployee)){
     employee.value=preferredEmployee;employee.dispatchEvent(new Event('change'));
    }
   }
  }
  const month=existing.querySelector('#osMonth');
  if(month&&preferredMonth&&month.value!==preferredMonth){
   month.value=preferredMonth;month.dispatchEvent(new Event('change'));
   existing.querySelector('#osLoad')?.click();
  }
  return;
 }
 // The name selector is a stable list in Traditional Chinese stroke order; use employee ID rather than display name to disambiguate names.
 let staff=sortEmployeesByStroke(ctx.employees()||[]);
 const el=document.createElement('dialog');el.id='p79OvertimeStatus';el.style.cssText='width:min(1880px,calc(100vw - 20px));max-width:none;max-height:96vh;border:1px solid #d5dfeb;border-radius:14px;padding:14px;background:#fff;color:#18334e;';
 el.innerHTML=`<style>#p79OvertimeStatus *{box-sizing:border-box}#p79OvertimeStatus h2{font-size:20px;margin:0}#p79OvertimeStatus header,#p79OvertimeStatus footer{display:flex;justify-content:space-between;gap:12px;align-items:center}#p79OvertimeStatus button,#p79OvertimeStatus select,#p79OvertimeStatus input{font:inherit;padding:8px 10px;border:1px solid #c9d5e3;border-radius:7px;background:#fff;color:#17334f}#p79OvertimeStatus button{cursor:pointer;font-weight:bold}#p79OvertimeStatus button:disabled{opacity:.45;cursor:default}#p79OvertimeStatus .os-filters{display:grid;grid-template-columns:136px minmax(140px,1.1fr) minmax(125px,.85fr) minmax(188px,1.6fr) 108px minmax(162px,1.2fr) 90px 175px;gap:8px;align-items:end;min-width:0;overflow-x:auto;margin:10px 0;background:#f4f7fb;padding:10px;border-radius:10px}#p79OvertimeStatus .os-filters>label{min-width:0}#p79OvertimeStatus .os-filters>label>input,#p79OvertimeStatus .os-filters>label>select{min-width:0;width:100%;height:37px}#p79OvertimeStatus .os-filters>button{height:37px;white-space:nowrap;padding:6px 8px;font-size:12px}#p79OvertimeStatus .os-filters label{white-space:nowrap}#p79OvertimeStatus .os-filters::-webkit-scrollbar{height:6px}#p79OvertimeStatus label{display:grid;gap:5px;font-size:12px}#p79OvertimeStatus .os-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#p79OvertimeStatus .os-tabs button[aria-pressed=true]{background:#e9f2fc;border-color:#658bb3}#p79OvertimeStatus .os-table{overflow:auto;max-height:64vh;border:1px solid #e2e8f0;border-radius:8px}#p79OvertimeStatus table{border-collapse:collapse;width:100%;white-space:nowrap;font-size:13px}#p79OvertimeStatus th{background:#edf3f9;position:sticky;top:0}#p79OvertimeStatus td,#p79OvertimeStatus th{padding:11px 10px;border-bottom:1px solid #e8eef5;text-align:center}#p79OvertimeStatus .badge{padding:5px 8px;border-radius:6px;font-size:12px;font-weight:bold;display:inline-block}#p79OvertimeStatus .reported{background:#e9f7ef;color:#19734c}#p79OvertimeStatus .amended{background:#e6f2ff;color:#185d9c}#p79OvertimeStatus .review{background:#ffedf0;color:#ad3040}#p79OvertimeStatus .revoked{background:#edf0f4;color:#637183}#p79OvertimeStatus .unverified{background:#fff2cf;color:#91620c}#p79OvertimeStatus .os-status{min-height:28px;white-space:pre-wrap;font-size:13px;margin:10px 0}#p79OvertimeStatus .os-hint{font-size:12px;color:#687d94;line-height:1.7;margin:10px 0}#p79OvertimeStatus .danger{background:#b83647;color:white;border-color:#b83647}</style><header><h2>加班異常與異動紀錄</h2><button data-close>關閉</button></header><div class="os-hint">此處只顯示休假超額、核對未完成、已修改及已取消紀錄，正常已申報不列在畫面中；颱風及純代班加班不列入例／休／國額度；如本人原休息日出勤並正式申報「休」，即使兼有代班連結也要計入本人的休額度。會計匯出仍保留原始申報與異動歷史。</div><div class="os-filters"><label>月份<input id="osMonth" type="month" value="${esc(preferredMonth||ctx.month()||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date()).slice(0,7))}"></label><label>部門<select id="osDept"><option value="">全部部門</option></select></label><label>職稱<select id="osJob"><option value="">全部職稱</option></select></label><label>姓名<select id="osEmployee" aria-label="按繁體中文筆畫排序選擇員工"><option value="">全部姓名</option>${staff.map(e=>'<option value="'+esc(e.empId)+'">'+esc(e.name)+'（'+esc(e.empId)+'）</option>').join('')}</select></label><label>假別<select id="osCat"><option value="">全部假別</option>${['例','休','國','延','代'].map(c=>'<option>'+c+'</option>').join('')}</select></label><label>申報狀態<select id="osState"><option value="attention">僅顯示異常</option>${Object.entries(labels).filter(([k])=>k!=='reported').map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')}</select></label><button id="osLoad">重新讀取</button><button id="osAccountingExport" type="button">匯出加班會計異動清單</button></div><div class="os-tabs">${[['attention','異常'],['amended','已修改'],['review','🔴 休假超額・待核對'],['unverified','核對未完成'],['revoked','⚪ 已取消／撤銷']].map(([k,v])=>'<button data-state="'+k+'" aria-pressed="false">'+v+' <span></span></button>').join('')}</div><div id="osCount"></div><div class="os-table"><table><thead><tr><th><input id="osAll" type="checkbox" aria-label="勾選目前的待核對申報"></th><th>申報日期</th><th>姓名／工號</th><th>加班類型</th><th>申報時段</th><th>申報時數</th><th>備註／不計超額原因</th><th>休假核對</th><th>申報狀態</th><th>處理紀錄</th></tr></thead><tbody id="osRows"></tbody></table></div><div id="osMessage" class="os-status" role="status"></div><footer><span class="os-hint">失敗或逾時不會改成已撤銷；每筆處理前都會重新核對。</span><button id="osRevoke" class="danger" disabled>撤銷勾選申報（0）</button></footer>`;
 document.body.appendChild(el);el.showModal();const q=s=>el.querySelector(s),identity=()=>ctx.account()+'|'+ctx.session();let data=null,loaded=null,selected=new Set(),busy=false,visible=[],account=identity();
 q('#osState').value=initialState;
 const message=s=>q('#osMessage').textContent=s;
 const query=()=>({employee:uid(q('#osEmployee').value),category:q('#osCat').value,status:q('#osState').value,dept:q('#osDept').value,job:q('#osJob').value});
 function paint(){
  const criteria=query();
  const base=filter(data?.rows||[],{...criteria,status:''});
  visible=criteria.status==='attention'?base.filter(r=>status(r)!=='reported'):filter(data?.rows||[],criteria);
  el.querySelectorAll('[data-state]').forEach(b=>{
   b.setAttribute('aria-pressed',String(b.dataset.state===criteria.status));
   b.querySelector('span').textContent=base.filter(r=>b.dataset.state==='attention'?status(r)!=='reported':status(r)===b.dataset.state).length;
  });
  const selectedStaff=staff.find(e=>e.empId===criteria.employee);
  q('#osCount').textContent=(selectedStaff?'姓名：'+selectedStaff.name+'（'+selectedStaff.empId+'）｜':'')+'符合條件 '+visible.length+' 筆';
  q('#osAccountingExport').disabled=busy||!data?.rows?.length;
  q('#osRows').innerHTML=visible.map((r,i)=>{
   const st=status(r);
   const reviewText=st==='review'?r.category+' 超額 '+r.excessDays+' 天'+(r.linked?'；仍有請假代班連結':r.report.planned?'（含預排）':'')
    :st==='unverified'?r.issue:st==='revoked'?'已取消；不計有效申報'
    :st==='amended'?(r.issue?'已修改；休假核對未完成：'+r.issue:
     !r.exempt&&r.excessDays>0?'已修改；'+r.category+' 超額 '+r.excessDays+' 天，仍需核對':
     '修改已核實；仍有效')
    :r.exempt?r.exemptionNote:'無超額提醒';
   const checkbox=st==='review'&&!r.linked
    ?'<input type="checkbox" data-pick="'+i+'" aria-label="勾選 '+esc(r.name)+' '+r.date+'" '+(selected.has(r.id)?'checked':'')+(busy?' disabled':'')+'>':'';
   return '<tr><td>'+checkbox+'</td><td>'+esc(r.date)+'</td><td>'+esc(r.name)+'<br><small>'+esc(r.empId)+'</small></td>'+
    '<td>'+esc(r.type)+'</td><td>'+esc(r.period)+'</td><td>'+esc(r.hours)+' 小時</td>'+
    '<td>'+esc(r.note)+'<br><small>'+esc(r.exemptionNote)+'</small></td>'+
    '<td>'+esc(reviewText)+'</td><td>'+(st==='review'?'<small>已申報 </small>':'')+
    '<span class="badge '+st+'">'+labels[st]+'</span></td>'+
    '<td><button data-detail="'+i+'">'+(st==='revoked'?'查看取消紀錄':st==='amended'?'查看修改紀錄':'查看申報')+'</button></td></tr>';
  }).join('')||'<tr><td colspan="10">'+(loaded?(selectedStaff?'「'+esc(selectedStaff.name)+'」在目前月份及篩選條件下沒有符合的申報':'沒有符合條件的申報'):'請先讀取月份資料')+'</td></tr>';
  const eligible=visible.filter(r=>status(r)==='review'&&!r.linked);
  q('#osAll').disabled=busy||!eligible.length;
  q('#osAll').checked=eligible.length>0&&eligible.every(r=>selected.has(r.id));
  q('#osRevoke').disabled=busy||!selected.size||!ctx.canRevoke()||loaded?.saveContext?.cloud?.overtimeRevocationVersion!==1;
  q('#osRevoke').textContent='撤銷勾選申報（'+selected.size+'）';
 }
 function lock(on){busy=on;el.querySelectorAll('.os-filters input,.os-filters select,.os-filters button,.os-tabs button,[data-close]').forEach(n=>n.disabled=on);paint();}
 async function load(){const month=q('#osMonth').value;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('請選有效月份');if(identity()!==account||!ctx.canOpen())throw Error('登入身分已變更，請關閉後重新開啟');const snapshot=await ctx.snapshot(month);if(identity()!==account)throw Error('登入身分已變更');const result=collect(snapshot,ctx.employees(),month,ctx.balance);
 loaded=snapshot;data=result;staff=sortEmployeesByStroke(ctx.employees()||[]);options();selected.clear();paint();
 // Keep the prominent banner in sync after an authoritative full reload.
 updateBanner(auditSummary(snapshot.schedules,ctx.employees(),month),{ready:true});
 return result;}
 function options(reset=''){
  const dept=q('#osDept'),job=q('#osJob'),employee=q('#osEmployee');
  const priorDept=dept.value,priorJob=reset==='dept'?'':job.value;
  const priorEmployee=['dept','job'].includes(reset)?'':uid(employee.value);
  const depts=employeeFilterOptions(staff).departments;
  dept.innerHTML='<option value="">全部部門</option>'+depts.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  dept.value=depts.includes(priorDept)?priorDept:'';
  const jobs=employeeFilterOptions(staff,dept.value).jobs;
  job.innerHTML='<option value="">全部職稱</option>'+jobs.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  job.value=jobs.includes(priorJob)?priorJob:'';
  const names=employeeFilterOptions(staff,dept.value,job.value).employees;
  employee.innerHTML='<option value="">全部姓名</option>'+names.map(e=>'<option value="'+esc(e.empId)+'">'+esc(e.name)+'（'+esc(e.empId)+'）</option>').join('');
  employee.value=names.some(e=>e.empId===priorEmployee)?priorEmployee:'';
 }
 q('#osLoad').onclick=async()=>{if(busy)return;data=loaded=null;selected.clear();lock(true);message('正在核對完整月份班表、跨日考勤與既有申報…');try{await load();message((data.issues||[]).join('\n')||(loaded.saveContext?.cloud?.overtimeRevocationVersion===1?'已從雲端核對完成。':'已讀取申報；雲端尚未開放保留紀錄的撤銷功能。'));}catch(e){data=loaded=null;message('讀取未完成：'+e.message);}finally{lock(false);}};
 q('#osMonth').onchange=()=>{data=loaded=null;selected.clear();paint();message('月份已變更，請重新讀取。');};
 q('#osDept').onchange=()=>{options('dept');selected.clear();paint();};
 q('#osJob').onchange=()=>{options('job');selected.clear();paint();};
 for(const id of ['#osCat','#osState'])q(id).onchange=()=>{selected.clear();paint();};
 const employeeChanged=()=>{selected.clear();paint();};
 q('#osEmployee').onchange=employeeChanged;
 q('#osEmployee').oninput=employeeChanged;
 el.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>{q('#osState').value=b.dataset.state;selected.clear();paint();});q('[data-close]').onclick=()=>el.close();el.onclose=()=>el.remove();el.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 q('#osRows').onchange=e=>{const value=e.target.dataset.pick;if(value===undefined||busy)return;const r=visible[Number(value)];e.target.checked?selected.add(r.id):selected.delete(r.id);paint();};q('#osAll').onchange=()=>{visible.filter(r=>status(r)==='review'&&!r.linked).forEach(r=>q('#osAll').checked?selected.add(r.id):selected.delete(r.id));paint();};
 q('#osRows').onclick=e=>{
  const v=e.target.closest('[data-detail]')?.dataset.detail;if(v===undefined)return;
  const r=visible[Number(v)],a=r.revocation;
  alert([r.name+' '+r.empId,r.date+' '+r.type+' '+r.period,
   '申報 '+r.hours+' 小時｜'+labels[status(r)],'申報編號：'+r.id,
   '備註：'+r.note,r.exemptionNote||'',
   ...(r.amendment?.verified?['修改日期：'+(r.amendment.modifiedAt||'請看下方紀錄'),
     '取代原編號：'+(r.amendment.priorId||'未提供'),
     ...(r.amendment.history||[]).map(h=>'修改：'+h.at+'／'+h.actor+'／'+(h.reason||'申報異動'))]:[]),
   ...(a?['取消原因：'+(a.reason||'未填'),'取消人：'+a.actor,'取消時間：'+a.at,'原始申報已作廢，不得重複請款']:[])
  ].filter(Boolean).join('\n'));
 };

 q('#osAccountingExport').onclick=()=>{
  if(!data?.rows?.length||busy)return;
  const content=accountingCsv(data.rows);
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;link.download='會計加班異動清單_'+q('#osMonth').value+'.csv';
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 q('#osRevoke').onclick=async()=>{if(busy||!loaded||!ctx.canRevoke()||identity()!==account)return;const picked=data.rows.filter(r=>selected.has(r.id)&&status(r)==='review'&&!r.linked);if(!picked.length)return;if(!confirm('確認撤銷以下 '+picked.length+' 筆候選申報？每筆會重新核對，超額解除後不再撤銷其他候選。\n'+picked.map(r=>r.name+' '+r.date+' '+r.type+' '+r.period).join('\n')+'\n原申報與撤銷紀錄會保留；不刪除打卡。'))return;
  lock(true);let done=0,skipped=0;try{for(const original of picked){if(!ctx.canRevoke()||identity()!==account)throw Error('登入或撤銷權限已變更');message('正在重新核對 '+original.name+' '+original.date+'…');await load();const current=data.rows.find(r=>r.id===original.id&&r.empId===original.empId&&r.date===original.date&&!r.revocation);if(!current||status(current)!=='review'){skipped++;continue;}if(current.linked)throw Error('仍有請假代班連結，未撤銷');if(JSON.stringify(current.report)!==JSON.stringify(original.report))throw Error('原申報內容已變更，請重新核對');const receipt=await ctx.revoke(current,loaded);if(receipt?.revocationVerified!==true||receipt.revocation?.reportId!==current.id)throw Error('撤銷回條未確認');done++;await load();if(!data.rows.some(r=>r.id===current.id&&r.empId===current.empId&&status(r)==='revoked'))throw Error('撤銷已確認，但畫面讀回未完成，請重新讀取核對');}
   message('已撤銷 '+done+' 筆；已解除超額或無須處理 '+skipped+' 筆。勾選已取消，可篩選「已撤銷」查看紀錄。');ctx.refresh();
  }catch(e){selected.clear();data=loaded=null;message('已確認撤銷 '+done+' 筆；其餘未確認：'+e.message+'。請重新讀取核對，勿連續重送。');}finally{lock(false);}
 };
 options();
 if(preferredEmployee){
  const person=staff.find(e=>e.empId===preferredEmployee);
  if(person){
   q('#osDept').value=person.dept;options();
   q('#osJob').value=person.job;options();
   q('#osEmployee').value=person.empId;
  }
 }
 paint();q('#osLoad').click();
}
g.P79OvertimeStatus={labels,status,filter,sortEmployeesByStroke,employeeFilterOptions,collect,accountingCsv,auditSummary,updateBanner,open,fetch:directFetch};
})(window);
