(function(g){
'use strict';
const id=x=>String(x||'').trim().toUpperCase(),att=x=>String(x||'').trim().replace(/^0+/,'');
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
  const retained=prior?.token===token&&prior.rosterSignature===rosterSignature&&prior.evidence?.complete===true?prior.evidence:null;
  const state={token,rosterSignature,pending:true,error:'',evidence:retained||{complete:false,days:{}}};states.set(month,state);ctx.update?.(month,state);
  state.promise=(async()=>{try{
   const batches=await Promise.all(months(month).map(m=>read(m,token)));if(ctx.token()!==token||states.get(month)!==state)return null;
   const records=new Map(),referenceRecords=new Map();
   let referenceAvailable=batches.every(batch=>Array.isArray(batch.reference));
   const referenceErrors=batches.map(batch=>batch.referenceError||'').filter(Boolean);
   for(const batch of batches){
     for(const r of batch.official){
       if(!Number.isFinite(ctx.timestamp(r)))throw Error('正式考勤時間無效，不能判定整班無卡');
       const key=r.id?'ID:'+r.id:JSON.stringify([r.empId,r.attNo,r.timeStr,r.status]);records.set(key,r);
     }
     if(Array.isArray(batch.reference))for(const r of batch.reference){
       if(!Number.isFinite(ctx.timestamp(r))){referenceAvailable=false;continue;}
       const key=r.id?'ID:'+r.id:JSON.stringify([r.empId,r.attNo,r.timeStr,r.status]);referenceRecords.set(key,r);
     }
   }
   // An unexpectedly empty original-punch feed is not proof that everyone was off.
   // Both independent feeds need at least one row for the target month.
   const belongsToMonth=r=>{
     const v=String(r.timeStr||r.time||'').match(/^(\\d{4})[\\/-](\\d{1,2})[\\/-](\\d{1,2})/);
     return v&&v[1]+'-'+v[2].padStart(2,'0')===month;
   };
   if(![...records.values()].some(belongsToMonth)||![...referenceRecords.values()].some(belongsToMonth))referenceAvailable=false;
   const people=ctx.employees(),pairedRows=ctx.buildShifts([...records.values()]);
   // Only validated paired punches can supply the ACTUAL shift displayed in
   // the monthly roster. This does not rewrite statutory roster history.
   const actualShifts={},actualWorkedMinutes={},ambiguousShifts={},aggregates=new Map();
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
    if(!prior)aggregates.set(key,{shift:paired.shift,minutes,conflict:false});
    else{prior.minutes+=minutes;if(prior.shift!==paired.shift)prior.conflict=true;}
   }
   for(const [key,value] of aggregates){
     if(value.conflict){ambiguousShifts[key]='同一工作日存在不同班別的完整出勤';continue;}
     actualShifts[key]=value.shift;actualWorkedMinutes[key]=value.minutes;
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
   if(JSON.stringify(ctx.schedules())!==rosterSignature)throw Error('核對期間班表已更新，需重新讀取考勤');
   state.evidence=g.P79RestAttendance.build({complete:true,month,now:now(),schedules,sessions,leaveDates:ctx.leaveDates(month)});
   // Absence must be confirmed by BOTH independent authenticated feeds, not
   // inferred from an empty or truncated official attendance response.
   const confirmed={};let discrepancies=0;
   let referenceEvidence=null;
   if(referenceAvailable){
     const pairedReference=ctx.buildShifts([...referenceRecords.values()]);
     referenceEvidence=g.P79RestAttendance.build({complete:true,month,now:now(),schedules,
       sessions:mapSessions(pairedReference),leaveDates:ctx.leaveDates(month)});
   }
   for(const [key,day] of Object.entries(state.evidence.days||{})){
     if(day.state!=='rest')continue;
     if(referenceEvidence?.days?.[key]?.state==='rest'){
       confirmed[key]=true;
     }else{
       // Do not conflate incomplete cross-source evidence with verified leave.
       day.state='unknown';day.absenceUnverified=true;discrepancies++;
     }
   }
   state.evidence.absenceConfirmedDays=confirmed;
   state.evidence.absenceAuditReady=referenceAvailable;
   state.evidence.absenceAuditWarning=referenceAvailable?'':referenceErrors.join('；')||'原始打卡核對不完整，已暫停無卡判休';
   state.evidence.absenceDiscrepancies=discrepancies;
   // Expose shift codes, not the employees' raw punch records or credentials.
   state.evidence.actualShifts=actualShifts;
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
       if(date.length!==10||date.slice(0,7)!==month||date[7]!=='-')continue;
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
   state.evidence.audit=audit;
   state.evidence.auditSummary={employees:people.length,
     restDayWorked:audit.filter(row=>row.kind==='restday-worked').length,
     shiftMismatch:audit.filter(row=>row.kind==='shift-mismatch').length,
     shiftUnresolved:audit.filter(row=>row.kind==='shift-unresolved').length,
     punchMissing:audit.filter(row=>row.kind==='punch-missing').length};
   return state.evidence;
  }catch(e){state.error=e?.name==='AbortError'?'出勤核對逾時':String(e.message||e);state.evidence={complete:false,days:{}};return null;}
  finally{state.pending=false;if(ctx.token()===token&&states.get(month)===state)ctx.update?.(month,state);}})();return state.promise;
 }
 function refreshIfStale(month){const s=status(month);return s.pending?s.promise:!s.evidence.complete||now()-s.evidence.checkedAt>=60000?refresh(month):Promise.resolve(s.evidence);}
 return{refresh,status,refreshIfStale};
}
g.P79ScheduleRestEvidence={create};
})(window);
