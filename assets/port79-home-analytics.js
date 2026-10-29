/* Read-only analytics. Shared V6 pairing; no attendance, schedule or approval writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.P79HomeAnalytics=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const str=x=>String(x??'').trim(),id=e=>str(e?.empId||e?.employeeId||e?.id).toUpperCase();
const day=x=>{const m=str(x).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';};
const active=e=>!['resigned','leave','terminated','離職','已離職','留職停薪'].includes(str(e.employmentStatus||e.status).toLowerCase());
function aggregate({engine,records,employees,schedules=[],leaves=[],covers=[],today,month,attendanceReady=true,rosterReady=true,leaveReady=true,boundariesReady=true}){
 const people=Array.isArray(employees)?employees:[],byEmp=new Map(),byAtt=new Map(),byName=new Map();people.forEach(e=>{if(id(e))byEmp.set(id(e),e);if(str(e.attNo||e.attendanceNo))byAtt.set(str(e.attNo||e.attendanceNo).replace(/^0+/,''),e);if(e.name){const name=str(e.name);byName.set(name,byName.has(name)?null:e);}});
 const find=r=>{const key=str(r.empId||r.employeeId||r['自定義編號']).toUpperCase(),att=str(r.attNo||r.attendanceNo||r['考勤號碼']).replace(/^0+/,'');return byEmp.get(key)||byAtt.get(att)||(!key&&!att?byName.get(str(r.name||r['姓名'])):null);};
 // Always restrict raw punches to the authorized employee roster returned by the server.
 const scoped=(records||[]).filter(r=>!!find(r)&&r.deleted!==true&&r.isDeleted!==true&&!r.deletedAt&&!r.tombstone).map(r=>{const e=find(r);return {...r,empId:id(e),attNo:e.attNo||r.attNo,name:e.name||r.name,dept:e.dept||r.dept};});
 const shifts=attendanceReady?engine.buildShifts(scoped):[],monthShifts=shifts.filter(s=>day(s.accountingDateKey||s.dateKey).startsWith(month+'-')),todayShifts=shifts.filter(s=>day(s.accountingDateKey||s.dateKey)===today);
 const unique=new Set(),present=new Set(),hours=[0,0,0,0,0],deptHours=new Map(),latest=new Map();let todayHours=0,monthHours=0;
 for(const s of shifts){const e=find(s);if(!e)continue;const key=id(e),date=day(s.accountingDateKey||s.dateKey);if(s.clockIn&&date.startsWith(month+'-'))unique.add(key+'|'+date);if(s.clockIn&&date===today)present.add(key);
  if(!s.clockIn||!s.clockOut||s.timePrecisionIssue)continue;const h=(s.clockOut.__ts-s.clockIn.__ts)/3600000;if(!(h>0&&h<=24))continue;if(date===today)todayHours+=h;if(date.startsWith(month+'-')){monthHours+=h;hours[Math.min(4,Math.floor((Number(date.slice(-2))-1)/7))]+=h;const dept=str(e.dept||e.department||'未設定部門');deptHours.set(dept,(deptHours.get(dept)||0)+h);}}
 for(const r of engine.dedupe(scoped)){const e=find(r),time=engine.normalizeTime(r.timeStr||r['出勤時間']),date=day(time);if(!e||!date)continue;const m=time.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);if(!m)continue;const key=id(e),stamp=`${date}T${m[4]}:${m[5]}:${m[6]}+08:00`,t=Date.parse(stamp);if(!latest.has(key)||t>latest.get(key).t)latest.set(key,{t,type:engine.recordType(r),date});}
 const yesterday=new Date(Date.parse(today+'T12:00:00+08:00')-86400000).toISOString().slice(0,10);let onDuty=0;latest.forEach(v=>{if(v.type==='IN'&&(v.date===today||v.date===yesterday))onDuty++;});
 const leaveToday=new Set(),pending=[];for(const l of leaves){const e=find(l);if(!e)continue;const status=str(l.status)||'待審核',start=day(l.startDate||l.startTime),end=day(l.endDate||l.endTime)||start;if(status==='已核准'&&start&&start<=today&&end>=today)leaveToday.add(id(e));if(status==='待審核')pending.push({kind:'leave',id:str(l.id),name:e.name||l.name||id(e),date:start||'未設定日期',description:l.leaveType||'請假申請',status});}
 const expected=new Set(present);let missingSchedule=0,conflicts=0;const reportIds=new Set();let declaredHours=0;const declaredByWeek=[0,0,0,0,0];
 for(const row of schedules){const e=find(row);if(!e)continue;const schedule=row.schedule||{};const shift=str(schedule[today]);if(active(e)&&(/^(早|中|晚)/.test(shift)||/\d{2}[-~～]\d{2}/.test(shift)))expected.add(id(e));if(active(e)&&!shift)missingSchedule++;if(leaveToday.has(id(e))&&/^(早|中|晚)/.test(shift))conflicts++;
  for(const [date,meta]of Object.entries(schedule.__meta||{})){if(!date.startsWith(month+'-'))continue;const r=meta?.overtimeReport;if(!r?.id||reportIds.has(str(r.id)))continue;reportIds.add(str(r.id));if(/撤銷|刪除|取消|revoked|cancel/i.test(str(r.status))||r.revoked===true||r.deleted===true)continue;const h=Number(r.declaredHours??r.rule?.declaredHours);if(Number.isFinite(h)&&h>=0){declaredHours+=h;declaredByWeek[Math.min(4,Math.floor((Number(date.slice(-2))-1)/7))]+=h;}if(/^(待審核|待核准|pending)$/.test(str(r.status)))pending.push({kind:'overtime',id:str(r.id),name:e.name||id(e),date,description:'加班申請',status:str(r.status)});}}
 const approvedOff=[...leaveToday].filter(k=>!present.has(k));approvedOff.forEach(k=>expected.add(k));const waiting=[...expected].filter(k=>!present.has(k)&&!leaveToday.has(k));
 const missing=monthShifts.filter(s=>day(s.dateKey)<today&&(!s.clockIn||!s.clockOut||s.timePrecisionIssue));const long=monthShifts.filter(s=>s.clockIn&&s.clockOut&&(s.clockOut.__ts-s.clockIn.__ts)>12*3600000);
 return {today,month,attendanceReady,rosterReady,leaveReady,boundariesReady,scopeCount:people.length,present:present.size,onDuty,todayHours,monthHours,attendanceDays:unique.size,hours,departmentHours:[...deptHours].sort((a,b)=>b[1]-a[1]),declaredHours,declaredByWeek,pending:pending.sort((a,b)=>b.date.localeCompare(a.date)),distribution:{present:present.size,leave:approvedOff.length,waiting:waiting.length,total:expected.size},alerts:[{label:'歷史班次缺卡／時間待核',count:missing.length,target:'attendance',detail:'僅統計今日以前的本月班次'},{label:'刷卡區間超過 12 小時',count:long.length,target:'workhours',detail:'需核對班次、休息及申報明細'},{label:'核准請假與工作班別重疊',count:conflicts,target:'schedule',detail:'核對請假與排班連動狀態'}],missingSchedule};
}
// Read-only vessel snapshot aggregation. Counts use dated detail rows; billing uses completed jobs.
function vesselAggregate(data,{today,month}){
 const num=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0&&n<1e8?n:0;};
 const iso=v=>{const m=String(v||'').match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';};
 const active=r=>r&&!r.deleted&&!r.isDeleted&&!r.deletedAt&&!r.tombstone;
 const unique=(list,master=false)=>{const m=new Map();(list||[]).filter(active).forEach((r,i)=>m.set(String(master?(r.workingNo||r.id||'row:'+i):(r.id||[r.workingNo,r.empId||r.name,r.workDate,r.startTime,r.endTime,r.source].join('|'))),r));return [...m.values()];};
 const masters=unique(data.shipMasters,true).map(raw=>({...raw,...Object.fromEntries(Object.entries(raw.manualOverrides||{}).filter(([k])=>!k.startsWith('_')))}));
 const rows=unique(data.records),key=r=>String(r.workingNo||[r.shipName||r.vessel,r.voyageE||r.voyage].join('|'));
 const finish=s=>iso(s._cloudLastDate||s.cloudLastDate||s._authoritativeLastDate)||iso(s.lastDate)||iso(s.lashingDateTime||s.lashingDate||s.workingSheetSource?.lashingDateTime||s.workingSheetSource?.endDate)||iso(s.compareDate||s.workingSheetSource?.compareDate)||iso(s.firstDate);
 const byNo=new Map(masters.map(s=>[key(s),s]));
 const dated=rows.map(r=>({...r,date:iso(r.workDate)})).filter(r=>r.date);
 const moves=r=>['working-report','gc-driver-efficiency'].includes(r.source)?num(r.disc)+num(r.load):num(r.containers);
 const hours=r=>{if(num(r.timeHours))return num(r.timeHours);const min=t=>{const m=String(t||'').match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null;};const a=min(r.startTime),b=min(r.endTime);return a===null||b===null?0:((b-a+1440)%1440)/60;};
 const monthRows=dated.filter(r=>r.date.startsWith(month)),todayRows=dated.filter(r=>r.date===today);
 const todayKeys=new Set(todayRows.map(key));masters.filter(s=>iso(s.firstDate)&&iso(s.firstDate)<=today&&iso(s.lastDate)&&iso(s.lastDate)>=today).forEach(s=>todayKeys.add(key(s)));
 const jobs=[...todayKeys].map(k=>{const rs=todayRows.filter(r=>key(r)===k),m=byNo.get(k)||rs[0]||{},hs=rs.reduce((s,r)=>s+hours(r),0),qty=rs.reduce((s,r)=>s+moves(r),0);return {shipGph:num(m.gph)||null,vessel:m.shipName||m.vessel||'未命名',voyage:m.voyageE||m.voyageI||m.voyage||'—',volume:rs.length,containers:qty,people:new Set(rs.map(r=>String(r.empId||r.name||'')).filter(Boolean)).size,efficiency:hs?qty/hs:null,status:m.status||'已載入'};});
 const weeks=Array.from({length:Math.ceil(new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()/7)},()=>({volume:0,containers:0,hours:0,moves:0,shipGph:[]}));
 monthRows.forEach(r=>{const w=weeks[Math.floor((Number(r.date.slice(8))-1)/7)];w.volume++;w.containers+=moves(r);w.hours+=hours(r);w.moves+=moves(r)+num(r.hatches);});
 const sum=k=>weeks.reduce((s,w)=>s+w[k],0),monthJobs=masters.filter(s=>finish(s).startsWith(month));
 monthJobs.forEach(s=>{const date=finish(s),gph=num(s.gph),w=weeks[Math.floor((Number(date.slice(8))-1)/7)];if(w&&gph>0)w.shipGph.push(gph);});
 const eff=monthJobs.filter(s=>num(s.gph)>0),personalHours=sum('hours');
 const pending=monthJobs.filter(s=>/待審|待核|pending/i.test(String(s.status||''))).map(s=>({name:s.vessel||s.shipName||'未命名船舶',voyage:s.voyageE||s.voyageI||'—',description:s.reviewReason||s.note||'船舶作業待核對',date:finish(s),status:s.status,kind:'vessel'}));
 return {pending,jobs,todayShips:todayKeys.size,todayVolume:todayRows.length,todayContainers:todayRows.reduce((s,r)=>s+moves(r),0),monthVolume:monthRows.length,monthContainers:sum('containers'),billingContainers:monthJobs.reduce((s,r)=>s+num(r.totalContainers),0),shipEfficiency:eff.length?eff.reduce((s,r)=>s+num(r.gph),0)/eff.length:null,personEfficiency:personalHours?sum('moves')/personalHours:null,weeks,recordCount:rows.length,masterCount:masters.length};
}
return {aggregate,day,vesselAggregate};
});
