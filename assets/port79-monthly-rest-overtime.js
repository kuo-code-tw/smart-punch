(function(g){
'use strict';
const KEY='port79_monthly_rest_overtime_v1',cats=['國','休','例'],esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=x=>String(x||'').trim().toUpperCase(),today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
function balance(emp,roster,month){
 const quota=g.p79RestQuota(month),start=g.p79MonthlyRestContext.employmentStart(emp),end=Object.keys(roster).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&['離','離職'].includes(roster[d])).sort()[0]||'',dates=Array.from({length:quota.days},(_,i)=>month+'-'+String(i+1).padStart(2,'0')).filter(d=>(!start||d>=start)&&(!end||d<end));
 const counts={'例':0,'休':0,'國':0},off={...counts},reported={...counts};
 quota.slots.filter(s=>(!start||s.sourceDate>=start)&&(!end||s.sourceDate<end)).forEach(s=>counts[s.category]++);
 if(dates.some(d=>!roster[d]))throw Error(emp.name+' 本月班表未排完整，請先補齊');
 let unlabelled=0;
 for(const d of dates){const m=roster.__meta?.[d]||{},r=m.overtimeReport;
  if(r&&cats.includes(r.category)){reported[r.category]++;continue;}
  const rest=['例','國'].includes(roster[d])?roster[d]:roster[d]==='休'&&!m.restQuotaOvertime?m.restCategory:'';
  if(cats.includes(rest))off[rest]++;else if(roster[d]==='休'&&!m.restQuotaOvertime&&!r&&!m.overtime)unlabelled++;
 }
 for(const c of ['例','休','國']){const n=Math.min(unlabelled,Math.max(0,counts[c]-off[c]));off[c]+=n;unlabelled-=n;}
 const remaining=Object.fromEntries(cats.map(c=>[c,Math.max(0,counts[c]-off[c]-reported[c])]));
 return {quota:counts,off,reported,remaining,dates};
}
function ruleFor(date,roster,pair,category,rules){
 const allowed=rules.filter(r=>r[0]===category);
 if(pair){const found=g.P79Overtime.inferRule(pair.start,pair.end,date,allowed,category);return found||null;}
 const range={早:'08-16',中:'16-24',晚:'24-08'}[roster[date]];
 return allowed.find(r=>r[6]+'-'+r[7]===range)||null;
}
function plan(snapshot,people,month,rules){
 const rows=[],balances=[],issues=[];
 for(const emp of people){const roster=snapshot.schedules.find(r=>id(r.empId)===id(emp.empId))?.schedule;
  if(!roster){issues.push(emp.name+' 沒有本月班表');continue;}
  let b;try{b=balance(emp,roster,month)}catch(e){issues.push(e.message);continue;}
  balances.push({emp,...b});
  const candidates=b.dates.filter(d=>{
   const m=roster.__meta?.[d]||{};
   return ['早','中','晚'].includes(roster[d])&&!m.overtimeReport&&!m.overtime&&!m.forEmpId&&!m.coverAssignmentId&&!m.overtimeExcluded&&!(snapshot.leaveDates||[]).includes(id(emp.empId)+'|'+d);
  });
  // 未休補加班從每月15日開始，依週輪流取日期，避免集中月底最後一週。
  // 不把前半月當成自動補位；若後半月不足，列出未排項目供人工調整。
  const weeks=[[],[],[]];
  candidates.filter(d=>Number(d.slice(8))>=15).sort().forEach(d=>{
   const day=Number(d.slice(8));weeks[day<=21?0:day<=28?1:2].push(d);
  });
  const dates=[];
  while(weeks.some(group=>group.length)){
   for(const group of weeks)if(group.length)dates.push(group.shift());
  }
  const used=new Set();
  for(const category of cats)for(let n=0;n<b.remaining[category];n++){
   let item;
   for(const date of dates){if(used.has(date))continue;const pairs=snapshot.pairs.filter(p=>id(p.empId)===id(emp.empId)&&p.date===date);if(pairs.length>1)continue;
    const pair=pairs[0];if(!pair&&date<today())continue;
    const rule=ruleFor(date,roster,pair,category,rules);if(!rule)continue;
    item={id:crypto.randomUUID(),empId:emp.empId,name:emp.name,date,category,rule:rule.slice(),checked:false,status:pair?'可申報':'預排／待核對',planned:!pair};used.add(date);break;
   }
   if(item)rows.push(item);else issues.push(emp.name+'「'+category+'」尚有1天找不到可申報日期或相符時段');
  }
 }
 return {rows,balances,issues};
}
function styles(){if(document.getElementById('p79MonthlyRestStyle'))return;const el=document.createElement('style');el.id='p79MonthlyRestStyle';el.textContent=`#p79MonthlyRest{width:min(1080px,calc(100vw - 24px));max-height:90dvh;padding:0;border:0;border-radius:14px;color:#0f172a;background:#fff;box-shadow:0 20px 80px #0005;font:14px sans-serif}#p79MonthlyRest::backdrop{background:#0f172a88}#p79MonthlyRest header,#p79MonthlyRest footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;background:#f1f5f9}#p79MonthlyRest .body{padding:12px 16px;overflow:auto;max-height:calc(90dvh - 120px)}#p79MonthlyRest .filters{display:flex;gap:8px;flex-wrap:wrap;align-items:end}#p79MonthlyRest label{display:flex;flex-direction:column;gap:4px;font-size:12px}#p79MonthlyRest input,#p79MonthlyRest select{border:1px solid #cbd5e1;padding:6px;border-radius:7px;background:white;color:#0f172a;max-width:100%}#p79MonthlyRest button{padding:7px 12px;border:0;border-radius:8px;background:#e2e8f0;color:#0f172a;cursor:pointer}#p79MonthlyRest button.primary{background:#0369a1;color:white}#p79MonthlyRest button:disabled{opacity:.5;cursor:wait}#p79MonthlyRest table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:12px}#p79MonthlyRest th,#p79MonthlyRest td{padding:7px 5px;border-bottom:1px solid #e2e8f0;text-align:center}#p79MonthlyRest .scroll{overflow:auto;margin-top:10px}#p79MonthlyRest .國{background:#fef3c7;color:#92400e}#p79MonthlyRest .休{background:#dbeafe;color:#1e40af}#p79MonthlyRest .例{background:#fee2e2;color:#991b1b}#p79MonthlyRest .summary{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}#p79MonthlyRest .summary span{padding:7px;border-radius:8px}#p79MonthlyRest #mrStatus{white-space:pre-line;line-height:1.6;margin:10px 0;color:#475569}`;document.head.appendChild(el);}
async function open(){
 const a=g.p79MonthlyRestContext;if(!a?.canReport())return alert('沒有申報加班權限');
 if(document.getElementById('p79MonthlyRest'))return;styles();
 const el=document.createElement('dialog');el.id='p79MonthlyRest';
 el.innerHTML=`<header><b>每月未休假加班</b><button data-close>關閉</button></header><div class="body"><div class="filters"><label>月份<input id="mrMonth" type="month" value="${esc(a.month()||today().slice(0,7))}"></label><label>部門<select id="mrDept"></select></label><label>職稱<select id="mrJob"></select></label><label>人員<select id="mrEmp"></select></label><button class="primary" id="mrLoad">讀取未休／建議日期</button></div><p style="font-size:12px;color:#64748b">先扣例、休、國已休天數；未休申報依國、休、例安排。日期從15日起依週分散安排，不集中同一週；後半月不足時提示人工調整，已申報日期不重複帶入。</p><div id="mrStatus" role="status">選好月份與人員後，讀取班表及出勤紀錄。</div><div id="mrSummary" class="summary"></div><div class="scroll"><table><thead><tr><th><input id="mrAll" type="checkbox" aria-label="全選"></th><th>日期</th><th>姓名</th><th>假別</th><th>出勤時段</th><th>申報時數</th><th>狀態</th></tr></thead><tbody id="mrRows"></tbody></table></div></div><footer><button data-close>取消</button><button id="mrSave" class="primary" disabled>申報勾選項目</button></footer>`;
 document.body.appendChild(el);el.showModal();
 const q=s=>el.querySelector(s),setStatus=x=>q('#mrStatus').textContent=x;let busy=false,model=null,snapshot=null,rules=[],stop=false,loadedMonth='',loadedPeople=[];
 const people=a.employees().slice().sort((x,y)=>String(x.name).localeCompare(String(y.name),'zh-Hant-u-co-stroke'));
 function options(values,all){return '<option value="">'+all+'</option>'+values.map(v=>'<option>'+esc(v)+'</option>').join('');}
 const job=e=>e.jobTitle||e.deptDetail||'未設定';q('#mrDept').innerHTML=options([...new Set(people.map(e=>e.dept||'一般'))],'全部部門');
 function filter(){const dept=q('#mrDept').value;return people.filter(e=>!dept||(e.dept||'一般')===dept);}
 function jobs(){q('#mrJob').innerHTML=options([...new Set(filter().map(job))],'全部職稱');names();}
 function names(){q('#mrEmp').innerHTML='<option value="">全部人員</option>'+filter().filter(e=>!q('#mrJob').value||job(e)===q('#mrJob').value).map(e=>'<option value="'+esc(e.empId)+'">'+esc(e.name)+'</option>').join('');invalidate();}
 function invalidate(){model=null;q('#mrRows').innerHTML='';q('#mrSummary').innerHTML='';q('#mrSave').disabled=true;q('#mrAll').checked=false;}
 q('#mrDept').onchange=jobs;q('#mrJob').onchange=names;q('#mrEmp').onchange=invalidate;q('#mrMonth').onchange=invalidate;jobs();
 function controls(disabled){el.querySelectorAll('.filters input,.filters select,.filters button,#mrAll,#mrRows input,#mrRows select').forEach(e=>e.disabled=disabled);q('#mrSave').disabled=disabled||!model?.rows.some(r=>r.checked&&!r.saved);el.querySelectorAll('[data-close]').forEach(e=>{e.textContent=disabled?'完成目前這筆後停止':'關閉';});}
 el.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(busy){stop=true;setStatus('將在目前這筆完成後停止，已確認儲存的資料會保留。');}else el.close();});el.oncancel=e=>{if(busy){e.preventDefault();stop=true;}};el.onclose=()=>el.remove();
 function paint(){
  const total=c=>model.balances.reduce((n,b)=>n+b.remaining[c],0);
  q('#mrSummary').innerHTML=cats.map(c=>'<span class="'+c+'">'+c+'：應休 '+model.balances.reduce((n,b)=>n+b.quota[c],0)+'／已休 '+model.balances.reduce((n,b)=>n+b.off[c],0)+'／已申報 '+model.balances.reduce((n,b)=>n+b.reported[c],0)+'／待報 '+total(c)+' 天</span>').join('');
  q('#mrRows').innerHTML=model.rows.map((r,i)=>'<tr data-row="'+i+'"><td><input class="pick" type="checkbox" '+(r.checked?'checked':'')+' '+(r.saved?'disabled':'')+' aria-label="申報 '+esc(r.name)+' '+r.date+'"></td><td><input class="date" type="date" value="'+r.date+'" min="'+loadedMonth+'-01" max="'+loadedMonth+'-'+String(g.p79RestQuota(loadedMonth).days).padStart(2,'0')+'" '+(r.saved?'disabled':'')+'></td><td>'+esc(r.name)+'</td><td class="'+r.category+'"><select class="category" '+(r.saved?'disabled':'')+'>'+cats.filter(c=>rules.some(rule=>rule[0]===c)).map(c=>'<option '+(c===r.category?'selected':'')+'>'+c+'</option>').join('')+'</select></td><td><select class="rule" '+(r.saved?'disabled':'')+'>'+rules.map((rule,k)=>rule[0]===r.category?'<option value="'+k+'" '+(JSON.stringify(rule)===JSON.stringify(r.rule)?'selected':'')+'>'+esc(rule[1])+'</option>':'').join('')+'</select></td><td>'+esc(r.rule[2])+' 小時</td><td>'+esc(r.status)+'</td></tr>').join('');
  q('#mrSave').disabled=!model.rows.some(r=>r.checked&&!r.saved);
 }
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
   setStatus('已列出 '+model.rows.length+' 筆建議，請勾選要申報的日期。\n'+model.issues.join('\n'));
  }catch(e){setStatus('讀取失敗：'+e.message);}finally{busy=false;controls(false);}
 };
 q('#mrSave').onclick=async()=>{
  if(busy||!model)return;const selected=model.rows.filter(r=>r.checked&&!r.saved);if(!selected.length)return;
  const seen=new Set();for(const r of selected){const key=id(r.empId)+'|'+r.date;if(!r.date.startsWith(loadedMonth+'-')||seen.has(key)){setStatus('日期不符或同一人同日重複，請調整後再申報。');return;}seen.add(key);}
  busy=true;stop=false;controls(true);let count=0;
  try{
   setStatus('正在重新核對未休額度與已申報紀錄…');
   const fresh=await a.snapshot(loadedMonth,true),available=new Map(),usage=new Map();
   for(const emp of loadedPeople){const roster=fresh.schedules.find(x=>id(x.empId)===id(emp.empId))?.schedule;if(!roster)throw Error(emp.name+' 班表已變更，請重新讀取');available.set(id(emp.empId),balance(emp,roster,loadedMonth).remaining);}
   for(const r of selected){const roster=fresh.schedules.find(x=>id(x.empId)===id(r.empId))?.schedule,meta=roster?.__meta?.[r.date]||{};
    if(meta.overtimeReport?.id===r.id){r.saved=true;r.checked=false;r.status='已核對儲存成功';continue;}
    if(meta.overtimeReport||meta.overtime||meta.forEmpId||meta.coverAssignmentId||(fresh.leaveDates||[]).includes(id(r.empId)+'|'+r.date))throw Error(r.name+' '+r.date+' 已有加班、代班或請假，請重新讀取');
    if(!balance(loadedPeople.find(e=>id(e.empId)===id(r.empId)),roster,loadedMonth).dates.includes(r.date))throw Error(r.name+' 日期早於報到日，請重新選擇');
    const key=id(r.empId)+'|'+r.category,n=(usage.get(key)||0)+1;usage.set(key,n);if(n>(available.get(id(r.empId))?.[r.category]||0))throw Error(r.name+'「'+r.category+'」勾選超過目前未休額度，請減少勾選或重新讀取');
   }
   paint();controls(true);
   for(const r of selected){if(stop)break;if(r.saved)continue;setStatus('正在申報 '+(count+1)+'／'+selected.length+'：'+r.name+' '+r.date+' '+r.rule[1]);
    const draft={id:r.id,empId:r.empId,date:r.date,rule:g.P79Overtime.report(r.rule),forEmpId:'',note:'每月未休假加班 '+loadedMonth,preventReplace:true,createdAt:Date.now()};
    sessionStorage.setItem(KEY,JSON.stringify(draft));const result=await a.saveReport(draft);
    if(result?.ok!==true||result.directOvertimeSaved!==true||result.id!==draft.id)throw Error('雲端尚未確認此筆申報');
    r.saved=true;r.checked=false;r.status=result.report?.planned?'已儲存預排／待核對':'已申報';sessionStorage.removeItem(KEY);count++;paint();controls(true);
   }
   setStatus('已確認儲存 '+count+' 筆。'+(stop?'已停止，其餘項目未送出。':'可繼續核對其他項目，或重新讀取更新未休統計。'));
  }catch(e){setStatus('已確認儲存 '+count+' 筆；後續已停止：'+e.message+'。失敗項目仍保留，可核對後重試。');}
  finally{busy=false;controls(false);}
 };
}
g.P79MonthlyRest={open,plan,balance,ruleFor};
})(window);
