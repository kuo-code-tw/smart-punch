/* Read-only current-shift roster inside the homepage card. Uses the same Taipei
   shift boundaries, personnel overrides and live attendance source as scheduling. */
(function(root){
'use strict';
const str=v=>String(v??'').trim(),id=v=>str(v).toUpperCase();
function dutyPeriod(now=new Date()){
 const parts={};new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).forEach(p=>parts[p.type]=p.value);
 const today=parts.year+'-'+parts.month+'-'+parts.day,hour=Number(parts.hour),shift=hour<8?'晚':hour<16?'早':'中';
 const date=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)-(hour<8?1:0))).toISOString().slice(0,10);
 return {today,date,shift,month:date.slice(0,7),hours:shift==='早'?'08:00–16:00':shift==='中'?'16:00–24:00':'00:00–08:00',key:date+'|'+shift};
}
function day(value){const m=str(value).match(/^(\d{2,4})[-/](\d{1,2})[-/](\d{1,2})/);if(!m)return '';const y=Number(m[1])<1911?Number(m[1])+1911:Number(m[1]);return y+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0')}
function eligible(emp,date,today){
 const start=[day(emp.startDate),day(emp.reportingDate)].filter(Boolean).sort().at(-1)||'',end=day(emp.lastWorkDate||emp.terminationDate);
 return (!start||date>=start)&&(!end||end>=today)&&!['resigned','resign','離職','已離職','離職人員','terminated','inactive','leave','留職停薪','留停','loa'].includes(str(emp.employmentStatus||'active').toLowerCase());
}
function rosterModel(data,period,activeIds=null){
 if(!Array.isArray(data?.employees)||!Array.isArray(data?.schedules))throw Error('目前班別名單尚未完整讀取');
 if(data.month&&str(data.month)!==period.month)throw Error('班表月份不符');
 const rows=new Map(data.schedules.filter(r=>!r.month||str(r.month)===period.month).map(r=>[id(r.empId),r])),seen=new Set(),people=[];
 for(const emp of data.employees){
  const key=id(emp.empId||emp.id);if(!key||key==='ADMIN'||seen.has(key)||!eligible(emp,period.date,period.today))continue;
  seen.add(key);const row=rows.get(key),schedule=row?.schedule||{},override=schedule.__personnel||{},shift=str(schedule[period.date]);
  if(shift!==period.shift)continue;
  const role=str(override.role||row.role||emp.jobTitle||emp.deptDetail||emp.role||emp.dept||'其他'),group=str(override.group||row.group||emp.group||'不分組');
  if(/主任|課長|副理|經理|協理|處長|部長|總監|副總|總經理|董事長|執行長|廠長/.test(role))continue;
  const leave=(data.leaveRecords||[]).some(l=>str(l.status)==='已核准'&&id(l.empId||l.employeeId)===key&&day(l.startDate||l.startTime)<=period.date&&(day(l.endDate||l.endTime)||day(l.startDate||l.startTime))>=period.date);
  if(leave)continue;
  people.push({id:key,name:str(emp.name)||key,role:/船上指揮手/.test(role)?'指揮手':role,group,active:activeIds instanceof Set?activeIds.has(key):null});
 }
 const order=['領班','指揮手','AQC','ARMG','F/L'];people.sort((a,b)=>(order.indexOf(a.role)<0?99:order.indexOf(a.role))-(order.indexOf(b.role)<0?99:order.indexOf(b.role))||a.group.localeCompare(b.group,'zh-Hant')||a.name.localeCompare(b.name,'zh-Hant-u-co-stroke'));
 const groups=[];for(const p of people){let group=groups.find(g=>g.role===p.role);if(!group){group={role:p.role,people:[]};groups.push(group)}group.people.push(p)}
 return {period,total:people.length,groups};
}
function nightActive(base,records,employees,period,now=Date.now()){
 const byNo=new Map(),latest=new Map(),out=new Set(base),earliest=Date.parse(period.date+'T21:00:00+08:00');
 for(const emp of employees){const no=str(emp.attNo||emp.attendanceNo||emp.attendanceId);if(!no)continue;const values=byNo.get(no)||new Set();values.add(id(emp.empId||emp.id));byNo.set(no,values)}
 for(const r of records){if(r.deleted===true||r.isDeleted===true)continue;const raw=str(r.timeStr||r.time||r.dateTime).replace('T',' '),m=raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2}) (\d{1,2}):(\d{2})(?::(\d{2}))?/);if(!m)continue;
  const ts=Date.parse(m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0')+'T'+m[4].padStart(2,'0')+':'+m[5]+':'+(m[6]||'00')+'+08:00'),status=str(r.status||r.type||r.action),type=/下班|簽退|CLOCK[ _-]?OUT|(^|\W)OUT($|\W)/i.test(status)?'OUT':/上班|簽到|CLOCK[ _-]?IN|(^|\W)IN($|\W)/i.test(status)?'IN':'';
  if(!type||ts>now||ts<now-18*3600000)continue;let key=id(r.empId);if(!key){const values=byNo.get(str(r.attNo||r.attendanceNo));if(values?.size===1)key=[...values][0]}if(!key)continue;
  const prev=latest.get(key);if(!prev||ts>prev.ts||ts===prev.ts&&type==='OUT')latest.set(key,{ts,type});
 }
 latest.forEach((r,key)=>{if(r.type==='IN'&&r.ts>=earliest)out.add(key);else out.delete(key)});return out;
}
const api={dutyPeriod,rosterModel,nightActive};if(typeof module==='object'&&module.exports)module.exports=api;
root.P79CurrentShift=api;if(!root.document)return;
const d=root.document,$=key=>d.getElementById(key),esc=v=>str(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let cached=null,cacheKey='',rosterAt=0,liveAt=0,lastRead=0,active=null,busy=false,stamp='',timer=0,revision=0;
function context(){let s=null;try{s=JSON.parse(root.sessionStorage.getItem('port79_user_session')||'null')}catch(ignore){}const role=str(s?.adminRole||s?.role).toLowerCase(),superadmin=role==='superadmin',level=k=>['view','manage'].includes(s?.systemPermissions?.[k]);return {s,allowed:!!s&&!s.punchOnly&&['admin','superadmin'].includes(role)&&$('systems')?.classList.contains('show'),roster:superadmin||level('schedule')||level('attendance')||level('workhours'),attendance:superadmin||level('attendance')||level('workhours'),token:root.sessionStorage.getItem('port79_user_token')||root.sessionStorage.getItem('port79_admin_token')||'',signature:JSON.stringify([s,root.sessionStorage.getItem('port79_user_token'),root.sessionStorage.getItem('port79_admin_token')])}}
function message(text){const e=$('p79CurrentShiftList');if(e)e.innerHTML='<div class="p79r-shift-empty">'+esc(text)+'</div>'}
function clear(){revision++;cached=null;cacheKey='';stamp='';active=null;liveAt=0;rosterAt=0;lastRead=0;message('登入後顯示目前班別人員')}
function render(period,error=''){
 const caption=$('p79CurrentShiftPeriod');if(caption)caption.textContent=period.today.slice(5).replace('-','/')+' · '+period.hours;
 if(!cached){message(error||'正在讀取目前班別名單…');return}
 let model;try{model=rosterModel(cached,period,Date.now()-liveAt<=45000?active:null)}catch(e){message(e.message);return}
 const list=$('p79CurrentShiftList');if(!list)return;const scroll=list.scrollTop;
 list.innerHTML='<div class="p79r-shift-head"><strong>⚙ '+esc(period.shift)+'班</strong><span>'+model.total+' 人</span></div>'+(!model.total?'<div class="p79r-shift-empty">目前班別沒有排班人員</div>':model.groups.map(g=>'<section class="p79r-role-section"><div class="p79r-role-head"><span>'+esc(g.role)+'</span><span>'+g.people.length+' 人</span></div><div class="p79r-shift-people">'+g.people.map(p=>'<div class="p79r-shift-person" title="'+esc(p.name+'｜'+p.role+'｜'+p.group)+'"><div class="p79r-shift-name"><b>'+esc(p.name)+'</b>'+(p.active===true?'<span class="p79r-on-duty"><i></i>當班</span><span class="p79r-checked-in">已簽到</span>':'')+'</div><small>'+esc(p.role)+'｜'+esc(p.group)+'</small></div>').join('')+'</div></section>').join(''))+'<div class="p79r-shift-sync">'+esc(error||(active===null||Date.now()-liveAt>45000?'簽到狀態待同步':'簽到狀態更新 '+new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(liveAt))))+'</div>';
 list.scrollTop=scroll;
}
async function read(action,params,c){
 const base=root.sessionStorage.getItem('port79_gas_url')||'';if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(base))throw Error('尚未取得資料連線');
 const url=new URL(base);Object.entries({action,token:c.token,gcToken:c.token,...params,_:Date.now()}).forEach(([k,v])=>url.searchParams.set(k,String(v)));
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);try{const res=await root.fetch(url.toString(),{method:'GET',cache:'no-store',signal:controller.signal}),data=await res.json();if(!res.ok||data?.ok!==true)throw Error('目前班別資料暫時無法同步');return data}finally{clearTimeout(timeout)}
}
async function refresh(force=false){
 const c=context(),period=dutyPeriod();if(!c.allowed){if(stamp||cached)clear();return}if(!c.roster){message('目前帳號沒有班表人員檢視權限');return}if(!c.token){message('請重新登入管理介面');return}
 if(stamp!==c.signature||cacheKey!==period.key){clear();stamp=c.signature;cacheKey=period.key;}
 render(period);if(busy||d.hidden||(!force&&Date.now()-lastRead<30000))return;busy=true;lastRead=Date.now();const rev=revision,valid=()=>rev===revision&&context().signature===c.signature&&context().allowed&&dutyPeriod().key===period.key;
 try{
  if(!cached||force||Date.now()-rosterAt>60000){const data=await read('getScheduleDataSecure',{month:period.month},c);rosterModel(data,period);if(!valid())return;cached=data;rosterAt=Date.now();render(period)}
  if(c.attendance){try{const state=await read('getScheduleAttendanceState',{},c);if(!Array.isArray(state.activeEmpIds)||state.today&&state.today!==period.today)throw Error('簽到狀態尚未核對');let next=new Set(state.activeEmpIds.map(id));
   if(period.shift==='晚'){const months=[...new Set([period.month,period.today.slice(0,7)])],records=[];for(const month of months){const raw=await read('getAttendanceMainDirect',{month},c);if(!Array.isArray(raw.records)||raw.month&&raw.month!==month)throw Error('跨日晚班考勤待同步');records.push(...raw.records)}next=nightActive(next,records,cached.employees,period)}
   if(!valid())return;active=next;liveAt=Date.now();render(period);
  }catch(error){if(valid()){active=null;liveAt=0;render(period,'簽到狀態待同步')}}}else{active=null;render(period,'目前帳號未開放簽到狀態檢視')}
 }catch(error){if(valid()){active=null;liveAt=0;cached=null;render(period,'目前班別名單暫時無法讀取，稍後自動重試')}}finally{busy=false;}
}
function init(){if(!$('p79CurrentShiftList'))return;const target=$('systems');if(target)new MutationObserver(()=>refresh().catch(()=>{})).observe(target,{attributes:true,attributeFilter:['class']});d.addEventListener('visibilitychange',()=>{if(!d.hidden)refresh(true).catch(()=>{})});$('p79DashRefresh')?.addEventListener('click',()=>refresh(true).catch(()=>{}));timer=root.setInterval(()=>refresh().catch(()=>{}),10000);refresh().catch(()=>{});}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);
