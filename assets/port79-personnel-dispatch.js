(function(root){
'use strict';
const codes=['A','B','C','D'];
function groupCode(v){const m=String(v||'').trim().toUpperCase().match(/^([ABCD])(?:組)?$/);return m?m[1]:'';}
function buildMonth({month,records=[],roster=[],metrics,normalize=v=>String(v||'').replace(/\s+/g,'')}){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return [];
 const persons=new Map(),names=new Map();
 const idOf=v=>{const id=String(v||'').trim().toUpperCase();return id&&!id.startsWith('NAME:')?id:'';};
 function add(key,name,empId,group='',confirmed=false){if(!persons.has(key))persons.set(key,{key,name,empId,group:groupCode(group),confirmed,count:0,containers:0,hours:0,hc:0,invalid:0});return persons.get(key);}
 for(const r of roster){const id=idOf(r.empId||r.id),name=String(r.name||'').trim();if(!name)continue;const key=id?'EMP:'+id:'NAME:'+normalize(name);const p=add(key,name,id,r.group,true);if(p.group!==groupCode(r.group))p.confirmed=false;const nk=normalize(name);if(!names.has(nk))names.set(nk,new Set());names.get(nk).add(key);}
 for(const r of records){if(r.source!=='working-report'||String(r.workDate||'').slice(0,7)!==month)continue;
  const id=idOf(r.empId),name=String(r.name||'').trim()||'未命名',matches=names.get(normalize(name));
  const key=id?'EMP:'+id:matches?.size===1?[...matches][0]:'REPORT:'+normalize(name);
  const p=add(key,name,id),m=metrics(r)||{},disc=Number(m.disc),load=Number(m.load),hours=Number(m.hours),hc=Number(m.hc);
  p.count++;const quantityOk=Number.isFinite(disc)&&disc>=0&&Number.isFinite(load)&&load>=0;
  if(quantityOk)p.containers+=disc+load;if(Number.isFinite(hours)&&hours>0)p.hours+=hours;if(Number.isFinite(hc)&&hc>=0)p.hc+=hc;
  if(!quantityOk||!Number.isFinite(hours)||hours<=0)p.invalid++;
 }
 return [...persons.values()].map(p=>({...p,eff:p.count&&p.hours>0&&!p.invalid?p.containers/p.hours:null,eligible:p.confirmed&&!!p.group&&p.count>0&&p.hours>0&&!p.invalid})).sort((a,b)=>(b.eff??-1)-(a.eff??-1)||a.name.localeCompare(b.name,'zh-Hant-u-co-stroke')||a.key.localeCompare(b.key));
}
function summarize(persons,plan={}){
 const groups=Object.fromEntries(codes.map(g=>[g,{group:g,people:0,active:0,containers:0,hours:0,hc:0,invalid:0}]));let excluded=0;
 for(const p of persons){if(!p.confirmed||!groups[p.group]){excluded++;continue;}const target=p.eligible&&codes.includes(plan[p.key])?plan[p.key]:p.group,g=groups[target];g.people++;if(p.count)g.active++;g.containers+=p.containers;g.hours+=p.hours;g.hc+=p.hc;g.invalid+=p.invalid;}
 const rows=Object.values(groups).map(g=>({...g,eff:g.hours>0&&!g.invalid?g.containers/g.hours:null}));
 const valid=rows.filter(g=>g.eff!==null);return {groups:rows,excluded,gap:valid.length===4?Math.max(...valid.map(g=>g.eff))-Math.min(...valid.map(g=>g.eff)):null};
}
function movementPolicy(persons){
 const valid=persons.filter(p=>p.eligible&&codes.includes(p.group)&&p.hours>0&&Number.isFinite(p.containers));
 const hours=valid.reduce((sum,p)=>sum+p.hours,0),volume=valid.reduce((sum,p)=>sum+p.containers,0),benchmark=hours>0?volume/hours:null;
 const movable=new Set(valid.filter(p=>benchmark!==null&&p.containers/p.hours<benchmark-1e-9).map(p=>p.key));
 return {benchmark,movable};
}
function recommendSwap(persons,{minHours=10,minRecords=5}={}){
 const before=summarize(persons);
 if(before.gap===null)return {before,reason:'四組尚未都有可比較的有效作業時數，暫不提出調任建議。'};
 const policy=movementPolicy(persons);
 const candidates=persons.filter(p=>policy.movable.has(p.key)&&p.hours>=minHours&&p.count>=minRecords);
 let best=null;
 for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
  const a=candidates[i],b=candidates[j];if(a.group===b.group)continue;
  const plan={[a.key]:b.group,[b.key]:a.group},after=summarize(persons,plan),gap=after.gap,hourDifference=Math.abs(a.hours-b.hours);
  if(gap===null||gap>=before.gap-0.005)continue;
  if(!best||gap<best.after.gap-1e-9||Math.abs(gap-best.after.gap)<1e-9&&hourDifference<best.hourDifference)best={before,after,plan,moves:[{person:a,from:a.group,to:b.group},{person:b,from:b.group,to:a.group}],hourDifference};
 }
 return best||{before,reason:candidates.length<2?'低於全體月均效率且符合至少 5 筆作業及 10 小時的人員不足，維持原組。':'固定平均以上人員後，沒有能縮小四組效率差距的低效率人員互換方案，建議維持現況。'};
}
const api={buildMonth,summarize,groupCode,recommendSwap,movementPolicy};
if(typeof module==='object'&&module.exports){module.exports=api;return;}
root.P79PersonnelDispatch=api;
let plan={},owner='',planMonth='',latest=[],ready=false;const reads=new Map();
const el=id=>document.getElementById(id),fmt=v=>v===null?'—':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:2}),safe=v=>esc(String(v??''));
function month(){return el('dispatchMonth')?.value||'';}
function resetContext(){const token=String(gcToken||'');if(owner!==token||planMonth!==month()){plan={};latest=[];owner=token;planMonth=month();}}
function sourceRows(){return canonicalOperationalRecords((records||[]).filter(r=>r.source==='working-report'&&String(r.workDate||'').slice(0,7)===month()));}
function render(){
 if(!el('dispatchBody'))return;
 const input=el('dispatchMonth'),year=getPort79Year();if(!input.value)input.value=isoTodayLocal().startsWith(year+'-')?isoTodayLocal().slice(0,7):year+'-01';resetContext();
 const rows=sourceRows(),store=currentOperationScheduleStore();ensureOperationScheduleGroups(rows.length?rows:[{workDate:month()+'-01'}]);
 const roster=store?.has(month())?store.personnel(month()):[];
 latest=buildMonth({month:month(),records:rows,roster,metrics:workloadRecordMetrics,normalize:normalizePersonName});
 const state=reads.get(owner+'|'+month());ready=state==='ready'&&!!store?.has(month());
 el('dispatchLoadState').textContent=(state==='loading'?'正在讀取整月即時及歷史作業資料…':state==='ready'?'整月即時與歷史來源已讀取。':state==='partial'?'部分來源讀取失敗，資料暫不完整，請重新讀取。':state==='error'?'雲端讀取失敗，目前顯示本機資料，請重新讀取。':'尚未讀取整月資料。')+(store?.has(month())?'':' 排班名冊尚未確認。');
 renderOperationScheduleStatus(rows.length?rows:[{workDate:month()+'-01'}]);
 const total=latest.reduce((s,p)=>({containers:s.containers+p.containers,hours:s.hours+p.hours,invalid:s.invalid+p.invalid}),{containers:0,hours:0,invalid:0});
 el('dispatchSummary').textContent=`${month()}｜${latest.length} 人｜作業量 ${fmt(total.containers)} 櫃｜作業時數 ${fmt(total.hours)} 小時｜月均效率 ${fmt(total.hours>0&&!total.invalid?total.containers/total.hours:null)} 櫃／小時${total.invalid?'｜'+total.invalid+' 筆作業資料待核對':''}`;
 const policy=movementPolicy(latest);
 for(const key of Object.keys(plan))if(!policy.movable.has(key))delete plan[key];
 const search=normalizePersonName(el('dispatchName').value),sort=el('dispatchSort').value;
 const shown=latest.filter(p=>!search||normalizePersonName(p.name).includes(search)).slice().sort((a,b)=>sort==='hours'?b.hours-a.hours:sort==='containers'?b.containers-a.containers:((b.eff??-1)-(a.eff??-1)));
 el('dispatchBody').innerHTML=shown.map(p=>`<tr><td class="font-bold">${safe(p.name)}</td><td>${safe(p.empId||'—')}</td><td>${safe(p.confirmed&&p.group?p.group+'組':'待核對')}</td><td>${fmt(p.containers)}</td><td>${fmt(p.hours)}</td><td class="font-bold text-teal-700">${fmt(p.eff)}</td><td>${fmt(p.hc)}</td><td>${p.count}</td><td>${safe(!p.count?'尚無作業資料':p.invalid?'櫃數或時數待核對':!p.confirmed||!p.group?'排班身分／組別待核對':policy.movable.has(p.key)?'低於月均，可供試算':'達月均以上，維持原組')}</td><td><select aria-label="${safe(p.name)}的試算組別" data-dispatch-key="${safe(p.key)}" ${!ready||!policy.movable.has(p.key)?'disabled':''}><option value="">維持原組</option>${codes.map(g=>`<option value="${g}" ${plan[p.key]===g?'selected':''}>${g}組</option>`).join('')}</select></td></tr>`).join('')||'<tr><td colspan="10">此月份或搜尋條件尚無人員資料</td></tr>';
 renderRecommendation(rows);renderScenario();if(!state&&owner)void load(false);
}
function renderRecommendation(rows){
 const box=el('dispatchRecommendation');if(!box)return;
 const dates=[...new Set(rows.map(r=>String(r.workDate||'').slice(0,10)).filter(Boolean))].sort();
 const coverage=dates.length?`資料範圍 ${dates[0]} ～ ${dates[dates.length-1]}，共 ${dates.length} 個有作業紀錄的日期。`:'';
 if(!ready){box.innerHTML='<p>正在確認整月來源與排班名冊；確認完成後會自動顯示調任方向。</p>';return;}
 const suggestion=recommendSwap(latest),policy=movementPolicy(latest);
 const rule=`全體月均基準 ${fmt(policy.benchmark)} 櫃／小時：達平均以上人員固定原組，只評估低於平均的人員。`;
 if(!suggestion.plan){box.innerHTML=`<p class="font-bold">${safe(suggestion.reason)}</p><p class="text-sm mt-2">${safe(rule)}</p><p class="text-sm mt-2">${safe(coverage)}</p>`;return;}
 box.innerHTML=`<p class="font-bold text-teal-800">建議 ${suggestion.moves.map(m=>`${safe(m.person.name)}：${m.from}組 → ${m.to}組`).join('；')}。其餘組別維持。</p>
 <p class="text-sm mt-2">${safe(rule)}依作業量與時數試算，各組人數不變；四組效率差距由 <strong>${fmt(suggestion.before.gap)}</strong> 降至 <strong>${fmt(suggestion.after.gap)}</strong> 櫃／小時。</p>
 <div class="overflow-auto mt-3"><table class="tbl w-full text-center"><thead><tr><th>人員</th><th>原組 → 建議組</th><th>作業櫃數</th><th>作業時數</th><th>個人月均效率</th></tr></thead><tbody>${suggestion.moves.map(m=>`<tr><td>${safe(m.person.name)}</td><td>${m.from}組 → ${m.to}組</td><td>${fmt(m.person.containers)}</td><td>${fmt(m.person.hours)}</td><td>${fmt(m.person.eff)}</td></tr>`).join('')}</tbody></table></div>
 <p class="text-sm mt-2">${safe(coverage)}依已匯入資料提出暫定建議，不代表整月資料齊全。只比較低於全體月均效率、AQC 同職稱、名冊確認且至少 5 筆作業／10 小時的人員；先找單次兩人互換中差距最小的方案，同分時優先時數接近。未確認組別的人員未納入比較。</p>
 <button type="button" class="btn bg-teal-700 text-white mt-3" onclick="P79PersonnelDispatch.useRecommendation()">帶入下方試算</button>`;
}
function renderScenario(){
 const policy=movementPolicy(latest),allowedPlan=Object.fromEntries(Object.entries(plan).filter(([key])=>policy.movable.has(key)));
 const before=summarize(latest),after=summarize(latest,ready?allowedPlan:{}),moves=latest.filter(p=>policy.movable.has(p.key)&&allowedPlan[p.key]&&allowedPlan[p.key]!==p.group);
 el('dispatchGroupBody').innerHTML=before.groups.map((g,i)=>{const next=after.groups[i];return `<tr><td class="font-bold">${g.group}組</td><td>${g.people} → ${next.people}</td><td>${fmt(g.containers)} → ${fmt(next.containers)}</td><td>${fmt(g.hours)} → ${fmt(next.hours)}</td><td>${fmt(g.eff)} → ${fmt(next.eff)}</td></tr>`;}).join('');
 el('dispatchScenarioState').textContent=!ready?'完成整月資料與排班名冊讀取後，才可選擇調動人員試算。':`已選 ${moves.length} 人｜四組效率差距 ${fmt(before.gap)} → ${fmt(after.gap)} 櫃／小時。${before.excluded?'另有 '+before.excluded+' 人因身分或組別未確認，未納入各組比較。':''}`;
 el('dispatchMoves').textContent=ready&&moves.length?moves.map(p=>`${p.name}：${p.group}組 → ${plan[p.key]}組（${fmt(p.containers)} 櫃／${fmt(p.hours)} 小時）`).join('；'):'尚未選擇調動人員。';
}
async function load(force=true){
 if(!requireEfficiencyAccess())return;resetContext();const requested=month(),token=String(gcToken||''),key=token+'|'+requested;
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(requested)||reads.get(key)==='loading'||!force&&reads.has(key))return;
 reads.set(key,'loading');render();const replies=await Promise.allSettled([apiGetQuick('gcGetData',{month:requested},25000),apiGetQuick('historyGetMonthData',{type:'vessel',month:requested},25000)]);
 if(token!==String(gcToken||''))return;let success=0;
 for(const r of replies){if(r.status==='fulfilled'&&Array.isArray(r.value?.records)){try{mergeEfficiencyCloudData(r.value);success++;}catch(_){}}}
 reads.set(key,success===2?'ready':success?'partial':'error');if(success){saveLocal();invalidateWorkloadIndex();}
 if(activeEfficiencyTabName()==='dispatch')render();
}
api.useRecommendation=()=>{if(!ready)return;const suggestion=recommendSwap(latest);if(suggestion.plan){plan={...suggestion.plan};render();}};
api.render=render;api.load=load;api.rows=sourceRows;api.clear=()=>{plan={};render();};
document.addEventListener('change',event=>{const key=event.target?.dataset?.dispatchKey;if(!key)return;const p=latest.find(p=>p.key===key),target=event.target.value;if(!ready||!p?.eligible||!movementPolicy(latest).movable.has(key)||target&&!codes.includes(target))return;if(target&&target!==p.group)plan[key]=target;else delete plan[key];renderScenario();});
})(typeof window!=='undefined'?window:globalThis);
