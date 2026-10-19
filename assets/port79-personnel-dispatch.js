(function(root){
'use strict';
const codes=['A','B','C','D'];
function groupCode(v){const m=String(v||'').trim().toUpperCase().match(/^([ABCD])(?:組)?$/);return m?m[1]:'';}
function buildMonth({month,records=[],roster=[],employees=null,metrics,normalize=v=>String(v||'').replace(/\s+/g,'')}){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return [];
 const employmentById=new Map(),employmentByName=new Map();
 const departed=p=>/^(resigned|terminated|retired|離職|已離職|退休)$/i.test(String(p?.employmentStatus||p?.['在職狀態']||'').trim());
 if(Array.isArray(employees))for(const e of employees){const id=String(e.empId||e.employeeId||e.id||'').trim().toUpperCase(),name=normalize(e.name||e.employeeName||'');if(id)employmentById.set(id,e);if(name){if(!employmentByName.has(name))employmentByName.set(name,[]);employmentByName.get(name).push(e);}}
 const allowed=r=>{if(!Array.isArray(employees))return !departed(r);const id=String(r.empId||r.employeeId||(r.source?'':r.id)||'').trim().toUpperCase(),matches=employmentByName.get(normalize(r.name||''))||[];const e=id&&!id.startsWith('NAME:')?employmentById.get(id):matches.length===1?matches[0]:null;return !!e&&!departed(e);};
 const persons=new Map(),names=new Map();
 const idOf=v=>{const id=String(v||'').trim().toUpperCase();return id&&!id.startsWith('NAME:')?id:'';};
 function add(key,name,empId,group='',confirmed=false){if(!persons.has(key))persons.set(key,{key,name,empId,group:groupCode(group),confirmed,count:0,containers:0,hours:0,hc:0,invalid:0,zeroRecords:0,zeroHours:0});return persons.get(key);}
 for(const r of roster){if(!allowed(r))continue;const id=idOf(r.empId||r.id),name=String(r.name||'').trim();if(!name)continue;const key=id?'EMP:'+id:'NAME:'+normalize(name);const p=add(key,name,id,r.group,true);if(p.group!==groupCode(r.group))p.confirmed=false;const nk=normalize(name);if(!names.has(nk))names.set(nk,new Set());names.get(nk).add(key);}
 for(const r of records){if(!allowed(r))continue;if(r.source!=='working-report'||String(r.workDate||'').slice(0,7)!==month)continue;
  const id=idOf(r.empId),name=String(r.name||'').trim()||'未命名',matches=names.get(normalize(name));
  const key=id?'EMP:'+id:matches?.size===1?[...matches][0]:'REPORT:'+normalize(name);
  const p=add(key,name,id),m=metrics(r)||{},disc=Number(m.disc),load=Number(m.load),hours=Number(m.hours),hc=Number(m.hc);
  p.count++;const quantityOk=Number.isFinite(disc)&&disc>=0&&Number.isFinite(load)&&load>=0;
  if(quantityOk&&disc+load===0&&Number.isFinite(hours)&&hours>0){p.zeroRecords++;p.zeroHours+=hours;continue;}
  if(quantityOk)p.containers+=disc+load;if(Number.isFinite(hours)&&hours>0)p.hours+=hours;if(Number.isFinite(hc)&&hc>=0)p.hc+=hc;
  if(!quantityOk||!Number.isFinite(hours)||hours<=0)p.invalid++;
 }
 return [...persons.values()].map(p=>({...p,eff:p.count&&p.hours>0&&!p.invalid?p.containers/p.hours:p.zeroRecords>0&&!p.invalid?0:null,eligible:p.confirmed&&!!p.group&&p.count>0&&p.hours>0&&p.containers>0&&!p.invalid})).sort((a,b)=>(b.eff??-1)-(a.eff??-1)||a.name.localeCompare(b.name,'zh-Hant-u-co-stroke')||a.key.localeCompare(b.key));
}
function summarize(persons,plan={}){
 const groups=Object.fromEntries(codes.map(g=>[g,{group:g,people:0,active:0,containers:0,hours:0,hc:0,invalid:0}]));let excluded=0;
 for(const p of persons){if(!p.confirmed||!groups[p.group]){excluded++;continue;}const target=p.eligible&&codes.includes(plan[p.key])?plan[p.key]:p.group,g=groups[target];g.people++;if(p.eff===0)continue;if(p.count)g.active++;g.containers+=p.containers;g.hours+=p.hours;g.hc+=p.hc;g.invalid+=p.invalid;}
 const rows=Object.values(groups).map(g=>({...g,eff:g.hours>0&&!g.invalid?g.containers/g.hours:null}));
 const valid=rows.filter(g=>g.eff!==null);return {groups:rows,excluded,gap:valid.length===4?Math.max(...valid.map(g=>g.eff))-Math.min(...valid.map(g=>g.eff)):null};
}
function movementPolicy(persons,{lockedGroups}={}){
 const baseline=summarize(persons),valid=baseline.groups.filter(g=>g.eff!==null).sort((a,b)=>b.eff-a.eff||a.group.localeCompare(b.group));
 const locked=new Set(Array.isArray(lockedGroups)?lockedGroups.filter(g=>codes.includes(g)):valid.length?valid.filter(g=>Math.abs(g.eff-valid[0].eff)<1e-9).map(g=>g.group):[]);
 return {locked,benchmark:valid[0]?.eff??null,movable:new Set(persons.filter(p=>p.eligible&&p.eff!==0&&!locked.has(p.group)).map(p=>p.key))};
}
function recommendSwap(persons,{minHours=10,minRecords=5,counts={},lockedGroups,allowNonImproving=false}={}){
 const before=summarize(persons),policy=movementPolicy(persons,{lockedGroups});
 if(before.gap===null)return {before,reason:'四組尚未都有有效作業時數，暫不提出調任建議。'};
 const selected=[],quotas={};
 for(const group of codes){if(policy.locked.has(group))continue;
  const n=counts[group]===undefined?2:Number(counts[group]);
  if(!Number.isInteger(n)||n<0||n>20)return {before,reason:'每組人數請設定為 0～20 的整數。'};
  const candidates=persons.filter(p=>p.group===group&&policy.movable.has(p.key)&&p.hours>=minHours&&p.count-(p.zeroRecords||0)>=minRecords).sort((a,b)=>a.containers/a.hours-b.containers/b.hours||b.hours-a.hours||a.key.localeCompare(b.key));
  if(candidates.length<n)return {before,reason:`${group}組設定取 ${n} 名，但符合至少 ${minRecords} 筆作業及 ${minHours} 小時的有效人員只有 ${candidates.length} 名；請降低人數或補齊資料。`};
  quotas[group]=n;selected.push(...candidates.slice(0,n));
 }
 if(!selected.length)return {before,reason:'沒有選取可調組別或人員，維持現況。'};
 const slots=Object.entries(quotas).flatMap(([g,n])=>Array(n).fill(g));
 if(Object.values(quotas).some(n=>n>selected.length-n))return {before,reason:'目前每組人數無法互調並維持各組人數；至少需兩個可調組，且任一組取出人數不可超過其餘組合計。'};
 const score=summary=>{const gs=summary.groups.filter(g=>!policy.locked.has(g.group)),totalHours=gs.reduce((s,g)=>s+g.hours,0),mean=totalHours?gs.reduce((s,g)=>s+g.containers,0)/totalHours:0;return gs.reduce((s,g)=>s+(g.eff-mean)**2,0);};
 let best=null,fallback=null;
 for(let seed=0;seed<8;seed++){
  const order=selected.map((_,i)=>(i+seed)%selected.length),assignment=Array(slots.length).fill(-1);
  function match(index,seen){for(let k=0;k<slots.length;k++){const slot=(k+seed)%slots.length;if(seen.has(slot)||slots[slot]===selected[index].group)continue;seen.add(slot);if(assignment[slot]<0||match(assignment[slot],seen)){assignment[slot]=index;return true;}}return false;}
  if(!order.every(i=>match(i,new Set())))continue;
  const destinations=[];assignment.forEach((index,slot)=>{destinations[index]=slots[slot];});
  const makePlan=()=>Object.fromEntries(selected.map((p,i)=>[p.key,destinations[i]]));
  let plan=makePlan(),after=summarize(persons,plan),value=score(after);
  for(let step=0;step<Math.min(12,selected.length*2);step++){
   let change=null;
   for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){
    if(destinations[i]===destinations[j]||destinations[j]===selected[i].group||destinations[i]===selected[j].group)continue;
    const test={...plan,[selected[i].key]:destinations[j],[selected[j].key]:destinations[i]},result=summarize(persons,test),candidateScore=score(result);
    if(candidateScore<value-1e-9&&(!change||candidateScore<change.value))change={i,j,plan:test,after:result,value:candidateScore};
   }
   if(!change)break;[destinations[change.i],destinations[change.j]]=[destinations[change.j],destinations[change.i]];plan=change.plan;after=change.after;value=change.value;
  }
  const trial={before,after,plan,value,moves:selected.map(p=>({person:p,from:p.group,to:plan[p.key]})),locked:[...policy.locked],quotas};
  if(!fallback||value<fallback.value)fallback=trial;
  if(after.gap<=before.gap+1e-9&&(!best||value<best.value-1e-9))best={before,after,plan,value,moves:selected.map(p=>({person:p,from:p.group,to:plan[p.key]})),locked:[...policy.locked],quotas};
 }
 if(allowNonImproving&&fallback&&(!best||best.value>=score(before)-1e-9))return {...fallback,recommended:false,warning:'依指定人數可以排出互調名單，但沒有改善效率差距；此為試排結果，不建議直接採用。可確認帶入試算後再調整。'};
 if(!best)return {before,reason:'此設定無法安排完整互調，請調整每組人數。'};
 if(best.value>=score(before)-1e-9)return {before,reason:'固定保留組並依指定人數試算後，沒有改善可調組效率差距的方案；建議調整人數或維持現況。'};
 return best;
}
async function readDispatchSources(month,read){
 const sources=[
  {key:'live',label:'即時船舶作業',action:'gcGetData',params:{month},valid:d=>Array.isArray(d.records)||Array.isArray(d.shipMasters)},
  {key:'history',label:'歷史作業明細',action:'historyGetMonthData',params:{type:'vessel',month},valid:d=>Array.isArray(d.records)},
  {key:'people',label:'最新在職名冊',action:'gcGetEmployees',params:{},valid:d=>Array.isArray(d.employees)},
  {key:'schedule',label:'當月排班組別',action:'getScheduleDataSecure',params:{month},valid:d=>Array.isArray(d.employees)&&Array.isArray(d.schedules)}
 ];
 return Promise.all(sources.map(async source=>{try{const data=await read(source.action,source.params);if(data?.ok!==true||data.retryable||!source.valid(data))throw Error(data?.error||'回傳資料格式不完整');return {...source,ok:true,data};}catch(error){const raw=String(error?.message||error);return {...source,ok:false,error:error?.name==='AbortError'?'連線逾時':/failed to fetch|network/i.test(raw)?'網路連線失敗':raw.slice(0,160)};}}));
}
const api={buildMonth,summarize,groupCode,recommendSwap,movementPolicy,readDispatchSources};
if(typeof module==='object'&&module.exports){module.exports=api;return;}
root.P79PersonnelDispatch=api;
let plan={},owner='',planMonth='',latest=[],ready=false,settings={counts:{},lockedGroups:undefined};const reads=new Map(),readDetails=new Map(),inflight=new Map();let generating=false;
const el=id=>document.getElementById(id),fmt=v=>v===null?'—':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:2}),safe=v=>esc(String(v??''));
function month(){return el('dispatchMonth')?.value||'';}
function resetContext(){const token=String(gcToken||'');if(owner!==token||planMonth!==month()){plan={};latest=[];settings={counts:{},lockedGroups:undefined};if(el('dispatchConfirmState'))el('dispatchConfirmState').textContent='';owner=token;planMonth=month();}}
function sourceRows(){return canonicalOperationalRecords((records||[]).filter(r=>r.source==='working-report'&&String(r.workDate||'').slice(0,7)===month()));}
function render(){
 if(!el('dispatchBody'))return;
 const input=el('dispatchMonth'),year=getPort79Year();if(!input.value)input.value=isoTodayLocal().startsWith(year+'-')?isoTodayLocal().slice(0,7):year+'-01';resetContext();
 const rows=sourceRows(),store=currentOperationScheduleStore();ensureOperationScheduleGroups(rows.length?rows:[{workDate:month()+'-01'}]);
 const roster=store?.has(month())?store.personnel(month()):[];
 latest=buildMonth({month:month(),records:rows,roster,employees:Array.isArray(systemEmployees)?systemEmployees:[],metrics:workloadRecordMetrics,normalize:normalizePersonName});
 const state=reads.get(owner+'|'+month());ready=state==='ready'&&!!store?.has(month());
 el('dispatchLoadState').textContent=(state==='loading'?'正在讀取整月即時及歷史作業資料…':state==='ready'?'整月即時、歷史來源與最新在職名冊已讀取。':state==='partial'?'部分來源讀取失敗，資料或在職名冊暫不完整，請重新讀取。':state==='error'?'雲端讀取失敗，目前顯示本機資料，請重新讀取。':'尚未讀取整月資料。')+(store?.has(month())?'':' 排班名冊尚未確認。');
 renderOperationScheduleStatus(rows.length?rows:[{workDate:month()+'-01'}]);
 const total=latest.filter(p=>p.eff!==0).reduce((s,p)=>({containers:s.containers+p.containers,hours:s.hours+p.hours,invalid:s.invalid+p.invalid}),{containers:0,hours:0,invalid:0});
 el('dispatchSummary').textContent=`${month()}｜${latest.length} 人｜作業量 ${fmt(total.containers)} 櫃｜作業時數 ${fmt(total.hours)} 小時｜月均效率 ${fmt(total.hours>0&&!total.invalid?total.containers/total.hours:null)} 櫃／小時${total.invalid?'｜'+total.invalid+' 筆作業資料待核對':''}｜已排除 ${latest.reduce((n,p)=>n+(p.zeroRecords||0),0)} 筆零效率作業（時數不計入平均）`;
 const policy=movementPolicy(latest,settings);
 for(const key of Object.keys(plan))if(!policy.movable.has(key)||policy.locked.has(plan[key]))delete plan[key];
 const search=normalizePersonName(el('dispatchName').value),sort=el('dispatchSort').value;
 const shown=latest.filter(p=>!search||normalizePersonName(p.name).includes(search)).slice().sort((a,b)=>sort==='hours'?b.hours-a.hours:sort==='containers'?b.containers-a.containers:((b.eff??-1)-(a.eff??-1)));
 el('dispatchBody').innerHTML=shown.map(p=>`<tr><td class="font-bold">${safe(p.name)}</td><td>${safe(p.empId||'—')}</td><td>${safe(p.confirmed&&p.group?p.group+'組':'待核對')}</td><td>${fmt(p.containers)}</td><td>${fmt(p.hours)}</td><td class="font-bold text-teal-700">${fmt(p.eff)}</td><td>${fmt(p.hc)}</td><td>${p.count}</td><td>${safe(p.eff===0?'效率為 0，不列入計算':!p.count?'尚無作業資料':p.invalid?'櫃數或時數待核對':!p.confirmed||!p.group?'排班身分／組別待核對':policy.movable.has(p.key)?'可調組人員，可供試算':'保留組，整組不動')}</td><td><select aria-label="${safe(p.name)}的試算組別" data-dispatch-key="${safe(p.key)}" ${!ready||!policy.movable.has(p.key)?'disabled':''}><option value="">維持原組</option>${codes.map(g=>`<option value="${g}" ${policy.locked.has(g)?'disabled':''} ${plan[p.key]===g?'selected':''}>${g}組</option>`).join('')}</select></td></tr>`).join('')||'<tr><td colspan="10">此月份或搜尋條件尚無人員資料</td></tr>';
 renderSettings();renderRecommendation(rows);renderScenario();if(!state&&owner)void load(false);
}
function renderSettings(){
 const box=el('dispatchGroupSettings');if(!box)return;if(el('dispatchGenerateButton')){el('dispatchGenerateButton').disabled=generating;el('dispatchGenerateButton').textContent=generating?'正在讀取並產生名單…':'產生調任名單';}
 const policy=movementPolicy(latest,settings),groups=summarize(latest).groups;
 box.innerHTML=groups.map(g=>`<div class="rounded-xl border border-slate-200 p-3"><div class="font-bold">${g.group}組｜${fmt(g.eff)} 櫃／小時</div><label class="flex items-center gap-2 mt-2"><input type="checkbox" data-dispatch-lock="${g.group}" ${policy.locked.has(g.group)?'checked':''} ${!ready?'disabled':''}>保留本組（勾選＝不調動）</label><label class="flex items-center gap-2 mt-2">取出人數 <input type="number" min="0" max="20" step="1" style="width:80px" aria-label="${g.group}組取出人數" data-dispatch-count="${g.group}" value="${settings.counts[g.group]??2}" ${!ready||policy.locked.has(g.group)?'disabled':''}></label></div>`).join('');
}
function renderRecommendation(rows){
 const box=el('dispatchRecommendation');if(!box)return;
 const dates=[...new Set(rows.map(r=>String(r.workDate||'').slice(0,10)).filter(Boolean))].sort();
 const coverage=dates.length?`資料範圍 ${dates[0]} ～ ${dates[dates.length-1]}，共 ${dates.length} 個有作業紀錄的日期。`:'';
 if(!ready){const details=readDetails.get(owner+'|'+month())||[],failed=details.filter(item=>!item.ok);box.innerHTML=`<p>${reads.get(owner+'|'+month())==='loading'?'正在確認雲端作業、在職名冊及排班組別，請稍候。':'資料尚未完成確認；可直接按「產生調任名單」重新讀取。'}</p>${failed.length?'<ul class="mt-2">'+failed.map(item=>`<li>${safe(item.label)}：${safe(item.error)}</li>`).join('')+'</ul>':''}`;return;}
 const suggestion=recommendSwap(latest,{...settings,allowNonImproving:true}),policy=movementPolicy(latest,settings);
 const rule=`整組保留：${[...policy.locked].map(g=>g+'組').join('、')||'未設定'}。每個可調組依設定人數取效率較低的有效人員，其他人員維持原組。`;
 if(!suggestion.plan){
  const candidates=latest.filter(p=>policy.movable.has(p.key)&&p.hours>=10&&p.count-(p.zeroRecords||0)>=5);
  const selected=codes.flatMap(group=>candidates.filter(p=>p.group===group).sort((a,b)=>a.eff-b.eff||b.hours-a.hours||a.key.localeCompare(b.key)).slice(0,settings.counts[group]??2));
  box.innerHTML=`<p class="font-bold text-amber-800">${safe(suggestion.reason)}</p><p class="text-sm mt-2">${safe(rule)}</p><p class="text-sm mt-2">${safe(coverage)}</p><h4 class="font-bold mt-3">目前候選名單（尚未安排調入組）</h4><div class="overflow-auto"><table class="tbl w-full text-center"><thead><tr><th>姓名</th><th>原組</th><th>作業櫃數</th><th>時數</th><th>效率</th></tr></thead><tbody>${selected.map(p=>`<tr><td>${safe(p.name)}</td><td>${p.group}組</td><td>${fmt(p.containers)}</td><td>${fmt(p.hours)}</td><td>${fmt(p.eff)}</td></tr>`).join('')||'<tr><td colspan="5">沒有可調人員；請確認是否將所有組都勾成保留。</td></tr>'}</tbody></table></div><button type="button" class="btn bg-slate-100 mt-3" disabled>確認帶入試算（尚無可用方案）</button>`;return;
 }
 box.innerHTML=`${suggestion.warning?`<p class="font-bold text-amber-800">${safe(suggestion.warning)}</p>`:''}<p class="font-bold text-teal-800">${suggestion.recommended===false?'試排名單':'建議'} ${suggestion.moves.map(m=>`${safe(m.person.name)}：${m.from}組 → ${m.to}組`).join('；')}。其餘人員維持原組。</p>
 <p class="text-sm mt-2">${safe(rule)}依作業量與時數試算，各組人數不變；四組效率差距由 <strong>${fmt(suggestion.before.gap)}</strong> 變為 <strong>${fmt(suggestion.after.gap)}</strong> 櫃／小時。</p>
 <div class="overflow-auto mt-3"><table class="tbl w-full text-center"><thead><tr><th>人員</th><th>原組 → 建議組</th><th>作業櫃數</th><th>作業時數</th><th>個人月均效率</th></tr></thead><tbody>${suggestion.moves.map(m=>`<tr><td>${safe(m.person.name)}</td><td>${m.from}組 → ${m.to}組</td><td>${fmt(m.person.containers)}</td><td>${fmt(m.person.hours)}</td><td>${fmt(m.person.eff)}</td></tr>`).join('')}</tbody></table></div>
 <p class="text-sm mt-2">${safe(coverage)}依已匯入資料提出暫定建議，不代表整月資料齊全。只比較可調組中 AQC 同職稱、名冊確認且至少 5 筆作業／10 小時的人員。依設定人數取各組較低效率人員，再搜尋改善可調組效率差距的多人互調方案；保留組不調入、不調出，各組人數不變。此為試算建議，未保證全域最佳。</p>
 <button type="button" class="btn bg-teal-700 text-white mt-3" onclick="P79PersonnelDispatch.useRecommendation()">確認名單並帶入試算</button>`;
}
function renderScenario(){
 const policy=movementPolicy(latest,settings),allowedPlan=Object.fromEntries(Object.entries(plan).filter(([key,target])=>policy.movable.has(key)&&!policy.locked.has(target)));
 const before=summarize(latest),after=summarize(latest,ready?allowedPlan:{}),moves=latest.filter(p=>policy.movable.has(p.key)&&allowedPlan[p.key]&&allowedPlan[p.key]!==p.group);
 el('dispatchGroupBody').innerHTML=before.groups.map((g,i)=>{const next=after.groups[i];return `<tr><td class="font-bold">${g.group}組</td><td>${g.people} → ${next.people}</td><td>${fmt(g.containers)} → ${fmt(next.containers)}</td><td>${fmt(g.hours)} → ${fmt(next.hours)}</td><td>${fmt(g.eff)} → ${fmt(next.eff)}</td></tr>`;}).join('');
 el('dispatchScenarioState').textContent=!ready?'完成整月資料與排班名冊讀取後，才可選擇調動人員試算。':`已選 ${moves.length} 人｜四組效率差距 ${fmt(before.gap)} → ${fmt(after.gap)} 櫃／小時。${before.excluded?'另有 '+before.excluded+' 人因身分或組別未確認，未納入各組比較。':''}`;
 el('dispatchMoves').textContent=ready&&moves.length?moves.map(p=>`${p.name}：${p.group}組 → ${plan[p.key]}組（${fmt(p.containers)} 櫃／${fmt(p.hours)} 小時）`).join('；'):'尚未選擇調動人員。';
}
async function load(force=true){
 if(!requireEfficiencyAccess())return false;resetContext();const requested=month(),token=String(gcToken||''),key=token+'|'+requested;
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(requested))return false;
 if(inflight.has(key))return inflight.get(key);if(!force&&reads.has(key))return reads.get(key)==='ready';
 reads.set(key,'loading');readDetails.delete(key);
 const task=Promise.resolve().then(async()=>{
  const results=await readDispatchSources(requested,async(action,params)=>{try{return await apiGetQuick(action,params,25000);}catch(error){if(!/忙碌|稍後|逾時|timeout|abort|network|fetch|HTTP 5/i.test(String(error?.message||error)))throw error;await new Promise(resolve=>setTimeout(resolve,700));if(token!==String(gcToken||''))throw Error('登入已變更');return apiGetQuick(action,params,25000);}});
  if(token!==String(gcToken||''))return false;
  for(const item of results){if(!item.ok)continue;try{
   if(item.key==='live'||item.key==='history')mergeEfficiencyCloudData(item.data);
   else if(item.key==='people')systemEmployees=item.data.employees.map(normalizeCloudEmployee).filter(Boolean);
   else {currentOperationScheduleStore().apply(requested,item.data);operationScheduleReads.set(requested,{at:Date.now(),status:'ready'});}
  }catch(error){item.ok=false;item.error=String(error?.message||'資料套用失敗');}}
  const success=results.filter(item=>item.ok).length;readDetails.set(key,results);reads.set(key,success===4?'ready':success?'partial':'error');if(success){saveLocal();invalidateWorkloadIndex();}
  if(activeEfficiencyTabName()==='dispatch')render();return success===4;
 }).catch(error=>{reads.set(key,'error');readDetails.set(key,[{label:'資料讀取',ok:false,error:String(error?.message||error)}]);if(activeEfficiencyTabName()==='dispatch')render();return false;}).finally(()=>inflight.delete(key));
 inflight.set(key,task);render();return task;
}
api.generateRecommendation=async()=>{
 if(generating)return;generating=true;render();
 try{if(!ready)await load(true);render();el('dispatchRecommendation')?.scrollIntoView({behavior:'smooth',block:'nearest'});}
 finally{generating=false;renderSettings();}
};
api.useRecommendation=()=>{if(!ready)return;const suggestion=recommendSwap(latest,{...settings,allowNonImproving:true});if(suggestion.plan){plan={...suggestion.plan};render();el('dispatchConfirmState').textContent=`已確認 ${suggestion.moves.length} 人，已帶入下方試算；尚未修改正式排班。`;el('dispatchGroupBody')?.scrollIntoView({behavior:'smooth',block:'nearest'});}};
api.render=render;api.load=load;api.rows=sourceRows;api.clear=()=>{plan={};if(el('dispatchConfirmState'))el('dispatchConfirmState').textContent='已清除試算，正式排班未變更。';render();};
document.addEventListener('change',event=>{
 const group=event.target?.dataset?.dispatchLock,countGroup=event.target?.dataset?.dispatchCount;
 if(group&&ready){const locked=movementPolicy(latest,settings).locked;event.target.checked?locked.add(group):locked.delete(group);settings.lockedGroups=[...locked];plan={};if(el('dispatchConfirmState'))el('dispatchConfirmState').textContent='設定已變更，請重新確認名單。';render();return;}
 if(countGroup&&ready){const n=Number(event.target.value);if(!Number.isInteger(n)||n<0||n>20){event.target.value=settings.counts[countGroup]??2;return;}settings.counts[countGroup]=n;plan={};if(el('dispatchConfirmState'))el('dispatchConfirmState').textContent='人數已變更，請重新確認名單。';render();return;}
 const key=event.target?.dataset?.dispatchKey;if(!key)return;const p=latest.find(p=>p.key===key),target=event.target.value;if(!ready||!p?.eligible||!movementPolicy(latest,settings).movable.has(key)||movementPolicy(latest,settings).locked.has(target)||target&&!codes.includes(target))return;if(target&&target!==p.group)plan[key]=target;else delete plan[key];renderScenario();});
})(typeof window!=='undefined'?window:globalThis);
