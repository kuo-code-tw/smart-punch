(function(g){
'use strict';
const id=x=>String(x||'').trim().toUpperCase(),att=x=>String(x||'').trim().replace(/^0+/,'');

 // Verified partial night shift: 20:00–24:00 actual paired overtime, then a
 // punch-free 00:00–08:00 interval, both assigned to the original roster date.
 // It does not create or change leave, overtime approval or roster records.
 function detectNightSplitRest({month,schedules,people,sessions,referenceSessions,officialRecords,
   referenceRecords,officialByMonth,referenceByMonth,referenceAvailable,timestamp,now}){
   const found={};
   if(!referenceAvailable||!referenceSessions||!Number.isFinite(now))return found;
   const numbers=new Map(),known=new Set();
   for(const person of people||[]){
     const who=id(person.id||person.empId),no=att(person.attNo||person.attendanceNo);
     if(!who)continue;known.add(who);
     if(no){const set=numbers.get(no)||new Set();set.add(who);numbers.set(no,set);}
   }
   const owner=r=>{
     const claimed=id(r.empId),options=numbers.get(att(r.attNo||r.attendanceNo));
     if(options?.size>1)return '';
     if(options?.size===1){const actual=[...options][0];return known.has(claimed)&&claimed!==actual?'':actual;}
     return known.has(claimed)?claimed:'';
   };
   const rawByPerson=new Map();
   for(const row of [...(officialRecords||[]),...(referenceRecords||[])]){
     const who=owner(row),ms=timestamp(row);
     if(!who||!Number.isFinite(ms))continue;
     if(!rawByPerson.has(who))rawByPerson.set(who,[]);
     rawByPerson.get(who).push(ms);
   }
   const paired=(rows,who,date,start,end)=>{
     const matches=(rows||[]).filter(s=>{
       if(id(s.empId)!==who||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.end<=s.start)return false;
       if(new Date(s.start+28800000).toISOString().slice(0,10)!==date||
         s.workDate&&s.workDate!==date)return false;
       return Math.abs(s.start-start)<=900000&&Math.abs(s.end-end)<=900000&&
         s.end-s.start>=210*60000&&s.end-s.start<=270*60000;
     });
     return matches.length===1?matches[0].end:NaN;
   };
   for(const row of schedules||[]){
     const who=id(row.empId),roster=row.schedule||{};
     if(!who||!known.has(who))continue;
     for(const date of Object.keys(roster)){
       if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!date.startsWith(month+'-'))continue;
       const meta=roster.__meta?.[date]||{},report=meta.overtimeReport;
       if(!(roster[date]==='晚'||meta.reportOriginalShift==='晚'||meta.overtimeOriginalShift==='晚')||
         !report?.id||meta.overtimeExcluded===true||
         (meta.overtimeRevocations||[]).some(x=>x?.confirmed===true&&String(x.reportId)===String(report.id)))continue;
       const startText=String(report.overtimeStart||meta.overtimeStart||'').trim();
       const endText=String(report.overtimeEnd||meta.overtimeEnd||'').trim();
       const code=String(report.code||'').replace(/^[代延休例國]/,'');
       if(startText&&endText?
         !(/^20(?::00)?$/.test(startText)&&/^(?:00|24)(?::00)?$/.test(endText)):
         code!=='20-24')continue;
       const start=Date.parse(date+'T20:00:00+08:00'),end=start+4*3600000,finish=end+8*3600000;
       const nextDate=new Date(end+28800000).toISOString().slice(0,10),nextMonth=nextDate.slice(0,7);
       if(now<end+12*3600000||!officialByMonth?.[month]||!referenceByMonth?.[month]||
         !officialByMonth?.[nextMonth]||!referenceByMonth?.[nextMonth])continue;
       // Across month boundaries, a completely empty next-month feed is unverified.
       if(nextMonth!==month&&
         (![...(officialRecords||[])].some(r=>String(r.timeStr||r.time||'').replaceAll('/','-').startsWith(nextMonth))||
          ![...(referenceRecords||[])].some(r=>String(r.timeStr||r.time||'').replaceAll('/','-').startsWith(nextMonth))))continue;
       const officialOut=paired(sessions,who,date,start,end);
       const referenceOut=paired(referenceSessions,who,date,start,end);
       if(!Number.isFinite(officialOut)||!Number.isFinite(referenceOut))continue;
       // The 20-24 shift's own midnight clock-out is not a new night punch.
       // Every other event during 00-08, including a stray single punch, blocks rest.
       if((rawByPerson.get(who)||[]).some(ms=>ms>=end&&ms<finish&&
          ms!==officialOut&&ms!==referenceOut))continue;
       found[who+'|'+date]={workDate:date,workStart:'20:00',workEnd:'24:00',
         restStart:'00:00',restEnd:'08:00',reportId:String(report.id)};
     }
   }
   return found;
 }
function create(ctx){
 const states=new Map(),reads=new Map(),now=()=>ctx.now?ctx.now():Date.now();
 function months(month){const d=new Date(month+'-01T00:00:00Z'),current=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).format(new Date(now()));const adjacent=n=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1)).toISOString().slice(0,7);return[adjacent(-1),month,...(adjacent(1)<=current?[adjacent(1)]:[])];}
 function read(month,token){
  const key=token+'|'+month,prior=reads.get(key);if(prior&&now()-prior.at<30000)return prior.promise;
  const entry={at:now()};entry.promise=Promise.resolve().then(()=>ctx.read(month,token)).then(data=>{if(data?.ok!==true||!Array.isArray(data.records)||data.records.some(r=>!r||typeof r!=='object'||Array.isArray(r))||data.month!=null&&String(data.month)!==month)throw Error('正式考勤未讀齊或月份不符');
    const reference=data.absenceReferenceRecords;
    return {official:data.records,reference:Array.isArray(reference)&&reference.every(r=>r&&typeof r==='object'&&!Array.isArray(r))?reference:null,referenceError:data.absenceReferenceError||''};}).catch(e=>{if(reads.get(key)===entry)reads.delete(key);throw e;});reads.set(key,entry);return entry.promise;
 }
 function status(month){const s=states.get(month);return s?.token===ctx.token()?s:{pending:false,error:'',evidence:{complete:false,days:{}}};}
 function refresh(month){
  const token=ctx.token();if(!token)return Promise.resolve(null);const prior=states.get(month);if(prior?.token===token&&prior.pending)return prior.promise;
  // A transient remote read failure must not replace the last checked month
  // with an unverified fallback. Retain it only for the SAME roster snapshot.
  const schedules=ctx.schedules(),rosterSignature=JSON.stringify(schedules);
  const personnelSignature=JSON.stringify(ctx.employees());
  const retained=prior?.token===token&&prior.rosterSignature===rosterSignature&&
    prior.personnelSignature===personnelSignature&&prior.evidence?.complete===true?prior.evidence:null;
  const state={token,rosterSignature,personnelSignature,pending:true,error:'',evidence:retained||{complete:false,days:{}}};states.set(month,state);ctx.update?.(month,state);
  state.promise=(async()=>{try{
   const requestedMonths=months(month);
   const fetched=await Promise.allSettled(requestedMonths.map(m=>read(m,token)));
   const ownIndex=requestedMonths.indexOf(month);
   if(fetched[ownIndex]?.status!=='fulfilled')throw fetched[ownIndex]?.reason||Error('當月正式考勤讀取失敗');
   if(ctx.token()!==token||states.get(month)!==state)return null;
   const officialByMonth=Object.fromEntries(requestedMonths.map((m,i)=>[m,fetched[i].status==='fulfilled']));
   const batches=fetched.map((result,i)=>result.status==='fulfilled'?result.value:{
     official:[],reference:null,referenceError:'相鄰月份 '+requestedMonths[i]+' 讀取失敗',
     officialReadError:true
   });
   const records=new Map(),referenceRecords=new Map();
   const referenceByMonth=Object.fromEntries(requestedMonths.map((m,i)=>[m,Array.isArray(batches[i].reference)]));
   let referenceAvailable=referenceByMonth[month]===true;
   const referenceErrors=batches.map(batch=>batch.referenceError||'').filter(Boolean);
   for(const batch of batches){
     for(const r of batch.official){
       if(!Number.isFinite(ctx.timestamp(r)))throw Error('正式考勤時間無效，不能判定整班無卡');
       const key=r.id?'ID:'+r.id:JSON.stringify([r.empId,r.attNo,r.timeStr,r.status]);records.set(key,r);
     }
     if(Array.isArray(batch.reference))for(const r of batch.reference){
       if(!Number.isFinite(ctx.timestamp(r))){referenceByMonth[requestedMonths[batches.indexOf(batch)]]=false;continue;}
       const key=r.id?'ID:'+r.id:JSON.stringify([r.empId,r.attNo,r.timeStr,r.status]);referenceRecords.set(key,r);
     }
   }
   // An unexpectedly empty original-punch feed is not proof that everyone was off.
   // Both independent feeds need at least one row for the target month.
   const belongsToMonth=r=>{
     const v=String(r.timeStr||r.time||'').match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
     return v&&v[1]+'-'+v[2].padStart(2,'0')===month;
   };
   if(![...records.values()].some(belongsToMonth)||![...referenceRecords.values()].some(belongsToMonth))referenceAvailable=false;
   referenceAvailable=referenceAvailable&&referenceByMonth[month]===true;
   const people=ctx.employees(),pairedRows=ctx.buildShifts([...records.values()]);
   const eligible=(person,date)=>typeof ctx.dateEligible==='function'?ctx.dateEligible(person,date)!==false:true;
   const personById=new Map(people.map(person=>[id(person.id||person.empId),person]));
   // Only validated paired punches can supply the ACTUAL shift displayed in
   // the monthly roster. This does not rewrite statutory roster history.
   const actualShifts={},actualWorkedMinutes={},actualShiftDetails={},ambiguousShifts={},aggregates=new Map();
   for(const row of pairedRows){
    if(!row.clockIn||!row.clockOut||row.timePrecisionIssue)continue;
    const rec=row.clockIn,claimed=id(row.empId||rec.empId);
    const matchedById=claimed?people.find(e=>id(e.id)===claimed):null;
    const candidates=att(rec.attNo)?people.filter(e=>att(e.attNo||e.attendanceNo)===att(rec.attNo)):[];
    // Never attribute a punch to a different employee if identity numbers
    // conflict or the attendance number identifies more than one person.
    if(candidates.length>1||matchedById&&candidates.length===1&&
       id(candidates[0].id)!==id(matchedById.id))continue;
    const employee=matchedById||(candidates.length===1?candidates[0]:null);
    const paired=ctx.shiftForSession?.(row);
    if(!employee||!paired?.date?.startsWith(month+'-')||!['早','中','晚'].includes(paired.shift))continue;
    const key=id(employee.id)+'|'+paired.date;
    const minutes=Math.round((paired.end-paired.start)/60000);
    if(minutes<=0)continue;
    const prior=aggregates.get(key);
    const detail={start:String(row.clockIn.timeStr||''),end:String(row.clockOut.timeStr||''),workday:paired.date,shift:paired.shift};
    if(!prior)aggregates.set(key,{shift:paired.shift,minutes,conflict:false,details:[detail]});
    else{prior.minutes+=minutes;prior.details.push(detail);if(prior.shift!==paired.shift)prior.conflict=true;}
   }
   for(const [key,value] of aggregates){
     if(value.conflict){ambiguousShifts[key]='同一工作日存在不同班別的完整出勤';continue;}
     actualShifts[key]=value.shift;actualWorkedMinutes[key]=value.minutes;actualShiftDetails[key]=value.details;
   }
   const mapSessions=rows=>rows.map(row=>{
    const record=row.clockIn||row.clockOut||row.records?.[0]||row;
    const claimed=id(row.empId||record.empId),matchedById=claimed?people.find(e=>id(e.id)===claimed):null;
    const candidates=att(record.attNo)?people.filter(e=>att(e.attNo||e.attendanceNo)===att(record.attNo)):[];
    if(candidates.length>1||matchedById&&candidates.length===1&&id(candidates[0].id)!==id(matchedById.id))return null;
    const emp=matchedById||(candidates.length===1?candidates[0]:null);
    return emp?{empId:emp.id,start:row.clockIn?ctx.timestamp(row.clockIn):null,
      end:row.clockOut?ctx.timestamp(row.clockOut):null,time:ctx.timestamp(record),
      workDate:row.clockIn&&row.clockOut&&!row.timePrecisionIssue?row.accountingDateKey||row.dateKey||'':''}:null;
   }).filter(Boolean);
   const sessions=mapSessions(pairedRows);
   if(JSON.stringify(ctx.schedules())!==rosterSignature||JSON.stringify(ctx.employees())!==personnelSignature)
     throw Error('核對期間人員或班表已更新，需重新讀取考勤');
   state.evidence=g.P79RestAttendance.build({complete:true,month,now:now(),schedules,sessions,leaveDates:ctx.leaveDates(month)});
   // Explain each single-sided attendance exception directly from its
   // source timestamp. This is read-only diagnostic proof, not a shift change.
   const pendingPunchDetails={};
   const localTime=ts=>Number.isFinite(ts)?new Date(ts+8*3600000).toISOString().replace('T',' ').slice(0,16):'';
   sessions.forEach((session,index)=>{
     if(Number.isFinite(session.start)&&Number.isFinite(session.end)&&session.end>session.start)return;
     const workday=state.evidence.sessionDates?.[index];
     const key=id(session.empId)+'|'+workday;
     if(!workday?.startsWith(month+'-')||state.evidence.days?.[key]?.state!=='missing')return;
     (pendingPunchDetails[key] ||= []).push({
       type:Number.isFinite(session.start)?'只有上班卡':'只有下班卡',
       time:localTime(Number.isFinite(session.start)?session.start:session.end),
       workday
     });
   });
   state.evidence.pendingPunchDetails=pendingPunchDetails;
   // A checked absence is based on either two authenticated feeds or a
   // high-coverage authenticated official feed if the raw endpoint is missing.
   // Never treat a partially loaded/empty month as a blanket rest day.
   const confirmed={},confirmationModes={};let discrepancies=0;
   let referenceEvidence=null;
   if(referenceAvailable){
     const pairedReference=ctx.buildShifts([...referenceRecords.values()]);
     referenceEvidence=g.P79RestAttendance.build({complete:true,month,now:now(),schedules,
       sessions:mapSessions(pairedReference),leaveDates:ctx.leaveDates(month)});
   }
   const officialRows=[...records.values()];
   const activeDateIds=new Map(),distinctMonthIds=new Set(),activeMonthDates=new Set();
   const peopleById=new Set(people.map(p=>id(p.id||p.empId)));
   const byAtt=new Map();
   for(const person of people){
     const no=att(person.attNo||person.attendanceNo);
     if(!no)continue;
     const prior=byAtt.get(no)||new Set();
     prior.add(id(person.id||person.empId));byAtt.set(no,prior);
   }
   for(const record of officialRows){
     const day=String(record.timeStr||record.time||'').match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
     if(!day)continue;
     const date=day[1]+'-'+day[2].padStart(2,'0')+'-'+day[3].padStart(2,'0');
     const no=att(record.attNo||record.attendanceNo);
     const matches=byAtt.get(no);
     const claimed=id(record.empId);
     const person=peopleById.has(claimed)&&(!matches||matches.size===1&&matches.has(claimed))
       ?claimed:(matches?.size===1?[...matches][0]:null);
     if(!person)continue;
     const set=activeDateIds.get(date)||new Set();
     set.add(person);activeDateIds.set(date,set);
     if(date.startsWith(month+'-')){distinctMonthIds.add(person);activeMonthDates.add(date);}
   }
   const referenceSessions=referenceAvailable?mapSessions(ctx.buildShifts([...referenceRecords.values()])):null;
   state.evidence.nightSplitRestConfirmed=detectNightSplitRest({
     month,schedules,people,sessions,referenceSessions,
     officialRecords:[...records.values()],referenceRecords:[...referenceRecords.values()],
     officialByMonth,referenceByMonth,referenceAvailable,timestamp:ctx.timestamp,now:now()
   });
   const employeeCount=people.length;
   // The old "10 distinct work dates" check could never pass before the
   // 10th of a month. As a result a healthy authenticated November 1–9
   // roster never showed verified zero-punch rest when the raw source was
   // unavailable. Scale *only* the month-to-date coverage requirement; keep
   // the per-day headcount, employee identities, and completed-shift proof.
   const taipeiToday=new Date(now()+8*3600000).toISOString().slice(0,10);
   const daysInMonth=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
   const completedDays=month<taipeiToday.slice(0,7)?daysInMonth:
     month===taipeiToday.slice(0,7)?Math.max(0,Number(taipeiToday.slice(8))-1):0;
   const requiredActiveDates=Math.min(10,Math.max(2,Math.ceil(completedDays*0.6)));
   const monthCoverage=employeeCount>0&&completedDays>=2&&
     officialRows.filter(r=>String(r.timeStr||r.time||'').startsWith(month.replace('-','/'))||
       String(r.timeStr||r.time||'').startsWith(month)).length>=Math.max(10,Math.ceil(employeeCount*0.7))&&
     activeMonthDates.size>=requiredActiveDates&&
     distinctMonthIds.size>=Math.min(employeeCount,Math.max(3,Math.ceil(employeeCount*0.20)));
   const dayThreshold=Math.min(employeeCount,Math.max(2,Math.ceil(employeeCount*0.08)));
   const dayCovered=date=>(activeDateIds.get(date)?.size||0)>=dayThreshold;
   let fallbackCount=0,dualCount=0;
   for(const [key,day] of Object.entries(state.evidence.days||{})){
     if(day.state!=='rest')continue;
     // Pre-employment dates must never be counted as confirmed leave.
     const who=personById.get(key.slice(0,key.lastIndexOf('|')));
     const workDate=key.slice(key.lastIndexOf('|')+1);
     if(!who||!eligible(who,workDate))continue;
     const date=key.slice(key.lastIndexOf('|')+1);
     const endDay=Number.isFinite(day.shiftEnd)?
       new Date(day.shiftEnd+8*3600000-1).toISOString().slice(0,10):date;
     const endMonth=endDay.slice(0,7);
     const canUseDual=referenceAvailable&&officialByMonth[endMonth]===true&&referenceByMonth[endMonth]===true;
     if(canUseDual&&referenceEvidence?.days?.[key]?.state==='rest'){
       confirmed[key]=true;confirmationModes[key]='dual';dualCount++;
     }else if(!canUseDual&&monthCoverage&&dayCovered(date)&&
       (endDay===date||dayCovered(endDay))&&
       // Fail closed for dates requiring a month whose official feed failed.
       officialByMonth[endMonth]===true){
       confirmed[key]=true;confirmationModes[key]='official-coverage';fallbackCount++;
     }else{
       // Cross-source contradictions or insufficient official data are never rest.
       day.state='unknown';day.absenceUnverified=true;discrepancies++;
     }
   }
   state.evidence.absenceConfirmedDays=confirmed;
   state.evidence.absenceConfirmationModes=confirmationModes;
   state.evidence.absenceAuditReady=dualCount>0||fallbackCount>0||referenceAvailable;
   state.evidence.absenceAuditMode=fallbackCount?'official-coverage':referenceAvailable?'dual':'unverified';
   state.evidence.absenceAuditWarning=referenceAvailable?'':referenceErrors.join('；')||'原始打卡來源無法核對，僅可在正式考勤有足夠覆蓋率時確認零打卡';
   state.evidence.absenceDiscrepancies=discrepancies;
   state.evidence.absenceDualCount=dualCount;
   state.evidence.absenceOfficialCoverageCount=fallbackCount;
   // Expose shift codes, not the employees' raw punch records or credentials.
   state.evidence.actualShifts=actualShifts;
   state.evidence.actualShiftDetails=actualShiftDetails;
   state.evidence.actualWorkedMinutes=actualWorkedMinutes;
   state.evidence.ambiguousShifts=ambiguousShifts;
   // Audit every employee and day of the loaded official month. Read-only:
   // conflicts are diagnostic, never an authorization to overwrite schedules.
   const audit=[];
   const savedRoster=new Map(schedules.map(row=>[id(row.empId),row.schedule||{}]));
   for(const person of people){
     const empId=id(person.id||person.empId),roster=savedRoster.get(empId)||{};
     if(!empId)continue;
     for(const [date,saved] of Object.entries(roster)){
       if(date.length!==10||date.slice(0,7)!==month||date[7]!=='-'||!eligible(person,date))continue;
       const key=empId+'|'+date,day=state.evidence.days?.[key];
       if(!day)continue;
       const original=String(saved||'').trim(),actual=actualShifts[key]||'';
       const base={empId,name:String(person.name||person.empName||empId),date,saved:original};
       if(day.state==='worked'&&actual&&['休','例','國'].includes(original))
         audit.push({...base,kind:'restday-worked',actual});
       else if(day.state==='worked'&&actual&&['早','中','晚'].includes(original)&&actual!==original)
         audit.push({...base,kind:'shift-mismatch',actual});
       else if(day.state==='worked'&&!actual)
         audit.push({...base,kind:'shift-unresolved',reason:ambiguousShifts[key]||'完整出勤，班別未能唯一確認'});
       else if(day.state==='missing')
         audit.push({...base,kind:'punch-missing'});
     }
   }
   const stateForAudit=day=>{
     const value=String(day?.state||'unknown');
     return ['worked','rest','missing'].includes(value)?value:'unknown';
   };
   state.evidence.audit=audit;
   // Account for EVERY rostered employee/date, including confirmed rest,
   // complete paired attendance, missing cards and incomplete source reads.
   // Scanning uses the entire loaded roster, independent of group filters.
   const dayCounts={checked:0,worked:0,rest:0,missing:0,unknown:0};
   const personnelAudit={};
   for(const person of people){
     const empId=id(person.id||person.empId),schedule=savedRoster.get(empId)||{};
     if(!empId)continue;
     const counts={checked:0,worked:0,rest:0,missing:0,unknown:0};
     for(const date of Object.keys(schedule)){
       if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,7)!==month||!eligible(person,date))continue;
       const classification=stateForAudit(state.evidence.days?.[empId+'|'+date]);
       counts.checked++;counts[classification]++;dayCounts.checked++;dayCounts[classification]++;
     }
     personnelAudit[empId]=counts;
   }
   state.evidence.personnelAudit=personnelAudit;
   state.evidence.auditSummary={employees:Object.keys(personnelAudit).length,
     daysChecked:dayCounts.checked,workedDays:dayCounts.worked,
     confirmedRestDays:dayCounts.rest,missingDays:dayCounts.missing,unknownDays:dayCounts.unknown,
     restDayWorked:audit.filter(row=>row.kind==='restday-worked').length,
     shiftMismatch:audit.filter(row=>row.kind==='shift-mismatch').length,
     shiftUnresolved:audit.filter(row=>row.kind==='shift-unresolved').length,
     punchMissing:audit.filter(row=>row.kind==='punch-missing').length};
   return state.evidence;
  }catch(e){state.error=e?.name==='AbortError'?'出勤核對逾時':String(e.message||e);state.evidence={complete:false,days:{}};return null;}
  finally{state.pending=false;if(ctx.token()===token&&states.get(month)===state)ctx.update?.(month,state);}})();return state.promise;
 }
 function refreshIfStale(month){
   const s=status(month);
   const changed=s.rosterSignature!==JSON.stringify(ctx.schedules())||
     s.personnelSignature!==JSON.stringify(ctx.employees());
   // A recent response is stale as soon as the roster OR personnel changes.
   if(s.pending)return s.promise.then(()=>refreshIfStale(month));
   return changed||!s.evidence.complete||now()-s.evidence.checkedAt>=60000?
     refresh(month):Promise.resolve(s.evidence);
 }
 return{refresh,status,refreshIfStale};
}
g.P79ScheduleRestEvidence={create,detectNightSplitRest};
})(window);
