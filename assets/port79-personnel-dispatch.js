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
function optimizeGroups(persons,{selectedKeys=null,lockedGroups=[]}={}){
 const before=summarize(persons),locked=new Set((Array.isArray(lockedGroups)?lockedGroups:[]).filter(g=>codes.includes(g)));
 if(before.gap===null)return {before,reason:'四組須都有有效作業時數，才能比較最佳化結果。請先核對資料。'};
 const available=persons.filter(p=>p.confirmed&&codes.includes(p.group)&&p.eligible&&p.eff>0&&!locked.has(p.group));
 const selectedSet=selectedKeys===null?null:new Set(selectedKeys instanceof Set?[...selectedKeys]:Array.isArray(selectedKeys)?selectedKeys:[]);
 const selected=available.filter(p=>selectedSet===null||selectedSet.has(p.key));
 if(selected.length<2||new Set(selected.map(p=>p.group)).size<2)return {before,reason:'請從至少兩個未保留的組別勾選可調人員（每組至少一人）。',selectedCount:selected.length};
 const groups=before.groups.map(g=>g.group),counts=Object.fromEntries(groups.map(g=>[g,0]));
 selected.forEach(p=>counts[p.group]++);
 const movableGroups=groups.filter(g=>counts[g]>0);
 const baseC=before.groups.map(g=>g.containers),baseH=before.groups.map(g=>g.hours);
 const positions=Object.fromEntries(groups.map((g,i)=>[g,i]));
 selected.forEach(p=>{const i=positions[p.group];baseC[i]-=p.containers;baseH[i]-=p.hours;});
 const initial=selected.map(p=>p.group),caps=counts;
 function objective(assignment){
  const cs=baseC.slice(),hs=baseH.slice();let moves=0;
  for(let i=0;i<selected.length;i++){const g=assignment[i],slot=positions[g];cs[slot]+=selected[i].containers;hs[slot]+=selected[i].hours;if(g!==selected[i].group)moves++;}
  const rates=cs.map((v,i)=>hs[i]>0?v/hs[i]:NaN);
  if(rates.some(v=>!Number.isFinite(v)))return {gap:Infinity,variance:Infinity,moves};
  const gap=Math.max(...rates)-Math.min(...rates),avg=rates.reduce((a,b)=>a+b,0)/rates.length;
  return {gap,variance:rates.reduce((a,b)=>a+(b-avg)*(b-avg),0),moves};
 }
 function better(a,b){
  if(!b)return true;
  if(a.gap<b.gap-1e-8)return true;if(a.gap>b.gap+1e-8)return false;
  if(a.variance<b.variance-1e-8)return true;if(a.variance>b.variance+1e-8)return false;
  return a.moves<b.moves;
 }
 let best=initial.slice(),bestScore=objective(best);
 const exact=selected.length<=9;
 if(exact){
  const remaining={...caps},candidate=Array(selected.length);
  function explore(i){
   if(i===selected.length){const val=objective(candidate);if(better(val,bestScore)){bestScore=val;best=candidate.slice();}return;}
   for(const g of movableGroups){if(!remaining[g])continue;remaining[g]--;candidate[i]=g;explore(i+1);remaining[g]++;}
  }
  explore(0);
 }else{
  // 大量人員使用多起點、可重現的兩人交換搜尋；不宣稱全域最佳。
  const n=selected.length,restarts=n>100?4:9;
  let random=20261111+selected.reduce((a,p)=>a+p.key.length,0);
  function rnd(){random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;}
  for(let seed=0;seed<restarts;seed++){
   const assignment=initial.slice();
   if(seed){const steps=Math.min(n*2,seed*4);for(let k=0;k<steps;k++){const i=Math.floor(rnd()*n),j=Math.floor(rnd()*n);if(assignment[i]!==assignment[j]){const tmp=assignment[i];assignment[i]=assignment[j];assignment[j]=tmp;}}}
   let current=objective(assignment);
   for(let step=0;step<Math.min(70,n*2);step++){
    let swap=null,improved=current;
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
     if(assignment[i]===assignment[j])continue;
     const a=assignment[i],b=assignment[j];assignment[i]=b;assignment[j]=a;
     const val=objective(assignment);
     assignment[i]=a;assignment[j]=b;
     if(better(val,improved)){improved=val;swap=[i,j];}
    }
    if(!swap)break;
    const [i,j]=swap,tmp=assignment[i];assignment[i]=assignment[j];assignment[j]=tmp;current=improved;
   }
   if(better(current,bestScore)){bestScore=current;best=assignment.slice();}
  }
 }
 const plan={};selected.forEach((p,i)=>{if(best[i]!==p.group)plan[p.key]=best[i];});
 const after=summarize(persons,plan),moves=selected.filter(p=>plan[p.key]).map(p=>({person:p,from:p.group,to:plan[p.key]}));
 const baselineScore=objective(initial);
 if(!moves.length||!(bestScore.gap<baselineScore.gap-1e-8||Math.abs(bestScore.gap-baselineScore.gap)<=1e-8&&bestScore.variance<baselineScore.variance-1e-8))
  return {before,after:before,reason:'已完成比較：在目前選取人員與保留組的限制下，未找到能改善四組效率差距的調動，建議維持現有編組。',selectedCount:selected.length,optimal:exact};
 return {before,after,plan,moves,locked:[...locked],selectedCount:selected.length,optimal:exact,goal:'minimize-group-efficiency-gap'};
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
const api={buildMonth,summarize,groupCode,recommendSwap,movementPolicy,optimizeGroups,readDispatchSources};
if(typeof module==='object'&&module.exports){module.exports=api;return;}
root.P79PersonnelDispatch=api;
let plan={},owner='',planMonth='',latest=[],ready=false,settings={counts:{},lockedGroups:[]},selectedKeys=null;const reads=new Map(),readDetails=new Map(),inflight=new Map();let generating=false;
const el=id=>document.getElementById(id),fmt=v=>v===null?'—':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:2}),safe=v=>esc(String(v??''));
function month(){return el('dispatchMonth')?.value||'';}
function resetContext(){const token=String(gcToken||'');if(owner!==token||planMonth!==month()){plan={};latest=[];settings={counts:{},lockedGroups:[]};selectedKeys=null;if(el('dispatchConfirmState'))el('dispatchConfirmState').textContent='';owner=token;planMonth=month();}}
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
 // 版面專用統計；只呈現既有資料，不變更計算或調任規則。
 const kpiValues={
  dispatchKpiPeople:String(latest.length),
  dispatchKpiContainers:fmt(total.containers),
  dispatchKpiHours:fmt(total.hours),
  dispatchKpiEff:fmt(total.hours>0&&!total.invalid?total.containers/total.hours:null),
  dispatchKpiIssues:fmt(latest.reduce((sum,p)=>sum+(p.invalid||0),0))
 };
 Object.entries(kpiValues).forEach(([id,value])=>{const target=el(id);if(target)target.textContent=value;});
 const readyPill=el('dispatchReadyPill');
 if(readyPill){if(readyPill.dataset)readyPill.dataset.ready=ready?'true':'false';readyPill.textContent=ready?'資料已確認':state==='loading'?'整月讀取中':state==='partial'?'部分資料未完成':state==='error'?'資料讀取失敗':'資料待確認';}

 const policy=movementPolicy(latest,settings);
 for(const key of Object.keys(plan))if(!policy.movable.has(key)||policy.locked.has(plan[key]))delete plan[key];
 const search=normalizePersonName(el('dispatchName').value),sort=el('dispatchSort').value;
 const shown=latest.filter(p=>!search||normalizePersonName(p.name).includes(search)).slice().sort((a,b)=>sort==='hours'?b.hours-a.hours:sort==='containers'?b.containers-a.containers:((b.eff??-1)-(a.eff??-1)));
 el('dispatchBody').innerHTML=shown.map(p=>`<tr><td class="font-bold">${safe(p.name)}</td><td>${safe(p.empId||'—')}</td><td>${safe(p.confirmed&&p.group?p.group+'組':'待核對')}</td><td>${fmt(p.containers)}</td><td>${fmt(p.hours)}</td><td class="font-bold text-teal-700">${fmt(p.eff)}</td><td>${fmt(p.hc)}</td><td>${p.count}</td><td>${safe(p.eff===0?'效率為 0，不列入計算':!p.count?'尚無作業資料':p.invalid?'櫃數或時數待核對':!p.confirmed||!p.group?'排班身分／組別待核對':policy.movable.has(p.key)?'可調組人員，可供試算':'保留組，整組不動')}</td><td><select aria-label="${safe(p.name)}的試算組別" data-dispatch-key="${safe(p.key)}" ${!ready||!policy.movable.has(p.key)?'disabled':''}><option value="">維持原組</option>${codes.map(g=>`<option value="${g}" ${policy.locked.has(g)?'disabled':''} ${plan[p.key]===g?'selected':''}>${g}組</option>`).join('')}</select></td></tr>`).join('')||'<tr><td colspan="10">此月份或搜尋條件尚無人員資料</td></tr>';
 renderSettings();renderRoster();renderRecommendation(rows);renderScenario();if(!state&&owner)void load(false);
}
function chosenKeys(policy=movementPolicy(latest,settings)){
 return selectedKeys===null?new Set(policy.movable):new Set([...selectedKeys].filter(key=>policy.movable.has(key)));
}
function renderSettings(){
 const box=el('dispatchGroupSettings');if(!box)return;
 const button=el('dispatchGenerateButton');
 if(button){button.disabled=generating;button.textContent=generating?'正在計算最佳化編組…':'計算效率最佳化編組';}
 const policy=movementPolicy(latest,settings),groups=summarize(latest).groups,chosen=chosenKeys(policy);
 box.innerHTML=groups.map(g=>{
  const people=latest.filter(p=>p.group===g.group&&p.confirmed),eligible=people.filter(p=>policy.movable.has(p.key)),selected=eligible.filter(p=>chosen.has(p.key));
  return `<div class="rounded-xl border border-slate-200 p-3">
   <div class="font-bold">${g.group}組｜${fmt(g.eff)} 櫃／小時</div>
   <p class="p79d-group-stat">名冊 ${people.length} 人　可參與 ${eligible.length} 人<br>已勾選 ${selected.length} 人</p>
   <label class="flex items-center gap-2 mt-2"><input type="checkbox" data-dispatch-lock="${g.group}" ${policy.locked.has(g.group)?'checked':''} ${!ready?'disabled':''}>保留本組（不調入、不調出）</label>
  </div>`;
 }).join('');
}
function renderRoster(){
 const box=el('dispatchGroupRoster');if(!box)return;
 const policy=movementPolicy(latest,settings),chosen=chosenKeys(policy);
 box.innerHTML=codes.map(group=>{
  const people=latest.filter(p=>p.confirmed&&p.group===group).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant-u-co-stroke'));
  const checked=people.filter(p=>chosen.has(p.key)).length;
  const available=people.filter(p=>policy.movable.has(p.key)).length;
  return `<section class="p79d-roster-group" aria-label="${group}組完整名冊">
   <header class="p79d-roster-head"><strong>${group} 組｜共 ${people.length} 人</strong><span>可選 ${available} · 已選 ${checked}</span></header>
   <div class="p79d-roster-actions">
    <button type="button" data-dispatch-select-all="${group}" ${!ready||!available?'disabled':''}>勾選本組全部可用人員</button>
    <button type="button" data-dispatch-select-none="${group}" ${!ready?'disabled':''}>清除本組</button>
   </div>
   <div class="p79d-roster-list">${people.map(p=>{
    const movable=policy.movable.has(p.key),status=!p.confirmed?'組別待核對':policy.locked.has(group)?'保留組':p.invalid?'作業資料異常':p.eff===0?'零效率不列入':!p.count?'尚無作業紀錄':!p.eligible?'有效時數不足':'可參與';
    return `<label class="p79d-roster-person ${movable?'':'p79d-roster-unavailable'}" title="${safe(status)}">
       <input type="checkbox" data-dispatch-select="${safe(p.key)}" ${chosen.has(p.key)?'checked':''} ${!ready||!movable?'disabled':''}>
       <span class="p79d-roster-name">${safe(p.name)}<small>${safe(p.empId||'無工號')}</small></span>
       <span class="p79d-roster-eff">${p.eff===null?'—':fmt(p.eff)} <small>${movable?'櫃／時':status}</small></span>
      </label>`;
   }).join('')||'<p class="p79d-roster-empty">此組目前沒有可確認的在職 AQC 人員。</p>'}</div>
  </section>`;
 }).join('');
 const pending=latest.filter(p=>!p.confirmed||!codes.includes(p.group));
 const boxPending=el('dispatchUnassigned');
 if(boxPending){boxPending.innerHTML=pending.length?`<details class="p79d-pending"><summary>另有 ${pending.length} 名人員的排班組別／身分待核對（未歸入四組）</summary><div>${pending.map(p=>`${safe(p.name)}（${safe(p.empId||'無工號')}）`).join('、')}</div></details>`:'';}
 const count=el('dispatchRosterSelection');
 if(count)count.textContent=`A～D 組共 ${latest.filter(p=>p.confirmed&&codes.includes(p.group)).length} 人，已選 ${chosen.size} 名可參與效率最佳化。未勾選的人維持原組。`;
}
function renderRecommendation(rows){
 const box=el('dispatchRecommendation');if(!box)return;
 const dates=[...new Set(rows.map(r=>String(r.workDate||'').slice(0,10)).filter(Boolean))].sort();
 const coverage=dates.length?`作業資料範圍：${dates[0]} ～ ${dates[dates.length-1]}，共 ${dates.length} 個有紀錄的日期。`:'目前沒有有效作業日期。';
 if(!ready){
  const details=readDetails.get(owner+'|'+month())||[],failed=details.filter(item=>!item.ok);
  box.innerHTML=`<p>${reads.get(owner+'|'+month())==='loading'?'正在讀取作業、在職名冊與排班組別。':'來源尚未完整核對；請重新讀取後再最佳化。'}</p>${failed.length?'<ul class="mt-2">'+failed.map(item=>`<li>${safe(item.label)}：${safe(item.error)}</li>`).join('')+'</ul>':''}`;
  return;
 }
 const selected=chosenKeys();
 const suggestion=optimizeGroups(latest,{selectedKeys:selected,lockedGroups:settings.lockedGroups});
 const policy=movementPolicy(latest,settings);
 const rule=`已勾選 ${selected.size} 人，保留組：${[...policy.locked].map(g=>g+'組').join('、')||'無'}；未選的人不調動，所有組別人數維持不變。`;
 if(!suggestion.plan){
  box.innerHTML=`<p class="font-bold text-amber-800">${safe(suggestion.reason)}</p><p class="text-sm mt-2">${safe(rule)}</p><p class="text-sm mt-2">${safe(coverage)}</p>`;
  return;
 }
 box.innerHTML=`<p class="font-bold text-teal-800">建議調動 ${suggestion.moves.length} 人｜原效率差距 ${fmt(suggestion.before.gap)} → ${fmt(suggestion.after.gap)} 櫃／小時</p>
  <p class="text-sm mt-2">${safe(rule)}${suggestion.optimal?'本次選取人數適用完整排列搜尋，已找到此限制下的最佳編組。':'本次選取人數較多，已以多次搜尋找出較佳方案，並非保證全域最佳。'}</p>
  <div class="overflow-auto mt-3"><table class="tbl w-full text-center"><thead><tr><th>姓名</th><th>原組 → 建議組</th><th>有效櫃數</th><th>有效時數</th><th>月均效率</th></tr></thead>
   <tbody>${suggestion.moves.map(m=>`<tr><td>${safe(m.person.name)}</td><td>${m.from}組 → ${m.to}組</td><td>${fmt(m.person.containers)}</td><td>${fmt(m.person.hours)}</td><td>${fmt(m.person.eff)}</td></tr>`).join('')}</tbody></table></div>
  <p class="text-sm mt-2">${safe(coverage)}歷史資料用於比較組別均衡程度，無法保證未來實際產能；H/C 不併入櫃數。</p>
  <button type="button" class="btn bg-teal-700 text-white mt-3" onclick="P79PersonnelDispatch.useRecommendation()">確認名單並帶入試算</button>`;
}

function renderScenario(){
 const policy=movementPolicy(latest,settings),allowedPlan=Object.fromEntries(Object.entries(plan).filter(([key,target])=>policy.movable.has(key)&&!policy.locked.has(target)));
 const before=summarize(latest),after=summarize(latest,ready?allowedPlan:{}),moves=latest.filter(p=>policy.movable.has(p.key)&&allowedPlan[p.key]&&allowedPlan[p.key]!==p.group);
 const chart=el('dispatchGroupVisual');
 if(chart){
  const max=Math.max(1,...before.groups.flatMap((g,i)=>[g.eff||0,after.groups[i].eff||0]));
  const percent=value=>Math.max(0,Math.min(100,Math.round((value||0)/max*100)));
  chart.innerHTML=before.groups.map((g,i)=>{
   const next=after.groups[i];
   return `<div class="p79d-bar-card" data-group="${g.group}">
      <div class="p79d-bar-head"><span>${g.group} 組</span><strong>${fmt(g.eff)} → ${fmt(next.eff)}</strong></div>
      <div class="p79d-bar-rail" title="原始效率"><div class="p79d-bar-fill" style="width:${percent(g.eff)}%;opacity:.38"></div></div>
      <div class="p79d-bar-rail" style="margin-top:5px" title="試算效率"><div class="p79d-bar-fill" style="width:${percent(next.eff)}%"></div></div>
      <div class="p79d-bar-foot">上：原始　下：試算｜櫃／小時</div>
    </div>`;
  }).join('');
 }

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
api.useRecommendation=()=>{if(!ready)return;const suggestion=optimizeGroups(latest,{selectedKeys:chosenKeys(),lockedGroups:settings.lockedGroups});if(suggestion.plan){plan={...suggestion.plan};render();el('dispatchConfirmState').textContent=`已確認 ${suggestion.moves.length} 人，已帶入下方試算；尚未修改正式排班。`;el('dispatchGroupBody')?.scrollIntoView({behavior:'smooth',block:'nearest'});}};
api.render=render;api.load=load;api.rows=sourceRows;api.clear=()=>{plan={};if(el('dispatchConfirmState'))el('dispatchConfirmState').textContent='已清除試算，正式排班未變更。';render();};
document.addEventListener('change',event=>{
 const group=event.target?.dataset?.dispatchLock,countGroup=event.target?.dataset?.dispatchCount;
 if(group&&ready){const locked=new Set(settings.lockedGroups||[]);event.target.checked?locked.add(group):locked.delete(group);settings.lockedGroups=[...locked];plan={};if(el('dispatchConfirmState'))el('dispatchConfirmState').textContent='設定已變更，請重新確認名單。';render();return;}
 if(countGroup&&ready){const n=Number(event.target.value);if(!Number.isInteger(n)||n<0||n>20){event.target.value=settings.counts[countGroup]??2;return;}settings.counts[countGroup]=n;plan={};if(el('dispatchConfirmState'))el('dispatchConfirmState').textContent='人數已變更，請重新確認名單。';render();return;}
 const selectedKey=event.target?.dataset?.dispatchSelect;
 if(selectedKey){
  if(!ready)return;
  const policy=movementPolicy(latest,settings);
  if(!policy.movable.has(selectedKey))return;
  selectedKeys=chosenKeys(policy);
  if(event.target.checked)selectedKeys.add(selectedKey);else selectedKeys.delete(selectedKey);
  plan={};render();return;
 }
 const key=event.target?.dataset?.dispatchKey;if(!key)return;const p=latest.find(p=>p.key===key),target=event.target.value;if(!ready||!p?.eligible||!movementPolicy(latest,settings).movable.has(key)||movementPolicy(latest,settings).locked.has(target)||target&&!codes.includes(target))return;if(target&&target!==p.group)plan[key]=target;else delete plan[key];renderScenario();});
document.addEventListener('click',event=>{
 const groupAll=event.target?.dataset?.dispatchSelectAll,groupNone=event.target?.dataset?.dispatchSelectNone;
 const group=groupAll||groupNone;if(!group||!codes.includes(group)||!ready)return;
 const policy=movementPolicy(latest,settings);
 selectedKeys=chosenKeys(policy);
 for(const p of latest)if(p.group===group&&policy.movable.has(p.key)){
  if(groupAll)selectedKeys.add(p.key);else selectedKeys.delete(p.key);
 }
 plan={};render();
});
})(typeof window!=='undefined'?window:globalThis);
