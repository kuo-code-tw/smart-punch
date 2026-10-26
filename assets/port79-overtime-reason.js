(function(g){
'use strict';
// Shared presentation/ledger classification. This never edits cloud declarations.
const norm=x=>String(x??'').trim();
const uid=x=>norm(x).toUpperCase();
const validDays=new Set(['颱']);
function typhoonDate(date,roster={},snapshot=null){
 if(norm(roster?.[date])==='颱'||(snapshot?.typhoonDays||[]).includes(date))return true;
 try{
  if(g.P79SpecialOvertime?.kindsForDate?.(date)?.some(item=>item.kind==='typhoon'))return true;
  const days=JSON.parse(g.localStorage?.getItem('p79-manual-typhoon-days-v1')||'[]');
  if(Array.isArray(days)&&days.includes(date))return true;
 }catch(_){}
 return false;
}
function coverFor(empId,date,meta={},report={},snapshot=null){
 if(report.category==='代'||/代班/.test(norm(report.typeName)))return true;
 const covers=snapshot?.leaveCoverAssignments||[];
 const matching=covers.some(c=>
  date>=norm(c.startDate)&&date<=norm(c.endDate)&&
  (c.workerIds||[]).some(id=>uid(id)===uid(empId))&&
  (!report.leaveId||uid(c.leaveId)===uid(report.leaveId)));
 if(matching)return true;
 // Older confirmed substitute reports can have a link but not a materialized cover.
 return !!(norm(meta.forEmpId)||norm(report.leaveId))&&
  (report.category==='代'||/代班/.test(norm(report.typeName))||meta.type==='substitute');
}
function classify({empId,date,meta={},report={},roster={},snapshot=null}){
 const typhoon=/颱風|颱日|停班/.test(norm(report.typeName)+' '+norm(report.note))||
  /^颱/.test(norm(report.code))||typhoonDate(date,roster,snapshot);
 if(typhoon)return {exempt:true,kind:'typhoon',label:'颱風天加班',detail:'颱風天加班，不計例／休／國超額'};
 if(coverFor(empId,date,meta,report,snapshot)){
  // 本人原排「休」，改在自己的休息日出勤代班且有休加正式申報，
  // 即使連結其他員工的請假，仍應列入本人的「休」額度，而不是全部豁免。
  const ownRestOvertime=report.category==='休' &&
    (meta.restCategory==='休'||meta.overtimeOriginalShift==='休'||meta.restQuotaOvertime===true)&&
    !!norm(report.id)&&meta.overtimeExcluded!==true&&
    !(meta.overtimeRevocations||[]).some(x=>x?.confirmed===true&&norm(x.reportId)===norm(report.id));
  if(ownRestOvertime)return {exempt:false,kind:'rest-cover',label:'休息日代班加班',detail:'使用本人休息日出勤；正式休加計入本人休息日額度'};
  const source=(snapshot?.approvedLeaves||[]).find(l=>
   norm(l.empId)===norm(meta.forEmpId)&&date>=norm(l.start)&&date<=norm(l.end));
  const annual=source&&/年|特|annual/i.test(norm(source.leaveType));
  return {exempt:true,kind:'cover',label:annual?'年假代班加班':'請假代班加班',
   detail:annual?'年假人員代班，不計例／休／國超額':'請假代班，不計例／休／國超額'};
 }
 return {exempt:false,kind:'ordinary',label:'一般加班',detail:''};
}
function reportNote(input){
 const kind=classify(input),report=input?.report||{},meta=input?.meta||{};
 const original=norm(report.note||meta.note);
 const notes=[];
 if(kind.exempt||kind.kind==='rest-cover')notes.push(kind.label);
 else if(/吊櫃/.test(norm(report.typeName)+' '+original))notes.push('吊櫃作業');
 else notes.push(norm(report.typeName)||'加班申報');
 if(original&&!notes.includes(original))notes.push(original);
 return notes.join('／');
}
function amended(report,meta={}){
 const history=Array.isArray(meta.overtimeAmendments)?meta.overtimeAmendments:
  Array.isArray(meta.overtimeRevisions)?meta.overtimeRevisions:
  Array.isArray(report?.amendments)?report.amendments:[];
 const prior=history.filter(x=>x?.confirmed===true&&norm(x.at)&&norm(x.actor));
 const modifiedAt=norm(report?.modifiedAt||report?.updatedAt||prior.at(-1)?.at);
 // reportedAt may be different; do not infer a change from initial creation.
 const createdAt=norm(report?.reportedAt||report?.createdAt);
 const evidence=prior.length>0||!!norm(report?.replacesReportId)||
  !!(modifiedAt&&createdAt&&modifiedAt!==createdAt);
 return {verified:evidence,history:prior,modifiedAt:evidence?modifiedAt:'',priorId:norm(report?.replacesReportId)};
}
g.P79OvertimeReason={typhoonDate,coverFor,classify,reportNote,amended};
})(window);
