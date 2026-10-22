(function(g){
'use strict';
const id=x=>String(x||'').trim().toUpperCase(),att=x=>String(x||'').trim().replace(/^0+/,'');
function create(ctx){
 const states=new Map(),reads=new Map(),now=()=>ctx.now?ctx.now():Date.now();
 function months(month){const d=new Date(month+'-01T00:00:00Z'),current=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).format(new Date(now()));const adjacent=n=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1)).toISOString().slice(0,7);return[adjacent(-1),month,...(adjacent(1)<=current?[adjacent(1)]:[])];}
 function read(month,token){
  const key=token+'|'+month,prior=reads.get(key);if(prior&&now()-prior.at<30000)return prior.promise;
  const entry={at:now()};entry.promise=Promise.resolve().then(()=>ctx.read(month,token)).then(data=>{if(data?.ok!==true||!Array.isArray(data.records)||data.records.some(r=>!r||typeof r!=='object'||Array.isArray(r))||data.month!=null&&String(data.month)!==month)throw Error('原始考勤未讀齊或月份不符');return data.records;}).catch(e=>{if(reads.get(key)===entry)reads.delete(key);throw e;});reads.set(key,entry);return entry.promise;
 }
 function status(month){const s=states.get(month);return s?.token===ctx.token()?s:{pending:false,error:'',evidence:{complete:false,days:{}}};}
 function refresh(month){
  const token=ctx.token();if(!token)return Promise.resolve(null);const prior=states.get(month);if(prior?.token===token&&prior.pending)return prior.promise;
  const state={token,pending:true,error:'',evidence:{complete:false,days:{}}};states.set(month,state);ctx.update?.(month,state);
  state.promise=(async()=>{try{
   const batches=await Promise.all(months(month).map(m=>read(m,token)));if(ctx.token()!==token||states.get(month)!==state)return null;
   const records=new Map();for(const batch of batches)for(const r of batch){if(!Number.isFinite(ctx.timestamp(r)))throw Error('出勤時間無效，不能判定整班無卡');const key=r.id?'ID:'+r.id:JSON.stringify([r.empId,r.attNo,r.timeStr,r.status]);records.set(key,r);}
   const people=ctx.employees(),schedules=ctx.schedules(),sessions=ctx.buildShifts([...records.values()]).map(row=>{
    const record=row.clockIn||row.clockOut||row.records?.[0]||row,emp=people.find(e=>id(e.id)===id(row.empId||record.empId))||people.find(e=>att(record.attNo)&&att(e.attNo||e.attendanceNo)===att(record.attNo));
    return{empId:emp?.id||'',start:row.clockIn?ctx.timestamp(row.clockIn):null,end:row.clockOut?ctx.timestamp(row.clockOut):null,time:ctx.timestamp(record)};
   }).filter(s=>s.empId);
   state.evidence=g.P79RestAttendance.build({complete:true,month,now:now(),schedules,sessions,leaveDates:ctx.leaveDates(month)});
   return state.evidence;
  }catch(e){state.error=e?.name==='AbortError'?'出勤核對逾時':String(e.message||e);state.evidence={complete:false,days:{}};return null;}
  finally{state.pending=false;if(ctx.token()===token&&states.get(month)===state)ctx.update?.(month,state);}})();return state.promise;
 }
 function refreshIfStale(month){const s=status(month);return s.pending?s.promise:!s.evidence.complete||now()-s.evidence.checkedAt>=60000?refresh(month):Promise.resolve(s.evidence);}
 return{refresh,status,refreshIfStale};
}
g.P79ScheduleRestEvidence={create};
})(window);
