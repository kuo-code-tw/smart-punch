(function(root,factory){
  const api=factory(root?.P79AttendanceV6);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.P79SchedulePunchRestore=api;
})(typeof window!=='undefined'?window:null,function(engine){
'use strict';
const upper=v=>String(v||'').trim().toUpperCase();
const att=v=>String(v??'').trim().replace(/^0+/,'')||String(v??'').trim();
const dateBack=d=>new Date(Date.parse(d+'T00:00:00Z')-86400000).toISOString().slice(0,10);
function timed(record){
 const t=engine?.normalizeTime(record?.timeStr||record?.['出勤時間']||'')||'';
 const m=t.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
 if(!m)return null;
 const date=m[1]+'-'+m[2]+'-'+m[3],hour=+m[4]+(+m[5])/60+(+m[6])/3600;
 return{date,hour,ts:Date.parse(date+'T'+m[4]+':'+m[5]+':'+m[6]+'+08:00')};
}
function shiftFromClockIn(inRec,outRec,{displayOnly=false}={}){
 const start=timed(inRec),end=timed(outRec);
 if(!start||!end||!Number.isFinite(start.ts)||!Number.isFinite(end.ts))return null;
 const elapsed=(end.ts-start.ts)/3600000;
 if(elapsed<=0||elapsed>16||(!displayOnly&&elapsed<3))return null;
 // The formal night shift is 24:00–08:00 of its roster date.
 // A clock-in shortly after midnight belongs to the previous roster date.
 let shift='',date=start.date;
 // A complete session entirely before 08:00 belongs to the previous night's roster date.
 if(start.date===end.date&&start.hour<8&&end.hour<8){shift='晚';date=dateBack(date);}
 // A 03:38–15:53 completed pair spans pre-shift 04–08 overtime and
 // the regular 08–16 day shift. Do not leave the workday unclassified just
 // because its first punch is earlier than the usual 06:00 early-shift gate.
 // The same-day near-16:00 clock-out prevents a standalone 04–08 cover
 // or an overnight 00–08 session from being mislabelled as a regular day.
 else if(start.date===end.date&&start.hour>=3&&start.hour<6&&
         end.hour>=14&&end.hour<=18&&elapsed>=8)shift='早';
 else if(start.hour>=6&&start.hour<=10)shift='早';
 else if(start.hour>=14&&start.hour<=18)shift='中';
 else if(start.hour>=22){shift='晚';}
 else if(start.hour<=2){shift='晚';date=dateBack(date);}
 if(!shift)return null;
 // Use exactly the official attendance engine workday; a 00:30–09:00
 // session must not be moved to yesterday by a separate shift heuristic.
 const accountingDate=engine?.accountingDateForSession?.(inRec,outRec);
 if(/^\d{4}-\d{2}-\d{2}$/.test(String(accountingDate||'')))date=accountingDate;
 return{date,shift,start:start.ts,end:end.ts};
}
function plan({records=[],employees=[],schedules={},metadata={},month='',today='',allowUnmarked=false,isProtected=()=>false}={}){
 if(!engine?.buildShifts)throw Error('正式考勤配對引擎尚未載入，排班不修改');
 const peopleById=new Map(),peopleByAtt=new Map();
 for(const employee of employees){
  const id=upper(employee.id||employee.empId);if(!id)continue;
  peopleById.set(id,employee);
  const key=att(employee.attNo||employee.attendanceNo);
  if(key){const entries=peopleByAtt.get(key)||new Set();entries.add(id);peopleByAtt.set(key,entries);}
 }
 const sessions=engine.buildShifts(records.filter(r=>r&&r.deleted!==true&&r.isDeleted!==true));
 const byDate=new Map(),ambiguous=new Set();
 for(const row of sessions){
  if(!row.clockIn||!row.clockOut||row.timePrecisionIssue)continue;
  const id=upper(row.empId),attKey=att(row.attNo||row.clockIn?.attNo);
  let person=peopleById.get(id);
  const byAtt=peopleByAtt.get(attKey);
  if(person&&attKey&&byAtt?.size===1&&![...byAtt].includes(upper(person.id||person.empId)))continue;
  if(!person&&attKey&&byAtt?.size===1)person=peopleById.get([...byAtt][0]);
  if(!person)continue;
  const pair=shiftFromClockIn(row.clockIn,row.clockOut);
  if(!pair||!pair.date.startsWith(month+'-')||pair.date>=today)continue;
  const key=upper(person.id||person.empId)+'|'+pair.date;
  if(byDate.has(key)){ambiguous.add(key);continue;}
  byDate.set(key,{empId:upper(person.id||person.empId),...pair});
 }
 const corrections=[];
 for(const [key,paired]of byDate){
  if(ambiguous.has(key))continue;
  const person=peopleById.get(paired.empId),roster=schedules[paired.empId]||schedules[person?.id]||{};
  const old=String(roster[paired.date]||'').trim();
  const meta=metadata[paired.empId]?.[paired.date]||metadata[person?.id]?.[paired.date]||{};
  // Actual attendance also corrects a wrong early/middle/night assignment,
  // not only old 休/例/國. Explicitly protected manual shifts remain untouched.
  const wasRest=['休','例','國'].includes(old);
  if(!wasRest&&!['早','中','晚'].includes(old))continue;
  if(old===paired.shift)continue;
  // Manual/legal leave, formally reported overtime and substitutes are never
  // silently rewritten into ordinary shifts.
  if(meta.manualRosterShift||meta.restAllocationLocked||meta.restCategoryLocked||
     meta.overtime||meta.overtimeReport||meta.overtimeReports?.length||
     meta.forEmpId||isProtected(paired.empId,paired.date))continue;
  const knownAuto=meta.restAllocationSource==='auto-v1'||!!meta.noPunchOriginalShift;
  // A historic bare 休 with a real punch may have been lawful rest-day overtime.
  // Do not rewrite it silently on page load; require explicit preview/approval.
  if(wasRest&&!knownAuto&&!allowUnmarked)continue;
  const restored=String(meta.noPunchOriginalShift||'').trim();
  // A saved original shift is stronger evidence, but a mismatched paired punch
  // requires manual review rather than assuming one of them is correct.
  if(wasRest&&restored&&restored!==paired.shift&&!allowUnmarked)continue;
  corrections.push({...paired,previous:old,reason:restored?'原班別與打卡一致':'完整上下班打卡推定工作班'});
 }
 return{corrections,pairedSessions:byDate.size,ambiguousSessions:ambiguous.size};
}
return{plan,shiftFromClockIn,
 // 只用完整配對打卡顯示實際班別；短時出勤不得自動當成完整班別寫回正式班表。
 displayShiftFromClockIn:(inRec,outRec)=>shiftFromClockIn(inRec,outRec,{displayOnly:true})};
});
