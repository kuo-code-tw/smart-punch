/* Infer a display-only overtime period from actual punches. Never mutate cloud reports. */
(function(g){
 'use strict';
 const TOL=45*60000,HOUR=3600000;
 const categories=new Set(['休','例','國','代','延']);
 function minute(value){
  const m=String(value??'').trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if(!m)return NaN;
  const h=Number(m[1]),n=Number(m[2]||0);
  return h<=24&&n<60&&(h!==24||n===0)?h*60+n:NaN;
 }
 function datespan(date,r){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return null;
  const a=minute(r?.[6]),b=minute(r?.[7]);
  if(!Number.isFinite(a)||!Number.isFinite(b))return null;
  const duration=(b<=a?b+1440:b)-a;
  if(duration<=0||duration>18*60)return null;
  const base=Date.parse(date+'T00:00:00+08:00');
  if(!Number.isFinite(base))return null;
  return{start:base+a*60000,end:base+(a+duration)*60000,duration};
 }
 function sameReport(report,row){
  if(!report||!row)return false;
  return String(report.category||'')===String(row[0]||'')&&
   minute(report.overtimeStart)===minute(row[6])&&minute(report.overtimeEnd)===minute(row[7]);
 }
 function ruleLabel(row){return String(row?.[1]||row?.[0]||'');}
 function typeAllowed(row,report){
  if(!report)return true;
  const code=String(report.code||'').trim(),candidate=String(row[1]||'');
  // Do not silently replace typhoon/election reports with ordinary 國 rules.
  if(/^[颱選]/.test(code))return candidate.startsWith(code[0]);
  if(String(report.category)==='國'&&/^[颱選]/.test(candidate))return false;
  if(report.typeName&&row[9]&&String(report.typeName)!==String(row[9]))return false;
  return true;
 }
 function resolve(input){
  const date=String(input?.date||''),report=input?.report||null,roster=input?.roster||{};
  const category=String(report?.category||(['休','例','國'].includes(roster[date])?roster[date]:''));
  const rows=Array.isArray(input?.rules)?input.rules:[];
  const eligible=rows.map((r,i)=>({row:r,index:i,span:datespan(date,r)}))
   .filter(x=>x.span&&x.row?.[0]===category&&categories.has(category)&&typeAllowed(x.row,report)&&
    (category!=='延'||x.row[8]!=='before'&&x.row[8]!=='after'));
  const result={state:'none',code:'',category,oldCode:String(report?.code||''),suggested:null,mismatch:false,reason:'',confirmed:false};
  if(!eligible.length)return result;
  const start=Number(input?.start),end=Number(input?.end);
  const hasIn=input?.start!=null&&Number.isFinite(start)&&start>0;
  const hasOut=input?.end!=null&&Number.isFinite(end)&&end>0;
  const complete=hasIn&&hasOut&&end>start&&end-start<=18*HOUR&&input?.attendanceIssue!=='pairing';
  let ranked=[];
  if(complete){
   const limit=g.P79Overtime?.declarationEnd?.(end);
   ranked=eligible.map(x=>({...x,diff:Math.abs(start-x.span.start)+Math.abs(end-x.span.end)})).filter(x=>
     Math.abs(start-x.span.start)<=TOL&&Math.abs(end-x.span.end)<=TOL&&
     (!Number.isFinite(limit)||x.span.end<=limit)&&start<=x.span.start+TOL);
   if(category==='延'&&typeof g.P79Overtime?.inferRule==='function'){
    // Extended-day rules include normal-shift anchors. Reuse their validator.
    const chosen=g.P79Overtime.inferRule(start,end,date,rows.filter(r=>r?.[0]==='延'),category);
    if(chosen)ranked=eligible.filter(x=>x.row===chosen).map(x=>({...x,diff:0}));
   }
  }else if(hasIn&&!hasOut&&input?.attendanceIssue!=='pairing'){
   ranked=eligible.map(x=>({...x,diff:Math.abs(start-x.span.start)}))
    .filter(x=>x.diff<=TOL && category!=='延');
  }
  if(!ranked.length)return result;
  // Latest roster is a tie breaker, but real completed punch times outrank old metadata.
  const shiftPeriod={早:'08-16',中:'16-24',晚:'24-08'}[String(roster[date]||'')];
  const exactShift=x=>shiftPeriod&&minute(x.row[6])===minute(shiftPeriod.split('-')[0])&&
   minute(x.row[7])===minute(shiftPeriod.split('-')[1]);
  ranked.sort((a,b)=>{
   if(complete)return a.diff-b.diff||a.index-b.index;
   const shiftRank=x=>exactShift(x)?0:1;
   const eightRank=x=>x.span.duration===8*60&&Number(x.row[2])===8?0:1;
   return a.diff-b.diff||shiftRank(a)-shiftRank(b)||eightRank(a)-eightRank(b)||a.index-b.index;
  });
  const first=ranked[0],second=ranked[1];
  // A single punch never proves a duration; if equally plausible rules remain,
  // only show a tentative period when roster or a unique 8-hour rule decides.
  if(!complete&&second&&first.diff===second.diff){
   if(!exactShift(first)&&!(first.span.duration===480&&Number(first.row[2])===8&&
      !ranked.some(x=>x!==first&&x.diff===first.diff&&x.span.duration===480&&Number(x.row[2])===8)))return result;
  }
  const candidate=first.row;
  result.state=complete?'completed':'tentative';
  result.suggested={code:ruleLabel(candidate),category:candidate[0],
   overtimeStart:candidate[6],overtimeEnd:candidate[7],
   declaredHours:Number(candidate[2]),convertedHours:candidate[3]};
  result.code=result.suggested.code;
  result.mismatch=!!report&&!sameReport(report,candidate);
  result.confirmed=complete&&input?.attendanceIssue!==true;
  result.reason=complete
   ?result.mismatch?'實際打卡時段與既有正式申報不同，請核對後修改；原申報尚未更動':'實際上下班與申報時段相符'
   :result.mismatch?'僅依上班打卡推估，仍待下班簽退；不得自動修改正式申報':'尚未下班，時段僅供預估';
  return result;
 }
 g.P79OvertimeShiftMatch={resolve,minute,sameReport};
})(typeof window==='undefined'?globalThis:window);
