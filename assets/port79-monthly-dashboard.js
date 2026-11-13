/* 79號碼頭 2026-10-30 管理首頁：本月船舶＋考勤唯讀分析。
   不修改打卡、排班、資料庫、後端、既有登入事件。 */
(function(root){
'use strict';
const $=id=>root.document?.getElementById(id);
const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const first=(obj,keys)=>{for(const k of keys){if(obj?.[k]!==undefined&&obj[k]!==null&&obj[k]!=='')return obj[k]}return null};
const numberFrom=(obj,keys)=>num(first(obj,keys));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=0)=>v===null||v===undefined||!Number.isFinite(v)?'—':v.toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
// Text after an employee's name is a job title, not part of the name or a roster group.
function displayPersonName(value){return String(value||'').trim().replace(/\s*[（(]\s*AQC\s*[)）]\s*$/i,'').trim()}
function rosterGroup(value){const v=String(value||'').trim().replace(/\s/g,'').toUpperCase();const m=v.match(/^([ABCD])(?:組)?$/);return m?m[1]+'組':''}
// Group membership must come from a named roster group or an explicit ship-detail group.
// An AQC suffix is a role label and must never be taken as an A/B/C/D group.
function assignPersonGroups(people,scheduleData){
 const idMap=new Map(),nameMap=new Map();
 for(const e of scheduleData?.employees||[]){
  const group=rosterGroup(e.group||e.team||'');
  if(!group)continue;
  const keys=[e.empId,e.id,e.attendanceNo,e.attNo,e.attendanceId].filter(Boolean);
  for(const key of keys)idMap.set(String(key).trim().toUpperCase(),group);
  const name=displayPersonName(e.name||e.empName||'');
  if(name){const old=nameMap.get(name);nameMap.set(name,old&&old!==group?null:group)}
 }
 for(const row of scheduleData?.schedules||[]){
  const group=rosterGroup(row.schedule?.__personnel?.group||row.group||'');
  if(!group)continue;
  const id=String(row.empId||row.id||'').trim().toUpperCase();
  if(id)idMap.set(id,group);
  const name=displayPersonName(row.name||row.empName||'');
  if(name){const old=nameMap.get(name);nameMap.set(name,old&&old!==group?null:group)}
 }
 return (people||[]).map(p=>{
  const id=String(p.id||'').trim().toUpperCase(),name=displayPersonName(p.name);
  return {...p,name,group:idMap.get(id)||nameMap.get(name)||rosterGroup(p.group)||''};
 });
}
const isoMonth=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
function importTimestamp(master){
 const values=[master?.workingSheetImportedAt,master?.workingSheetSource?.importedAt].filter(v=>Number.isFinite(Date.parse(String(v||''))));
 return values.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||'';
}
function taipeiDay(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function weeklyWindow(month,today=taipeiDay()){
 const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
 const end=month===today.slice(0,7)?today:last;
 const start=new Date(Date.parse(end+'T12:00:00Z')-6*86400000).toISOString().slice(0,10);
 return {start,end,future:month>today.slice(0,7)};
}
function weeklyEfficiency(vessels,month,today=taipeiDay()){
 const window=weeklyWindow(month,today),days=Array.from({length:7},(_,i)=>({date:new Date(Date.parse(window.start+'T12:00:00Z')+i*86400000).toISOString().slice(0,10),quantity:0,hours:0,count:0,gph:null})),byDate=new Map(days.map(d=>[d.date,d]));
 for(const s of vessels){const day=byDate.get(s.date),qty=s.containers??s.moves;if(!day||s.deleted||!(qty>0)||!(s.rate>0))continue;day.quantity+=qty;day.hours+=qty/s.rate;day.count++;}
 for(const day of days)if(day.hours>0)day.gph=day.quantity/day.hours;
 return {...window,days};
}

function shipCompletionTimestamp(master){
 const ws=master?.workingSheetSource||{};
 // WORKING SHEET LASHING is the actual completion instant; importing a file is not completion.
 const sources=[master?.lashingDateTime,ws.lashingDateTime,master?.actualCompletionDateTime,
  master?.workCompletionDateTime,master?.finishDateTime,master?.completionDateTime,
  ws.actualCompletionDateTime,ws.completionDateTime];
 const pad=v=>String(v).padStart(2,'0');
 for(const raw of sources){
  const m=String(raw??'').trim().match(/^(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i);
  if(!m)continue;
  const year=+m[1],month=+m[2],day=+m[3],hour=+m[4],minute=+m[5],second=+(m[6]||0);
  const check=new Date(Date.UTC(year,month-1,day));
  if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day||hour>23||minute>59||second>59)continue;
  const local=year+'-'+pad(month)+'-'+pad(day)+'T'+pad(hour)+':'+pad(minute)+':'+pad(second);
  if(!m[7])return local; // WORKING SHEET stores Taiwan local wall time with no offset.
  const zone=m[7].replace(/^([+-]\d{2})(\d{2})$/,'$1:$2');
  const instant=new Date(local+zone);
  if(!Number.isFinite(instant.getTime()))continue;
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',
   day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant);
  const fields={};parts.forEach(p=>{if(p.type!=='literal')fields[p.type]=p.value;});
  return fields.year+'-'+fields.month+'-'+fields.day+'T'+fields.hour+':'+fields.minute+':'+fields.second;
 }
 return '';
}
function shipCompletionDate(master,completedAt=shipCompletionTimestamp(master)){
 if(completedAt)return completedAt.slice(0,10);
 const ws=master?.workingSheetSource||{};
 for(const raw of [master?.lashingDate,ws.lashingDate,master?.lastDate,master?._cloudLastDate,
  master?.cloudLastDate,master?.workEndDate,master?.endDate,ws.endDate]){
  const m=String(raw??'').trim().match(/^(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if(!m)continue;
  const y=+m[1],mo=+m[2],d=+m[3],check=new Date(Date.UTC(y,mo-1,d));
  if(check.getUTCFullYear()===y&&check.getUTCMonth()===mo-1&&check.getUTCDate()===d)
   return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');
 }
 return '';
}
function latestCompletedVessels(vessels,limit=5){
 const jobs=new Map(),key=v=>String(v.completedAt||v.completionDate||v.date||'');
 for(const v of vessels||[]){
  if(!v||v.deleted)continue;
  const id=String(v.workingNo||v.name+'|'+v.voyage),prior=jobs.get(id);
  if(!prior||key(v)>key(prior))jobs.set(id,v);
 }
 return [...jobs.values()].sort((a,b)=>key(b).localeCompare(key(a))||
  String(a.workingNo||a.name).localeCompare(String(b.workingNo||b.name))).slice(0,limit);
}
function latestImportedVessels(vessels,limit=5){
 const jobs=new Map();for(const v of vessels){if(v.deleted||!Number.isFinite(Date.parse(String(v.importedAt||''))))continue;const key=v.workingNo||v.name+'|'+v.voyage;const previous=jobs.get(key);if(!previous||Date.parse(v.importedAt)>Date.parse(previous.importedAt))jobs.set(key,v);}
 return [...jobs.values()].sort((a,b)=>Date.parse(b.importedAt)-Date.parse(a.importedAt)||String(a.workingNo).localeCompare(String(b.workingNo))).slice(0,limit);
}
// Read-only ship schedule display. Never use last work date as a fabricated ETA/ETD.
function shipScheduleRows(masters,today=taipeiDay()){
 const clean=v=>String(v??'').trim();
 const timestamp=v=>{
  const x=clean(v);if(!x)return '';
  const match=x.match(/^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/);
  if(!match)return '';
  const yyyy=Number(match[1]),mm=Number(match[2]),dd=Number(match[3]),hh=match[4]===undefined?null:Number(match[4]),minute=match[5]===undefined?null:Number(match[5]);
  const valid=new Date(Date.UTC(yyyy,mm-1,dd));if(valid.getUTCFullYear()!==yyyy||valid.getUTCMonth()!==mm-1||valid.getUTCDate()!==dd||hh!==null&&hh>23||minute!==null&&minute>59)return '';
  return match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0')+(hh===null?'':' '+String(hh).padStart(2,'0')+':'+String(minute).padStart(2,'0'));
 };
 const rows=(masters||[]).filter(m=>m&&m.deleted!==true&&m.isDeleted!==true&&!m.deletedAt).map((m,i)=>{
  const eta=timestamp(first(m,['eta','ETA','etaTime','estimatedArrival','estimatedArrivalTime','plannedArrival','scheduledArrival','arrivalTime','arrivalDate','estimatedBerthTime','planBerthTime'])),
   etd=timestamp(first(m,['etd','ETD','etdTime','estimatedDeparture','estimatedDepartureTime','plannedDeparture','scheduledDeparture','departureTime','departureDate','estimatedSailingTime'])),
   workStart=timestamp(first(m,['firstDate','workStartDate','operationStartDate'])),
   workEnd=timestamp(first(m,['lastDate','_cloudLastDate','workEndDate','endDate','finishTime']));
  const primary=eta||etd||workStart||workEnd;
  const kind=eta?'eta':etd?'etd':workStart?'work':workEnd?'work':'unknown';
  const dateLabel=eta?'預計抵港':etd?'預計離港':workStart?'作業首日':workEnd?'作業末日':'日期未提供';
  const originalStatus=clean(first(m,['status','vesselStatus','operationStatus']));
  return {
   key:clean(m.workingNo)||'ship-'+i,name:clean(first(m,['vesselName','shipName','vessel','name']))||'未填船名',
   voyage:clean(first(m,['voyageE','voyageI','voyage']))||'—',wharf:clean(first(m,['wharf','berth','pier','terminal']))||'—',
   eta,etd,workStart,workEnd,primary,kind,dateLabel,status:originalStatus|| (eta||etd?'船期已登錄':workStart||workEnd?'有作業紀錄':'待補資料'),
   workingNo:clean(m.workingNo)
  };
 });
 const group=r=>r.kind==='unknown'?3:(r.kind!=='work'&&r.primary.slice(0,10)>=today)?0:(r.kind!=='work'?1:2);
 rows.sort((a,b)=>{const ga=group(a),gb=group(b);if(ga!==gb)return ga-gb;return ga===0?a.primary.localeCompare(b.primary):b.primary.localeCompare(a.primary)||a.name.localeCompare(b.name,'zh-TW');});
 return rows;
}
function analyzeVessels(data){
 if(!data||!Array.isArray(data.shipMasters))throw Error('船舶月份資料不完整');
 const versionView=root.P79VesselVersionView||
  (typeof module==='object'&&module.exports&&typeof require==='function'?require('./port79-vessel-versions.js'):null);
 const active=versionView?.collapse?.(data.shipMasters);
 const masters=active?.rows||data.shipMasters;
 const excluded=new Set(active?.excludedWorkingNos||[]);
 const details=(Array.isArray(data.records)?data.records:[]).filter(r=>
  !excluded.has(String(r?.workingNo||'').trim().toUpperCase()));
 let totalMoves=0,validMoves=0,containers=0,validContainers=0,weight=0,weighted=0,rateSum=0,rateCount=0;
 const vessels=masters.map(m=>{
  const moves=numberFrom(m,['totalMoves','sheetTotalMoves'])??(
    (numberFrom(m,['disc'])!==null&&numberFrom(m,['load'])!==null)?
    numberFrom(m,['disc'])+numberFrom(m,['load']):null
  );
  const boxes=numberFrom(m,['totalContainers','ttlCtnr','TTLCtnr','containerCount']);
  const rate=numberFrom(m,['gph','shipGph']);
  const completedAt=shipCompletionTimestamp(m),completionDate=shipCompletionDate(m,completedAt);
  if(moves!==null){totalMoves+=moves;validMoves++}
  if(boxes!==null){containers+=boxes;validContainers++}
  if(rate!==null&&rate>=0){rateSum+=rate;rateCount++;if(moves!==null&&moves>0){weight+=moves;weighted+=rate*moves}}
  return {name:String(first(m,['vesselName','shipName','vessel','name'])||'未填船名'),
   chineseName:String(first(m,['vesselChineseName','chineseName','localName','shipNameChinese'])||'').trim(),
   workingNo:String(m.workingNo||''),voyage:String(first(m,['voyageE','voyageI','voyage'])||''),
   // 與正式船舶管理系統的「碼頭」欄位一致，不推測缺失的靠泊資料。
   wharf:String(first(m,['wharf','berth','berthNo','terminal','pier'])??first(m.workingSheetSource,['wharf','berth','berthNo','terminal','pier'])??'').trim(),
   moves,containers:boxes,rate,completedAt,completionDate,importedAt:importTimestamp(m),deleted:m.deleted===true||m.isDeleted===true||!!m.deletedAt,date:attendanceDate({date:first(m,['_cloudLastDate','lastDate','endDate','finishTime'])}),hours:null,status:String(m.status||'')};
 });
 vessels.sort((a,b)=>(b.moves??-1)-(a.moves??-1));
 const people=new Map(),jobHours=new Map();let workHours=0,timedRows=0;
 for(const r of details){
  if(!r||typeof r!=='object')continue;
  const hours=numberFrom(r,['timeHours','workingHours','effectiveHours']);
  if(hours!==null&&hours>0){workHours+=hours;timedRows++;const job=String(r.workingNo||'');jobHours.set(job,(jobHours.get(job)||0)+hours)}
  const id=String(first(r,['empId','employeeId','attNo'])||'').trim();
  const name=displayPersonName(first(r,['name','employeeName']));
  if(!id&&!name)continue;
  const key=id||'NAME:'+name;
  const p=people.get(key)||{name:name||id,id,dept:String(first(r,['dept','department','unit'])||'—'),group:rosterGroup(first(r,['group','employeeGroup','team'])),moves:0,validMoves:0,timedMoves:0,hours:0,hatches:0,validHatches:0};
  if(!p.group)p.group=rosterGroup(first(r,['group','employeeGroup','team']));
  // Hatch covers (H/C) are a separate measure from container Moves.
  // An absent hatch field is unknown, not an invented zero.
  const hatchCount=numberFrom(r,['hatches','hatchCover','hatchCovers','hatchCoverCount','hc']);
  if(hatchCount!==null&&hatchCount>=0){p.hatches+=hatchCount;p.validHatches++;}
  const moves=numberFrom(r,['totalMoves','moves','containers'])??(
   numberFrom(r,['disc'])!==null&&numberFrom(r,['load'])!==null?
   numberFrom(r,['disc'])+numberFrom(r,['load']):null);
  if(moves!==null&&moves>=0){p.moves+=moves;p.validMoves++;if(hours!==null&&hours>0){p.hours+=hours;p.timedMoves+=moves}}
  people.set(key,p);
 }
 for(const v of vessels)v.hours=jobHours.get(v.workingNo)??null;
 const personRows=[...people.values()].filter(p=>p.validMoves>0).map(p=>({...p,hatches:p.validHatches>0?p.hatches:null,efficiency:p.hours>0?p.timedMoves/p.hours:null})).sort((a,b)=>(b.efficiency??-1)-(a.efficiency??-1)||b.moves-a.moves);
 return {count:masters.length,moves:validMoves?totalMoves:null,containers:validContainers?containers:null,
  averageGph:weight>0?weighted/weight:rateCount?rateSum/rateCount:null,
  vessels,scheduleRows:shipScheduleRows(masters),people:personRows,workHours:timedRows?workHours:null,timedRows,detailCount:details.length,completeness:{moves:validMoves,containers:validContainers,total:masters.length}};
}
function attendanceDate(r){
 const raw=first(r,['timeStr','datetime','dateTime','timestamp','attendanceTime','clockTime','workDate','date']);
 if(typeof raw==='number')return new Date(raw).toISOString().slice(0,10);
 const m=String(raw??'').match(/(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
 return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):'';
}

function p79HomePunchMs(value){
 const m=String(value||'').trim().match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
 return m?Date.parse(m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0')+'T'+m[4].padStart(2,'0')+':'+m[5]+':'+(m[6]||'00')+'+08:00'):NaN;
}
function p79HomePendingTiming(shift,date,scheduleData,now){
 const norm=v=>String(v||'').trim().toUpperCase();
 const roster=Array.isArray(scheduleData?.schedules)?scheduleData.schedules:[];
 let matched=roster.filter(r=>shift.empId&&norm(r.empId||r.id)===norm(shift.empId));
 if(matched.length!==1)matched=roster.filter(r=>shift.attNo&&norm(r.attNo||r.attendanceNo).replace(/^0+/,'')===norm(shift.attNo).replace(/^0+/,''));
 if(matched.length!==1)matched=roster.filter(r=>shift.name&&norm(displayPersonName(r.name||r.empName))===norm(displayPersonName(shift.name)));
 const record=matched.length===1?matched[0]:null,code=String(record?.schedule?.[date]||'').trim();
 const inMs=p79HomePunchMs(shift.clockIn?.timeStr);
 const ranges={早:[8,16],中:[16,24],晚:[24,32]};
 let hours=ranges[code];
 if(!hours){
  const m=code.match(/^(\d{1,2})(?::(\d{2}))?\s*[-~～至]\s*(\d{1,2})(?::(\d{2}))?$/);
  if(m){
   const begin=Number(m[1])+Number(m[2]||0)/60;let finish=Number(m[3])+Number(m[4]||0)/60;
   if(finish<=begin)finish+=24;
   if(begin<=32&&finish<=48&&Number(m[2]||0)<60&&Number(m[4]||0)<60)hours=[begin,finish];
  }
 }
 const base=Date.parse(date+'T00:00:00+08:00');
 let end=hours&&Number.isFinite(base)?base+hours[1]*3600000:NaN;
 if(Number.isFinite(end)){
  const meta=record?.schedule?.__meta?.[date]||{};
  if(meta.overtime===true||meta.overtimeReport||meta.restQuotaOvertime||meta.forEmpId){
   const m=String(meta.overtimeEnd||meta.overtimeReport?.endTime||'').match(/^(\d{1,2}):(\d{2})$/);
   if(m&&Number(m[1])<=24&&Number(m[2])<60){
    let finish=Number(m[1])+Number(m[2])/60;
    if(finish<=hours[0])finish+=24;
    if(finish>hours[1]&&finish<=48)end=base+finish*3600000;
   }
  }
 }
 // If the official shift is absent or inconsistent with clock-in, do not assume the shift ended.
 const reliable=Number.isFinite(end)&&Number.isFinite(inMs)&&end>inMs&&end-inMs<=24*3600000;
 const reviewAfter=reliable?end+60*60000:Number.isFinite(inMs)?inMs+24*3600000:NaN;
 return {shift:code,stillWorking:Number.isFinite(reviewAfter)&&now<reviewAfter,reviewAfter};
}
function analyzeAttendance(data,month,boundaryRecords,reviewOptions={}){
 if(!data||!Array.isArray(data.records))throw Error('考勤月份資料不完整');
 const records=data.records,uniquePeople=new Set(),peopleDays=new Set(),weeks=[0,0,0,0,0],seenWeeks=Array.from({length:5},()=>new Set());
 let punchIn=0,punchOut=0,other=0;const now=Number.isFinite(reviewOptions.now)?reviewOptions.now:Date.now();const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)),todayPeople=new Set(),todayLatest=new Map();
 for(const r of records){
  const id=String(first(r,['empId','employeeId','attNo','name','employeeName'])||'').trim();
  if(id)uniquePeople.add(id);
  const day=attendanceDate(r);if(day.startsWith(month)){
   if(id&&/上班|簽到|clock.?in|check.?in/i.test(String(first(r,['type','action','status'])||'')))peopleDays.add(id+'|'+day);
   const week=Math.min(4,Math.max(0,Math.floor((Number(day.slice(8,10))-1)/7)));
   weeks[week]++;
   if(id&&/上班|簽到|clock.?in|check.?in/i.test(String(first(r,['type','action','status'])||'')))seenWeeks[week].add(id);
  }
  const status=String(first(r,['type','action','status'])||'');
  if(day===today&&id){if(/上班|簽到|clock.?in|check.?in/i.test(status))todayPeople.add(id);const stamp=String(first(r,['timeStr','datetime','dateTime','timestamp'])||'');if(!todayLatest.has(id)||stamp>todayLatest.get(id).stamp)todayLatest.set(id,{stamp,status})}
  if(/上班|簽到|clock.?in|check.?in/i.test(status))punchIn++;
  else if(/下班|簽退|clock.?out|check.?out/i.test(status))punchOut++;
  else other++;
 }
 const reviewShifts=root.P79AttendanceV6?.buildShifts?root.P79AttendanceV6.buildShifts(Array.isArray(boundaryRecords)&&boundaryRecords.length?records.concat(boundaryRecords):records).filter(s=>{
  const date=String(s.accountingDateKey||s.dateKey||'').replaceAll('/','-');
  if(!date.startsWith(month+'-')||date>today||s.clockIn&&s.clockOut&&!s.timePrecisionIssue)return false;
   if(s.clockIn&&!s.clockOut&&!s.timePrecisionIssue&&p79HomePendingTiming(s,date,reviewOptions.scheduleData,now).stillWorking)return false;
   return date<today;
 }):null;
 const pendingDetails=reviewShifts===null?null:reviewShifts.map((s,i)=>({
  key:String(s.key||i),date:String(s.accountingDateKey||s.dateKey||'').replaceAll('/','-'),
  empId:String(s.empId||''),attNo:String(s.attNo??''),name:displayPersonName(s.name)||'姓名未提供',
  dept:String(s.dept||''),unit:String(s.unit||''),group:'',jobTitle:String(s.jobTitle||''),shift:p79HomePendingTiming(s,String(s.accountingDateKey||s.dateKey||'').replaceAll('/','-'),reviewOptions.scheduleData,now).shift,
  clockIn:String(s.clockIn?.timeStr||''),clockOut:String(s.clockOut?.timeStr||''),
  clockInRecordId:String(s.clockIn?.id??''),clockOutRecordId:String(s.clockOut?.id??''),
  reason:s.timePrecisionIssue?'原始打卡時間不完整':!s.clockIn&&!s.clockOut?'上下班皆無卡':!s.clockIn?'缺少上班卡':!s.clockOut?'缺少下班卡':'打卡時間待核',
  explanation:s.timePrecisionIssue?'原始打卡紀錄缺少完整時間，無法可靠核對上下班。':!s.clockIn?'目前只有下班打卡，系統沒有找到同一員工可配對的上班卡。':!s.clockOut?'目前只有上班打卡，系統沒有找到同一員工可配對的下班卡。':'此班次的打卡時間需要人工核對。',
  suggestion:s.timePrecisionIssue?'請確認原始日期與完整時分秒；補正後重新核對。':!s.clockIn?'請核對當日與前後跨日紀錄、工號及上下班卡方向；必要時補登上班卡。':!s.clockOut?'請核對當日與隔日的下班卡、打卡方向及工號；必要時補登下班卡。':'請核對班別與原始打卡。',
  pairReason:String(s.v6PairReason||''),note:String(s.noteText||'')
 })).sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'zh-TW'));
 return {recordCount:records.length,peopleCount:uniquePeople.size,personDays:peopleDays.size,
   punchIn,punchOut,other,weeks,today,todayCount:todayPeople.size,todayOnDuty:[...todayPeople].filter(id=>/上班|簽到|clock.?in|check.?in/i.test(todayLatest.get(id)?.status||'')).length,weeklyPeople:seenWeeks.map(s=>s.size),pendingShifts:pendingDetails===null?null:pendingDetails.length,pendingDetails};
}
function p79HomeScheduleObject(row){
 if(row?.schedule&&typeof row.schedule==='object'&&!Array.isArray(row.schedule))return row.schedule;
 for(const value of [row?.schedule,row?.scheduleJson,row?.fullScheduleJSON,row?.fullScheduleJson]){
  if(typeof value!=='string'||!value.trim())continue;
  try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return parsed;}catch(_){}
 }
 return {};
}
function p79HomeOvertimeDate(raw,report,month){
 const date=String(report?.overtimeDate||raw||'').trim().replaceAll('/','-');
 if(/^20\d{2}-\d{2}-\d{2}$/.test(date)){
  const parsed=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===date?date:'';
 }
 if(/^\d{1,2}$/.test(date)){
  const day=Number(date),candidate=month+'-'+String(day).padStart(2,'0');
  const parsed=Date.parse(candidate+'T00:00:00Z');
  if(day>=1&&day<=31&&Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===candidate)return candidate;
 }
 return '';
}
function analyzeOvertime(data,month){
 if(!data||!Array.isArray(data.schedules))throw Error('排班月份資料不完整');
 const titles=new Map(),roster=new Map(),people=new Map(),seen=new Set(),details=[];
 let hours=0,count=0,declaredSubmittedHours=0,convertedHours=0,missingConversion=0,officialCount=0,plannedCount=0,plannedHours=0;
 const key=v=>String(v??'').trim().toUpperCase();
 const ensure=title=>{if(!titles.has(title))titles.set(title,{title,hours:0,count:0,actualHours:0,convertedHours:0,officialCount:0,missingConversion:0});return titles.get(title);};
 for(const e of data.employees||[]){
  const title=String(e.jobTitle||e.deptDetail||e.position||e.role||'').trim();
  if(!title)continue;
  const id=key(e.empId||e.id);
  if(id){
   roster.set(id,title);
   people.set(id,{name:String(e.name||e.fullName||'').trim(),dept:String(e.dept||e.department||'').trim(),title});
  }
  ensure(title);
 }
 for(const row of data.schedules){
  const schedule=p79HomeScheduleObject(row),personnel=schedule.__personnel||{};
  const title=roster.get(key(row.empId||row.id))||
    String(row.jobTitle||row.deptDetail||row.position||row.role||personnel.jobTitle||personnel.role||'').trim()||'未設定職稱';
  const item=ensure(title);
  for(const [rawDate,meta] of Object.entries(schedule.__meta||{})){
   const r=meta?.overtimeReport;
   const date=p79HomeOvertimeDate(rawDate,r,month);
   if(!date.startsWith(month+'-')||!r?.id||seen.has(String(r.id))||
      r.deleted===true||r.isDeleted===true||r.revoked===true||r.cancelled===true||r.canceled===true||
      !!r.deletedAt||!!r.cancelledAt||!!r.canceledAt||meta?.overtimeExcluded===true||
      (meta?.overtimeRevocations||[]).some(x=>x?.confirmed===true&&String(x.reportId||'')===String(r.id))||
      /撤銷|刪除|取消|revoked|cancel/i.test(String(r.status||'')))continue;
   const h=num(r.declaredHours??r.rule?.declaredHours);
   if(h===null||h<0)continue;
   seen.add(String(r.id));hours+=h;count++;item.hours+=h;item.count++;
   // Only a persisted conversion on a formally submitted report is authoritative.
   // Do not derive historical payroll hours from today's rules, nor count plans.
   const planned=r.planned===true||/預排|尚未申報|待排/.test(String(r.status||''));
   const savedConverted=num(r.convertedHours);
   const converted=!planned&&savedConverted!==null&&savedConverted>=0?savedConverted:null;
   if(planned){plannedCount++;plannedHours+=h;}
   else{
    officialCount++;item.officialCount++;declaredSubmittedHours+=h;item.actualHours+=h;
    if(converted===null){missingConversion++;item.missingConversion++;}
    else{convertedHours+=converted;item.convertedHours+=converted;}
   }
   const person=people.get(key(row.empId||row.id))||{};
   details.push({
    id:String(r.id),date,empId:key(row.empId||row.id),
    name:person.name||String(row.name||row.empName||personnel.name||'').trim()||'—',
    dept:person.dept||String(row.dept||row.department||'').trim(),
    title,code:String(r.code||''),typeName:String(r.typeName||''),
    declaredHours:h,convertedHours:converted,planned,
    status:planned?'預排／待核對':'已申報'
   });
  }
 }
 const titleRows=[...titles.values()];
 return {month,hours,count,declaredSubmittedHours,convertedHours,missingConversion,officialCount,plannedCount,plannedHours,
  actualRows:titleRows.filter(r=>r.officialCount>0).map(r=>({title:r.title,hours:r.actualHours,count:r.officialCount})).sort((a,b)=>b.hours-a.hours||a.title.localeCompare(b.title,'zh-TW')),
  rows:titleRows.sort((a,b)=>b.hours-a.hours||a.title.localeCompare(b.title,'zh-TW')),
  convertedRows:titleRows.filter(r=>r.officialCount>0).map(r=>({title:r.title,hours:r.convertedHours,count:r.officialCount,missingConversion:r.missingConversion}))
   .sort((a,b)=>b.hours-a.hours||a.title.localeCompare(b.title,'zh-TW')),
  details:details.sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'zh-TW')||a.id.localeCompare(b.id))};
}
const api={analyzeVessels,analyzeAttendance,analyzeOvertime,attendanceDate,importTimestamp,shipCompletionTimestamp,shipCompletionDate,latestCompletedVessels,weeklyWindow,weeklyEfficiency,latestImportedVessels,shipScheduleRows,displayPersonName,rosterGroup,assignPersonGroups};
if(typeof module==='object'&&module.exports)module.exports=api;
root.P79MonthlyDashboard=api;
if(!root.document)return;
let overtimeDisplayMode='actual',lastOvertimeData=null;
let loadedKey='',loading=false,sessionStamp='',pendingReviewItems=null,pendingReviewMonth='',pendingReviewDialog=null,pendingReviewSelection=-1,lastPendingReadAt=0,pendingReviewRefreshing=false,pendingReviewError='',pendingReviewVerifiedAt='';
function session(){try{return JSON.parse(root.sessionStorage.getItem('port79_user_session')||'null')}catch(_){return null}}
function permissions(){
 const s=session(),role=String(s?.adminRole||s?.role||'').toLowerCase();
 if(!s||s.punchOnly||!['admin','superadmin'].includes(role))return {vessel:false,attendance:false,schedule:false};
 if(role==='superadmin')return {vessel:true,attendance:true,schedule:true};
 const fine=s.finePermissions?.history||{};
 const allow=String(s.systemPermissions?.history||'none')!=='none';
 return {vessel:allow&&fine['vessel.view']===true,attendance:allow&&fine['attendance.view']===true,schedule:allow&&fine['schedule.view']===true};
}
function statusText(id,value){const e=$(id);if(e)e.textContent=value}
function setMetric(id,value){statusText(id,value)}
// 待核 KPI 僅依正式檢核結果變色。未知狀態不當作零筆，零筆不使用警示紅。
function setPendingReviewVisualState(state){
 const card=$('p79DashPendingReviewTrigger')||$('p79DashAnomalies')?.closest('.p79d-kpi');
 if(!card)return;
 const kind=['clear','pending','unverified'].includes(state)?state:'unverified';
 card.dataset.reviewState=kind;
 const icon=card.querySelector('.p79d-kpi-icon');
 if(icon)icon.textContent=kind==='clear'?'✓':kind==='pending'?'!':'?';
 card.setAttribute('aria-label',kind==='clear'?'本月沒有待核班次，點擊查看核對明細':kind==='pending'?'本月有打卡待核班次，點擊查看異常明細':'本月待核資料尚未核對完成，點擊查看明細');
}
function options(){return new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'long'}).format(new Date((month()||isoMonth())+'-01T00:00:00'))}
function month(){return $('p79DashMonth')?.value||isoMonth()}
function selectedMonthTitle(){const [y,m]=(month()||isoMonth()).split('-');return y+'年'+Number(m)+'月'}
function checkMonth(){const m=month();if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m))throw Error('請選擇正確月份');return m}
function formatBars(id,values,labels){
 const container=$(id);if(!container)return;
 if(!values||!values.length||values.every(n=>n===0)){container.replaceChildren();container.textContent='這個月份沒有可繪製的資料';return}
 const max=Math.max(1,...values);
 container.innerHTML=values.map((v,i)=>'<div class="p79d-bar-col"><span class="p79d-bar-value">'+fmt(v)+'</span><span class="p79d-bar" style="height:'+Math.max(3,Math.round(90*v/max))+'px"></span><span class="p79d-bar-label">'+esc(labels[i]||'')+'</span></div>').join('');
}
function vesselTrend(v){
 const ranked=[...v.vessels].filter(x=>x.moves!==null).sort((a,b)=>b.moves-a.moves).slice(0,12).reverse();
 formatBars('p79DashShipBars',ranked.map(x=>x.moves),ranked.map(x=>x.name.length>8?x.name.slice(0,8)+'…':x.name));
}
function vesselTable(v){
 const el=$('p79DashShipRanking');if(!el)return;
 if(!v.vessels.length){el.innerHTML='<tr><td colspan="6">本月沒有船舶資料</td></tr>';return}
 el.innerHTML=v.vessels.slice(0,6).map((s,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.workingNo)+'</td><td>'+fmt(s.moves)+'</td><td>'+fmt(s.rate,2)+'</td></tr>').join('');
}
function peopleTable(v){
 const el=$('p79DashPeopleRanking');if(!el)return;
 if(!v.people.length){el.innerHTML='<tr><td colspan="5">本月尚無可核對的個人作業明細</td></tr>';return}
 el.innerHTML=v.people.map((p,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(p.name)+'</td><td>'+fmt(p.moves)+'</td><td>'+fmt(p.hatches)+'</td><td>'+fmt(p.efficiency,2)+'</td></tr>').join('');
}
function showVessels(v){
 setMetric('p79DashShipCount',fmt(v.count));setMetric('p79DashMoves',fmt(v.moves));
 setMetric('p79DashContainers',fmt(v.containers));setMetric('p79DashGph',fmt(v.averageGph,2));setMetric('p79DashWorkHours',fmt(v.workHours,1));
 statusText('p79DashWorkHoursNote',v.timedRows<v.detailCount?'部分明細有有效工時':'依有效作業明細');
 vesselTable(v);vesselTrend(v);peopleTable(v);
 statusText('p79DashShipSource','已載入本月船舶歷史資料｜作業量為 Moves；效率為既有 GPH 欄位平均；缺少的欄位不以 0 代替。');
 root.P79ReferenceDashboard?.vessels(v);
 statusText('p79DashPersonSource','個人效率＝有有效工時的作業明細 Moves ÷ 對應工時（參考值）；未提供工時者顯示「—」。');
}
function renderHomeOvertimeList(data){
 const list=$('p79DashOvertimeRecords'),section=$('p79DashOvertimeList');
 if(!list||!section)return;
 // This screen is READ ONLY. The work-hours subsystem owns all mutations.
 if(!permissions().schedule){
  list.replaceChildren();section.hidden=true;return;
 }
 section.hidden=false;list.replaceChildren();
 const rows=Array.isArray(data?.details)?data.details:[];
 statusText('p79DashOvertimeCount','共 '+rows.length+' 筆（含預排）');
 if(!rows.length){
  const tr=root.document.createElement('tr'),td=root.document.createElement('td');
  td.colSpan=8;td.textContent=data?.sourceWarning?'即時加班資料尚未核對完成；歷史快照目前無可顯示紀錄':'本月沒有可查詢的加班申報紀錄';
  tr.append(td);list.append(tr);return;
 }
 for(const item of rows.slice(0,100)){
  const tr=root.document.createElement('tr');
  for(const value of [item.date,item.name,item.dept,item.title,
    item.code||item.typeName,item.declaredHours+' 小時',
    item.planned?'預排':item.convertedHours===null?'待換算':fmt(item.convertedHours,2)+' 小時',item.status]){
   const td=root.document.createElement('td');td.textContent=String(value||'—');tr.append(td);
  }
  list.append(tr);
 }
 if(rows.length>100)statusText('p79DashOvertimeCount',
  '共 '+rows.length+' 筆（含預排）；首頁先顯示最新100筆，完整明細請到加班管理');
}
function showOvertime(a){
 lastOvertimeData=a;
 const unverified=!!a.sourceWarning,missing=Number(a.missingConversion)||0,actual=overtimeDisplayMode==='actual';
 const value=unverified?'待核對':actual?fmt(a.declaredSubmittedHours,1):missing?'待換算':fmt(a.convertedHours,2);
 setMetric('p79DashOvertimeHours',value);
 setMetric('p79DashOvertimeUnit',unverified||!actual&&missing?'':'小時');
 statusText('p79DashOvertimeLabel','本月申報加班');
 const unreportedLong=unverified?'未申報／預排資料待核對':
  '另計：未申報／預排（已有紀錄） '+a.plannedCount+' 筆／'+fmt(a.plannedHours,1)+' 小時（不計入）';
 statusText('p79DashOvertimeUnreported',unverified?'未報待核':
  '未報／預排 '+a.plannedCount+'筆·'+fmt(a.plannedHours,1)+'h');
 $('p79DashOvertimeUnreported')?.setAttribute?.('title',unreportedLong);
 $('p79DashOvertimeLabel')?.setAttribute?.('title',actual?'本月已申報實際時數':'本月已申報換算時數');
 const note=unverified?'· 即時班表未核對；正式加班總數暫不可確認':
  missing?'· 已申報 '+a.officialCount+' 筆：實際 '+fmt(a.declaredSubmittedHours,1)+' 小時；其中 '+missing+' 筆缺換算值，換算總數待核對':
  '· 已申報 '+a.officialCount+' 筆：實際 '+fmt(a.declaredSubmittedHours,1)+' 小時 → 換算 '+fmt(a.convertedHours,2)+' 小時；另列未申報／預排 '+a.plannedCount+' 筆';
 statusText('p79DashScheduleSource',note);
 const buttons=$('p79DashOvertimeMode');
 buttons?.querySelectorAll?.('[data-overtime-mode]').forEach(btn=>{
  const active=btn.dataset.overtimeMode===overtimeDisplayMode;
  btn.classList.toggle('active',active);
  btn.setAttribute('aria-pressed',String(active));
 });
 renderHomeOvertimeList(a);
 root.P79ReferenceDashboard?.setOvertimeMode?.(overtimeDisplayMode);
 root.P79ReferenceDashboard?.setOvertimeReport(a);
}
function setOvertimeDisplayMode(mode){
 if(!['actual','converted'].includes(mode)||mode===overtimeDisplayMode)return;
 overtimeDisplayMode=mode;
 if(lastOvertimeData)showOvertime(lastOvertimeData);
 else{
  $('p79DashOvertimeMode')?.querySelectorAll?.('[data-overtime-mode]').forEach(btn=>{
   const active=btn.dataset.overtimeMode===mode;
   btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));
  });
  statusText('p79DashOvertimeLabel','本月申報加班');
  $('p79DashOvertimeLabel')?.setAttribute?.('title',mode==='actual'?'本月已申報實際時數':'本月已申報換算時數');
  root.P79ReferenceDashboard?.setOvertimeMode?.(mode);
 }
}
function ensurePendingReview(){
 if(pendingReviewDialog)return;
 const card=$('p79DashAnomalies')?.closest('.p79d-kpi');if(!card)return;
 const nativeButton=card.tagName==='BUTTON';
 if(!nativeButton){card.tabIndex=0;card.setAttribute('role','button');}
 card.setAttribute('aria-haspopup','dialog');card.setAttribute('aria-label','查看本月打卡待核錯誤與原因');card.classList.add('p79-review-card');
 card.addEventListener('click',openPendingReview);
 if(!nativeButton)card.addEventListener('keydown',e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openPendingReview();}});
 const style=root.document.createElement('style');
 style.textContent=[
 '.p79-review-card{cursor:pointer}.p79-review-card:hover{box-shadow:0 6px 20px #15375c25}',
 '.p79-review-card:focus-visible{outline:3px solid #2463ae;outline-offset:2px}',
 '.p79-review-head-note{font-size:12px;color:#5b6e84;line-height:1.6;margin:6px 0 12px}',
 '.p79-review-detail p{line-height:1.65;margin:9px 0;padding:10px 12px;border:1px solid #dde9f5;border-radius:8px}',
 '.p79-review-detail .p79-review-cause{background:#fff8ed;color:#875017;border-color:#f9d2a5}',
 '.p79-review-detail .p79-review-advice{background:#eff7ff;color:#194e7f;border-color:#bedcfa}',
 '.p79-review-detail p b{display:block;margin-bottom:4px}',
 '.p79-review-status{display:block;font-size:12px;color:#526883;margin:3px 0}',
 '#p79PendingReviewDialog{width:min(1050px,calc(100vw - 24px));max-height:85vh;border:0;border-radius:14px;padding:0;background:#fff;color:#17365b;box-shadow:0 20px 60px #0005}',
 '#p79PendingReviewDialog::backdrop{background:#12243e99}',
 '.p79-review-wrap{padding:20px;max-height:85vh;overflow:auto}',
 '.p79-review-head{display:flex;justify-content:space-between;gap:16px;align-items:center}',
 '.p79-review-head h2{margin:0;font-size:19px}',
 '.p79-review-head button{cursor:pointer;padding:7px 11px;border:0;border-radius:7px;background:#edf2f8}',
 '.p79-review-sub{color:#697b91;margin:7px 0 14px;font-size:13px}',
 '.p79-review-scroll{width:100%;overflow:auto}',
 '.p79-review-table{border-collapse:collapse;width:100%;min-width:790px;font-size:13px}',
 '.p79-review-table th,.p79-review-table td{padding:10px;text-align:left;border-bottom:1px solid #e4e9f0;white-space:nowrap}',
 '.p79-review-table th{background:#eff5fb;color:#365370}',
 '.p79-review-table tbody tr{cursor:pointer}.p79-review-table tbody tr:hover,.p79-review-table tbody tr:focus,.p79-review-table tbody tr.selected{background:#eaf4ff;outline:0}',
 '.p79-review-issue{color:#c04b3a;font-weight:700}',
 '.p79-review-detail{margin-top:14px;padding:14px;background:#f7fafd;border:1px solid #dce7f3;border-radius:9px}',
 '.p79-review-detail dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:9px 16px;margin:10px 0}',
 '.p79-review-detail dt{font-size:12px;color:#61738b}',
 '.p79-review-detail dd{margin:3px 0 0;overflow-wrap:anywhere}',
 '.p79-review-detail button{border:0;background:#1d62ad;color:white;border-radius:7px;padding:9px 13px;cursor:pointer}',
 '.p79-review-empty{text-align:center;padding:18px;color:#62748b}'
 ].join('\n');root.document.head.appendChild(style);
 pendingReviewDialog=root.document.createElement('dialog');pendingReviewDialog.id='p79PendingReviewDialog';
 pendingReviewDialog.setAttribute('aria-labelledby','p79PendingReviewTitle');
 pendingReviewDialog.innerHTML='<div class="p79-review-wrap"><header class="p79-review-head"><h2 id="p79PendingReviewTitle">本月打卡待核明細</h2><button type="button" data-review-close aria-label="關閉明細">✕</button></header><p class="p79-review-sub" id="p79PendingReviewCaption"></p><span class="p79-review-status" id="p79PendingReviewFreshness"></span><p class="p79-review-head-note">待核是系統自動偵測的打卡配對問題，不等於認定員工缺勤。請確認原始紀錄後再修正。</p><div id="p79PendingReviewRows"></div></div>';
 root.document.body.appendChild(pendingReviewDialog);
 pendingReviewDialog.addEventListener('click',e=>{
  if(e.target===pendingReviewDialog||e.target.closest('[data-review-close]')){pendingReviewDialog.close();return;}
  if(e.target.closest('[data-review-attendance]')){if(permissions().attendance&&typeof root.launchSystem==='function')root.launchSystem('attendance');return;}
  const row=e.target.closest('[data-review-index]');
  if(row){pendingReviewSelection=Number(row.dataset.reviewIndex);renderPendingReview();}
 });
 pendingReviewDialog.addEventListener('keydown',e=>{
  const row=e.target.closest('[data-review-index]');
  if(row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();pendingReviewSelection=Number(row.dataset.reviewIndex);renderPendingReview();}
 });
}
function openPendingReview(){
 if(!permissions().attendance)return;
 ensurePendingReview();if(!pendingReviewDialog)return;
 // 未完成即時核對以前，不再先展示可能過期的快取異常名單。
 pendingReviewItems=null;pendingReviewSelection=-1;pendingReviewError='';pendingReviewVerifiedAt='';
 setMetric('p79DashAnomalies','—');
 setPendingReviewVisualState('unverified');
 statusText('p79DashReviewHint','正在核對雲端正式考勤…');
 renderPendingReview();if(!pendingReviewDialog.open)pendingReviewDialog.showModal();
 refreshPendingReviewFromCloud();
}
async function refreshPendingReviewFromCloud(){
 if(pendingReviewRefreshing||!permissions().attendance||!pendingReviewDialog?.open)return;
 const ym=month(),token=root.sessionStorage.getItem('port79_user_token')||root.sessionStorage.getItem('port79_admin_token')||'',empId=String(session()?.empId||'');
 if(!token||!empId){pendingReviewError='管理員登入資料不足';renderPendingReview();return;}
 pendingReviewRefreshing=true;pendingReviewError='';renderPendingReview();
 try{
  const data=await request('attendance',ym,token,true);
  if(!pendingReviewDialog.open||month()!==ym||session()?.empId!==empId||
    (root.sessionStorage.getItem('port79_user_token')||root.sessionStorage.getItem('port79_admin_token')||'')!==token||!permissions().attendance)return;
  if(!Array.isArray(data.records))throw Error('雲端考勤明細格式不完整');
  const scheduleData=permissions().schedule?await request('schedule',ym,token,true).catch(()=>null):null;
  const leaveData=await requestApprovedLeave(token).catch(()=>null);
  const checked=await verifyAttendancePendingWithOfficial(data,ym,token,scheduleData);
  showAttendance(checked);
  await renderVerifiedHomePunch(checked.boundaryError?null:data,scheduleData,ym,leaveData,token);
  if(scheduleData)enrichPendingReview(scheduleData);
  if(checked.boundaryError)pendingReviewError=checked.boundaryError;
  pendingReviewVerifiedAt=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
  lastPendingReadAt=Date.now();
 }catch(error){pendingReviewError=String(error?.message||error);}
 finally{pendingReviewRefreshing=false;renderPendingReview();}
}
function renderPendingReview(){
 if(!pendingReviewDialog||!permissions().attendance)return;
 const rows=pendingReviewItems,monthKey=pendingReviewMonth||month();
 statusText('p79PendingReviewFreshness',pendingReviewRefreshing?'正在核對雲端正式考勤…':pendingReviewError?'雲端重新核對失敗：'+pendingReviewError:pendingReviewVerifiedAt?'最近核對：'+pendingReviewVerifiedAt:'依首頁已載入的考勤資料');
 statusText('p79PendingReviewTitle',monthKey.slice(0,4)+'年'+Number(monthKey.slice(5))+'月打卡待核明細');
 statusText('p79PendingReviewCaption',Array.isArray(rows)?'共 '+rows.length+' 筆待核班次，點擊一列即可查看完整資訊':'考勤資料尚未完成載入');
 const host=$('p79PendingReviewRows');if(!host)return;
 if(!Array.isArray(rows)){host.innerHTML='<p class="p79-review-empty">考勤明細尚未讀齊，請更新首頁資料。</p>';return;}
 if(!rows.length){host.innerHTML='<p class="p79-review-empty">所選月份目前沒有待核班次。</p>';return;}
 if(pendingReviewSelection>=rows.length)pendingReviewSelection=-1;
 const selected=rows[pendingReviewSelection];
 host.innerHTML='<div class="p79-review-scroll"><table class="p79-review-table"><thead><tr><th>日期</th><th>員工姓名</th><th>工號／考勤號</th><th>部門／組別</th><th>班別</th><th>上班卡</th><th>下班卡</th><th>待核原因</th></tr></thead><tbody>'+
 rows.map((r,i)=>'<tr data-review-index="'+i+'" tabindex="0" class="'+(i===pendingReviewSelection?'selected':'')+'"><td>'+esc(r.date)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.empId||r.attNo||'—')+'</td><td>'+esc([r.dept,r.unit,r.group].filter(Boolean).join('／')||'—')+'</td><td>'+esc(r.shift||'—')+'</td><td>'+esc(r.clockIn||'—')+'</td><td>'+esc(r.clockOut||'—')+'</td><td class="p79-review-issue">'+esc(r.reason)+'</td></tr>').join('')+
 '</tbody></table></div>'+
 (selected?'<section class="p79-review-detail"><strong>'+esc(selected.name)+'｜'+esc(selected.date)+'｜'+esc(selected.reason)+'</strong><dl>'+
 [['工號',selected.empId],['考勤號',selected.attNo],['部門',selected.dept],['組別',selected.group],['班別',selected.shift],['職稱',selected.jobTitle],['上班卡時間',selected.clockIn],['下班卡時間',selected.clockOut],['上班卡紀錄ID',selected.clockInRecordId],['下班卡紀錄ID',selected.clockOutRecordId],['備註',selected.note]].map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value||'—')+'</dd></div>').join('')+
 '</dl><p class="p79-review-cause"><b>系統為什麼列為待核？</b>'+esc(selected.explanation||selected.reason)+'</p><p class="p79-review-advice"><b>建議核對方式</b>'+esc(selected.suggestion||'請核對原始打卡紀錄與班別。')+'</p><button type="button" data-review-attendance>前往考勤管理核對 ›</button></section>':'<p class="p79-review-empty">選取上方紀錄即可查看打卡明細。</p>');
}
function enrichPendingReview(data){
 if(!Array.isArray(pendingReviewItems)||!Array.isArray(data?.schedules))return;
 const norm=v=>String(v||'').trim().toUpperCase();
 for(const item of pendingReviewItems){
  const ids=data.schedules.filter(r=>item.empId&&norm(r.empId||r.id)===norm(item.empId));
  const att=data.schedules.filter(r=>item.attNo&&norm(r.attNo||r.attendanceNo)===norm(item.attNo));
  const names=data.schedules.filter(r=>item.name&&norm(displayPersonName(r.name))===norm(item.name));
  const match=ids.length===1?ids[0]:att.length===1?att[0]:names.length===1?names[0]:null;
  if(!match)continue;
  item.shift=String(match.schedule?.[item.date]||'');
  item.dept=item.dept||String(match.dept||'');
  item.unit=item.unit||String(match.unit||'');
  item.group=String(match.schedule?.__personnel?.group||match.group||'');
 }
 if(pendingReviewDialog?.open)renderPendingReview();
}
// 首頁停留與切回視窗時，不自動刷新待核資料；點待核卡或手動更新才重讀雲端。
function showAttendance(a){
 setPendingReviewVisualState(a.boundaryError||!Number.isFinite(a.pendingShifts)?'unverified':a.pendingShifts===0?'clear':'pending');
 pendingReviewItems=a.pendingDetails;pendingReviewMonth=month();pendingReviewSelection=Array.isArray(a.pendingDetails)&&a.pendingDetails.length?0:-1;lastPendingReadAt=Date.now();
 statusText('p79DashReviewHint',a.boundaryError?'正式資料核對未完成 ›':a.pendingShifts===null?'資料尚未載入':a.pendingShifts>0?'點擊查看 '+a.pendingShifts+' 筆異常原因 ›':'已核對：無待核班次 ›');
 setMetric('p79DashAttendancePeople',fmt(a.peopleCount));
 setMetric('p79DashPunchRecords',fmt(a.recordCount));
 setMetric('p79DashPersonDays',fmt(a.personDays));
 setMetric('p79DashPunchIns',fmt(a.punchIn));setMetric('p79DashAnomalies',fmt(a.pendingShifts));
 const total=a.punchIn+a.punchOut+a.other;
 const percentage=total?Math.round(100*a.punchIn/total):null;
 const donut=$('p79DashDonut');
 if(donut)donut.style.setProperty('--p79d-donut-angle',String(percentage??0)+'%');
 setMetric('p79DashDonutRate',percentage===null?'—':percentage+'%');
 setMetric('p79DashPunchLegend','上班卡 '+fmt(a.punchIn)+' 筆／下班卡 '+fmt(a.punchOut)+' 筆／其他 '+fmt(a.other)+' 筆');
 formatBars('p79DashAttendanceBars',a.weeks,['第1週','第2週','第3週','第4週','第5週']);
 statusText('p79DashAttendanceSource',a.boundaryError?'考勤待核尚未完成即時核對：'+a.boundaryError:'依正式打卡紀錄統計；出勤人日以有上班卡的日期計算。');
 root.P79ReferenceDashboard?.attendance(a,month());
 if(pendingReviewDialog?.open)renderPendingReview();
}
function reset(){
 lastOvertimeData=null;
 statusText('p79DashOvertimeUnreported','未申報／預排資料待讀取');
 root.P79HomeEarlyPunchAlert?.reset();
 const list=$('p79DashOvertimeRecords'),section=$('p79DashOvertimeList');
 if(list)list.replaceChildren();
 if(section)section.hidden=true;
 setPendingReviewVisualState('unverified');
 pendingReviewItems=null;pendingReviewMonth='';pendingReviewSelection=-1;pendingReviewError='';pendingReviewVerifiedAt='';if(pendingReviewDialog?.open)pendingReviewDialog.close();
 statusText('p79DashReviewHint','點擊查看異常原因 ›');
 for(const id of ['p79DashOvertimeHours','p79DashAnomalies','p79DashWorkHours','p79DashShipCount','p79DashMoves','p79DashContainers','p79DashGph','p79DashAttendancePeople','p79DashPunchRecords','p79DashPersonDays','p79DashPunchIns','p79DashDonutRate'])setMetric(id,'—');
 for(const id of ['p79DashShipRanking','p79DashPeopleRanking']){const el=$(id);if(el)el.innerHTML='<tr><td colspan="5">等待月份資料</td></tr>'}
 for(const id of ['p79DashShipBars','p79DashAttendanceBars']){const el=$(id);if(el)el.textContent='等待載入'}
 setMetric('p79DashPunchLegend','尚未讀取考勤資料');
 const donut=$('p79DashDonut');if(donut)donut.style.setProperty('--p79d-donut-angle','0%');
 root.P79ReferenceDashboard?.reset();
}
function accessError(){return '目前登入身分沒有此類歷史資料的檢視權限，請由權限管理員確認。'}
// The missing-punch audit must use the same *official* leave source as HR
// summaries. A failed/unauthorized leave read never means "no approved leave".
async function requestApprovedLeave(token){
 const current=session(),role=String(current?.adminRole||current?.role||'').toLowerCase();
 if(role!=='superadmin'&&!['view','manage'].includes(String(current?.systemPermissions?.leave)))
  throw Error('目前帳號沒有正式請假紀錄檢視權限');
 const raw=String(root.sessionStorage.getItem('port79_gas_url')||'');
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(raw))throw Error('請假資料連線未驗證');
 const url=new URL(raw);url.searchParams.set('action','getLeaveData');url.searchParams.set('token',token);
 url.searchParams.set('_',String(Date.now()));
 const controller=new AbortController(),timer=root.setTimeout(()=>controller.abort(),30000);
 try{
  const response=await root.fetch(url.toString(),{cache:'no-store',signal:controller.signal}),data=await response.json();
  if(!response.ok||data?.ok!==true||!Array.isArray(data.employees)||!Array.isArray(data.leaveRecords))
   throw Error(data?.error||'核准請假資料尚未讀齊');
  return data;
 }finally{root.clearTimeout(timer);}
}
async function request(kind,ym,token,forceCloud){
 const base=String(root.sessionStorage.getItem('port79_gas_url')||'').trim();
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(base))throw Error('尚未取得已驗證的資料服務網址');
 const url=new URL(base);url.searchParams.set('action','historyGetMonthData');url.searchParams.set('type',kind);url.searchParams.set('month',ym);
 url.searchParams.set('token',token);url.searchParams.set('gcToken',token);
 if(!root.P79HistoryRead?.read)throw Error('歷史資料唯讀模組尚未載入');
 return root.P79HistoryRead.read(url.toString(),{forceCloud:forceCloud===true}).then(data=>{
  if(data.month&&String(data.month)!==ym)throw Error('雲端回傳月份與選取月份不同，已拒絕顯示');
  return data;
 });
}
// 本月加班必須以正式雲端班表為主，不能只讀可能尚未更新的歷史月份快照。
async function requestHomeCurrentSchedule(ym,token){
 const base=String(root.sessionStorage.getItem('port79_gas_url')||'').trim();
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(base))throw Error('尚未取得已驗證的班表服務網址');
 const url=new URL(base);
 url.searchParams.set('action','getScheduleDataSecure');
 url.searchParams.set('gcToken',token);
 url.searchParams.set('month',ym);
 url.searchParams.set('_',String(Date.now()));
 const controller=new AbortController(),timer=root.setTimeout(()=>controller.abort(),25000);
 try{
  const response=await root.fetch(url.toString(),{cache:'no-store',redirect:'follow',signal:controller.signal});
  const data=await response.json();
  if(!response.ok||data?.ok!==true||!Array.isArray(data.schedules)||
     data.month&&String(data.month)!==ym)throw Error(data?.error||'正式班表回傳資料不完整或月份不符');
  return {...data,month:ym,p79HomeScheduleSource:'live'};
 }finally{root.clearTimeout(timer);}
}
async function requestHomeOvertimeSchedule(ym,token,forceCloud=false){
 if(ym!==taipeiDay().slice(0,7))return request('schedule',ym,token,forceCloud);
 try{return await requestHomeCurrentSchedule(ym,token);}
 catch(error){
  // 即時來源失敗時保留歷史月份唯讀備援，但不允許把快照零筆說成當月確定無加班。
  const fallback=await request('schedule',ym,token,true);
  return {...fallback,p79HomeScheduleSource:'history-fallback',
   p79HomeLiveWarning:'正式即時班表未核對完成：'+String(error?.message||error)};
 }
}
// 每月 1 日的下班卡可能對應上月最後一天的夜班上班卡。
// 歷史 API 的跨月鄰界讀取失敗時，不可把「未找到本月上班卡」直接認定為異常。
// 這裡只做唯讀跨月複查；其他首頁指標仍只依原月份資料計算。
// 重驗只用已正式配對的原始紀錄消除假陽性，絕不憑時間猜測或更動打卡。
function reconcilePendingAgainstOfficial(summary,officialRecords){
 if(!Array.isArray(summary?.pendingDetails)||!Array.isArray(officialRecords)||!root.P79AttendanceV6?.buildShifts)return summary;
 const paired=root.P79AttendanceV6.buildShifts(officialRecords).filter(s=>s.clockIn&&s.clockOut&&!s.timePrecisionIssue);
 const norm=v=>String(v||'').replace(/\s+/g,'').toUpperCase();
 const time=v=>{
  const n=root.P79AttendanceV6.normalizeTime(String(v||''));
  const t=Date.parse(n.replace(/\//g,'-').replace(' ','T')+'+08:00');
  return Number.isFinite(t)?t:NaN;
 };
 const samePerson=(a,b)=>a.empId&&b.empId?norm(a.empId)===norm(b.empId):
   a.attNo&&b.attNo?norm(a.attNo).replace(/^0+/,'')===norm(b.attNo).replace(/^0+/,''):false;
 const details=summary.pendingDetails.filter(r=>{
  const side=r.clockIn?'clockIn':'clockOut',eventTime=time(r[side]);
  if(!Number.isFinite(eventTime))return true;
  // 同員工、同一側打卡且 15 分鐘內相鄰重複刷卡，正式已配對班次優先。
  const verified=paired.some(s=>samePerson(r,s)&&Number.isFinite(time(s[side]?.timeStr))&&
    Math.abs(time(s[side].timeStr)-eventTime)<=15*60*1000);
  return !verified;
 });
 return {...summary,pendingDetails:details,pendingShifts:details.length,verifiedFromOfficial:true};
}
async function requestOfficialAttendanceAudit(action,ym,token){
 const base=String(root.sessionStorage.getItem('port79_gas_url')||'').trim();
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(base))throw Error('無法驗證正式考勤資料服務網址');
 const url=new URL(base);
 url.searchParams.set('action',action);url.searchParams.set('month',ym);
 url.searchParams.set('token',token);url.searchParams.set('gcToken',token);
 url.searchParams.set('fresh','1');
 if(!root.P79HistoryRead?.read)throw Error('正式考勤唯讀模組未載入');
 const data=await root.P79HistoryRead.read(url.toString(),{forceCloud:true});
 if(!Array.isArray(data.records)||data.month&&String(data.month)!==ym)throw Error('正式考勤回傳資料不完整或月份不符');
 return data;
}
async function verifyAttendancePendingWithOfficial(data,ym,token,scheduleData){
 let result=await reconcileAttendanceBoundary(data,ym,token,true,scheduleData);
 if(result.pendingShifts===0)return result;
 // 歷史資料快取可能保留已補卡前的舊結果。再讀「正式主表」無快取核對。
 // 主表無法確認時，以全來源無損資料複核；任何查詢失敗都不把舊名單當真。
 const errors=[];
 for(const action of ['getAttendanceMainDirect','getAttendanceMonthRaw']){
  try{
   const official=await requestOfficialAttendanceAudit(action,ym,token);
   result=reconcilePendingAgainstOfficial(result,official.records);
   if(result.pendingShifts===0)return result;
  }catch(error){errors.push(action+': '+String(error?.message||error));}
 }
 if(errors.length){
  return {...result,pendingDetails:null,pendingShifts:null,boundaryError:'雲端複核未完成；'+errors.join('；')};
 }
 return result;
}
async function reconcileAttendanceBoundary(data,ym,token,forceCloud,scheduleData){
 const initial=analyzeAttendance(data,ym,null,{scheduleData});
 if(!Array.isArray(initial.pendingDetails)||!initial.pendingDetails.some(r=>r.date===ym+'-01'&&!r.clockIn&&r.clockOut))return initial;
 const lastPrevDay=new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7))-1,0)).toISOString().slice(0,10);
 try{
  const previous=await request('attendance',lastPrevDay.slice(0,7),token,true);
  if(!Array.isArray(previous.records))throw Error('上月正式考勤格式不完整');
  const neighbors=previous.records.filter(r=>attendanceDate(r)===lastPrevDay);
  if(!neighbors.length)throw Error('無法取得上月最後一天正式打卡資料');
  return analyzeAttendance(data,ym,neighbors,{scheduleData});
 }catch(error){
  // 查不到上月資料只能標為「未核對」，不能把跨月正常班次灌進異常統計。
  return {...initial,pendingDetails:null,pendingShifts:null,boundaryError:String(error?.message||error)};
 }
}
// Same authenticated rest auditor used by the scheduling calendar. Read-only:
// do not write punches, roster, approved leave or overtime reports.
async function verifiedHomeRestEvidence(scheduleData,ym,token){
 if(!Array.isArray(scheduleData?.schedules)||!root.P79ScheduleRestEvidence?.create||
    !root.P79RestAttendance||!root.P79SchedulePunchRestore?.displayShiftFromClockIn||
    !root.P79AttendanceV6?.buildShifts||!root.P79AttendanceV6?.normalizeTime)return null;
 const norm=v=>String(v??'').trim().toUpperCase();
 const master=new Map((scheduleData.employees||[]).map(p=>[norm(p.empId||p.id),p]));
 const schedules=scheduleData.schedules.filter(r=>norm(r.empId||r.id)&&r.schedule&&typeof r.schedule==='object')
  .map(r=>({...r,empId:norm(r.empId||r.id)}));
 const people=schedules.map(row=>{
  const p=master.get(row.empId)||{};
  return {id:row.empId,name:row.name||p.name||'',
   attNo:row.attNo||row.attendanceNo||p.attNo||p.attendanceNo||'',
   startDate:row.startDate||p.startDate||''};
 });
 if(!people.length)return null;
 const authenticated=()=>root.sessionStorage.getItem('port79_user_token')||
  root.sessionStorage.getItem('port79_admin_token')||'';
 const clock=record=>{
  const n=root.P79AttendanceV6.normalizeTime(String(record?.timeStr||
    record?.['出勤時間']||record?.datetime||''));
  if(!/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(n))return NaN;
  return Date.parse(n.replaceAll('/','-').replace(' ','T')+'+08:00');
 };
 const client=root.P79ScheduleRestEvidence.create({
  token:()=>authenticated()===token?token:'',
  employees:()=>people,schedules:()=>schedules,
  dateEligible:(person,date)=>{
   const start=String(person.startDate||'').replaceAll('/','-').slice(0,10);
   return !/^\d{4}-\d{2}-\d{2}$/.test(start)||date>=start;
  },
  buildShifts:rows=>root.P79AttendanceV6.buildShifts(rows),
  timestamp:clock,leaveDates:()=>[],
  shiftForSession:row=>root.P79SchedulePunchRestore.displayShiftFromClockIn(row.clockIn,row.clockOut),
  now:()=>Date.now(),update:()=>{},
  read:async month=>{
   const [main,raw]=await Promise.allSettled([
    requestOfficialAttendanceAudit('getAttendanceMainDirect',month,token),
    requestOfficialAttendanceAudit('getAttendanceMonthRaw',month,token)
   ]);
   if(authenticated()!==token)throw Error('核對期間登入身分已改變');
   if(main.status!=='fulfilled'&&raw.status!=='fulfilled')
    throw Error('正式考勤與原始打卡來源皆未讀齊');
   const rawOk=raw.status==='fulfilled'&&raw.value.records.length>0;
   if(main.status!=='fulfilled'||main.value.records.length===0&&rawOk)
    return {...raw.value,absenceReferenceRecords:null,
     absenceReferenceError:'正式主表未完整取得，原始資料僅能依完整度核實'};
   return {...main.value,absenceReferenceRecords:raw.status==='fulfilled'?raw.value.records:null,
    absenceReferenceError:raw.status==='fulfilled'?'':'原始打卡來源未完整取得'};
  }
 });
 try{
  const evidence=await client.refresh(ym);
  return authenticated()===token&&evidence?.complete===true?evidence:null;
 }catch(error){return null;} // Unknown evidence never becomes missing or writes.
}
async function renderVerifiedHomePunch(attendance,schedule,ym,leaveData,token){
 const restEvidence=attendance&&schedule&&leaveData
  ?await verifiedHomeRestEvidence(schedule,ym,token):null;
 if(month()!==ym||!session()||!permissions().attendance||!permissions().schedule)return;
 if((root.sessionStorage.getItem('port79_user_token')||
     root.sessionStorage.getItem('port79_admin_token')||'')!==token)return;
 root.P79HomeEarlyPunchAlert?.render(attendance,schedule,ym,{leaveData,restEvidence});
}
async function load(forceCloud=false){
 if(loading)return;
 const s=session(),p=permissions();if(!s||(!p.vessel&&!p.attendance))return;
 const ym=checkMonth(),token=root.sessionStorage.getItem('port79_user_token')||root.sessionStorage.getItem('port79_admin_token')||'';
 if(!token){statusText('p79DashMessage','沒有管理員登入權杖，請重新登入');return}
 loading=true;const button=$('p79DashRefresh');
 if(button)button.disabled=true;
 reset();root.P79ReferenceDashboard?.setGroupRoster(null,ym);statusText('p79DashMonthLabel',selectedMonthTitle());statusText('p79DashMonthLabel2',selectedMonthTitle());
 statusText('p79DashMessage','正在唯讀查詢 '+selectedMonthTitle()+' 的船舶與考勤資料…');
 const failures=[];
 let scheduleSnapshot=null,attendanceSnapshot=null,leaveSnapshot=null,attendanceBoundaryError='';
 try{
  for(const [kind,allowed,captionId,render] of [['vessel',p.vessel,'p79DashShipSource',showVessels],['attendance',p.attendance,'p79DashAttendanceSource',showAttendance],['schedule',p.schedule,'p79DashScheduleSource',showOvertime]]){
   if(!allowed){statusText(captionId,accessError());if(kind==='schedule'){root.P79ReferenceDashboard?.setOvertimeReport({month:ym,error:'目前帳號沒有職稱加班統計的檢視權限'});renderHomeOvertimeList(null);}continue}
   try{
    const data=kind==='schedule'?(scheduleSnapshot||await requestHomeOvertimeSchedule(ym,token,forceCloud)):await request(kind,ym,token,kind==='attendance'?true:forceCloud);
    if(month()!==ym||!$('systems')?.classList.contains('show')||!permissions()[kind])return;
    if(kind==='vessel'&&Array.isArray(data.shipMasters)){
     const report=analyzeVessels(data),range=weeklyWindow(ym);
     if(!range.future&&range.start.slice(0,7)!==ym){
      try{const previous=await request('vessel',range.start.slice(0,7),token,forceCloud);report.weekVessels=[...analyzeVessels(previous).vessels,...report.vessels];}
      catch(error){report.weekError='跨月船舶資料尚未讀齊，請重新讀取';failures.push(report.weekError);}
      if(month()!==ym||!$('systems')?.classList.contains('show')||!permissions().vessel)return;
     }
     render(report);
    }
    else if(kind==='attendance'&&Array.isArray(data.records)){
      if(p.schedule&&!scheduleSnapshot){
       try{scheduleSnapshot=await requestHomeOvertimeSchedule(ym,token,true);}catch(_){scheduleSnapshot=null;}
      }
      const checked=await verifyAttendancePendingWithOfficial(data,ym,token,scheduleSnapshot);
      if(month()!==ym||!$('systems')?.classList.contains('show')||!permissions().attendance)return;
      attendanceSnapshot=data;attendanceBoundaryError=String(checked.boundaryError||'');
      render(checked);
      if(scheduleSnapshot)enrichPendingReview(scheduleSnapshot);
    }
    else if(kind==='schedule'&&Array.isArray(data.schedules)){
      scheduleSnapshot=data;
      enrichPendingReview(data);
      render({...analyzeOvertime(data,ym),sourceWarning:data.p79HomeLiveWarning||'',sourceMode:data.p79HomeScheduleSource||'history'});
      // Read-only roster grouping for the people-efficiency leaderboard.
      root.P79ReferenceDashboard?.setGroupRoster(data,ym);
    }
    else throw Error('該月份資料結構不完整');
   }catch(error){const message=error?.message||String(error);failures.push((kind==='vessel'?'船舶':kind==='schedule'?'加班':'考勤')+'：'+message);statusText(captionId,'無法載入：'+message);if(kind==='schedule'){root.P79ReferenceDashboard?.setOvertimeReport({month:ym,error:'加班申報資料讀取失敗：'+message});renderHomeOvertimeList(null);} }
  }
  try{
   const data=await requestApprovedLeave(token);
   if(month()!==ym||session()?.empId!==s.empId||(root.sessionStorage.getItem('port79_user_token')||root.sessionStorage.getItem('port79_admin_token')||'')!==token)return;
   root.P79ReferenceDashboard?.setLeaveReport(root.P79ApprovedLeaveSummary.aggregate({...data,month:ym}));
   leaveSnapshot=data;
   // Formal employee HR titles also resolve roles for overtime reports in a schedule-only snapshot.
   if(scheduleSnapshot&&p.schedule)showOvertime({...analyzeOvertime({...scheduleSnapshot,employees:data.employees},ym),sourceWarning:scheduleSnapshot.p79HomeLiveWarning||'',sourceMode:scheduleSnapshot.p79HomeScheduleSource||'history'});
  }catch(error){if(month()===ym)root.P79ReferenceDashboard?.setLeaveReport({month:ym,error:'核准請假資料未完成核對：'+String(error.message||error)});}
  if(month()===ym&&permissions().attendance&&permissions().schedule){
   await renderVerifiedHomePunch(attendanceBoundaryError?null:attendanceSnapshot,scheduleSnapshot,ym,leaveSnapshot,token);
  }
  loadedKey=ym;
  statusText('p79DashMessage',failures.length?failures.join('；'):'已讀取 '+selectedMonthTitle()+' 的可用歷史資料。');
 }finally{loading=false;if(button)button.disabled=false;if(month()!==ym&&$('systems')?.classList.contains('show')){loadedKey='';root.setTimeout(()=>load(false).catch(()=>{}),0);}}
}
function showWhenAdmin(){
 const el=$('systems'),s=session(),role=String(s?.adminRole||s?.role||'').toLowerCase();
 const allow=el?.classList.contains('show')&&['admin','superadmin'].includes(role)&&!s?.punchOnly;
 if(!allow){if(sessionStamp||loadedKey){sessionStamp='';loadedKey='';reset();}return;}
 if(sessionStamp===String(s.empId||'')&&loadedKey===month())return;
 sessionStamp=String(s.empId||'');
 if(!loadedKey){root.setTimeout(()=>load(false).catch(e=>{statusText('p79DashMessage',String(e?.message||e))}),150);}
}
function init(){
 if(!$('p79Dashboard'))return;
 const selector=$('p79DashMonth');if(selector&&!selector.value)selector.value=isoMonth();
 $('p79DashOvertimeMode')?.addEventListener('click',event=>{
  const target=event.target?.closest?.('[data-overtime-mode]');
  if(target)setOvertimeDisplayMode(target.dataset.overtimeMode);
 });
 root.P79HomeEarlyPunchAlert?.bind(async()=>{
  const ym=checkMonth(),p=permissions(),account=String(session()?.empId||'');
  const token=root.sessionStorage.getItem('port79_user_token')||root.sessionStorage.getItem('port79_admin_token')||'';
  if(!p.attendance||!p.schedule||!token)throw Error('沒有正式考勤與排班的完整檢視權限');
  const [attendance,schedule,leaveData]=await Promise.all([
   request('attendance',ym,token,true),
   request('schedule',ym,token,true),
   requestApprovedLeave(token)
  ]);
  const currentToken=root.sessionStorage.getItem('port79_user_token')||root.sessionStorage.getItem('port79_admin_token')||'';
  if(month()!==ym||String(session()?.empId||'')!==account||token!==currentToken||!permissions().attendance||!permissions().schedule)
    throw Error('月份或登入身分已變更，請重新開啟警示');
  const restEvidence=await verifiedHomeRestEvidence(schedule,ym,token);
  return {attendance,schedule,leaveData,restEvidence,month:ym};
 });
 ensurePendingReview();
 statusText('p79DashMonthLabel',selectedMonthTitle());statusText('p79DashMonthLabel2',selectedMonthTitle());
 selector?.addEventListener('change',()=>{loadedKey='';reset();statusText('p79DashMessage','正在準備所選月份資料…');statusText('p79DashMonthLabel',selectedMonthTitle());statusText('p79DashMonthLabel2',selectedMonthTitle());showWhenAdmin()});
 $('p79DashRefresh')?.addEventListener('click',()=>{loadedKey='';load(true).catch(e=>statusText('p79DashMessage',String(e?.message||e)))});
 const el=$('systems');if(el&&root.MutationObserver){const obs=new root.MutationObserver(showWhenAdmin);obs.observe(el,{attributes:true,attributeFilter:['class']})}
 showWhenAdmin();
}
if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);
