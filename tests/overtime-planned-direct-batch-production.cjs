'use strict';
const fs=require('node:fs');
async function check(page,matcher,report){
 const assert=(condition,message)=>{if(!condition)throw Error(message);};
 const extract=(a,b)=>{const start=page.indexOf(a),end=page.indexOf(b,start);assert(start>=0&&end>start,'production functions exist');return page.slice(start,end);};
 const date='2026-11-23',today='2026-11-24';
 const config={overtimeConversionRowsV1:[
  ['休','休08-16',8,12.7,'','','08','16','full'],
  ['休','休16-24',8,12.7,'','','16','24','full'],
  ['休','休24-08',8,12.7,'','','24','08','full'],
  ['延','延16-20',4,6.02,'08','16','16','20','after','平日延長加班'],
  ['延','延20-08',4,6.02,'24','08','20','24','before','平日延時加班']
 ]};
 const window={p79OvertimeContext:{config:()=>config}};
 new Function('window',report)(window);new Function('window',matcher)(window);
 const api=window.P79Overtime, rules=api.reportRules();
 let p79OvertimeWritePriority=0,p79PlannedBulkBusy=false,p79OvertimeCalculationCache=null,p79PlannedBulkSelected=new Set(),p79OvertimePlannedFilteredRows=[],p79OvertimePlannedDisplayedRows=[],p79WorkOvertimeDisplayedRows=[];
 const p79CanReportOvertime=()=>true,p79OvertimeCoverDateWarning=()=>null,p79OvertimePendingReason=()=>({code:'review'}),p79DirectAttendanceTimestamp=x=>Date.parse(x.timeStr),p79OvertimeAttendanceIssue=()=>'',p79WorkOvertimeRoster=()=>({}),normalizeScheduleDateKey=x=>x;
 const p79ResolvePlannedOvertimePeriod=row=>window.P79OvertimeShiftMatch.resolve({date,roster:{},report:row.overtimeReport,rules,start:p79DirectAttendanceTimestamp(row.clockIn),end:p79DirectAttendanceTimestamp(row.clockOut)});
 const document={querySelectorAll:()=>[],getElementById:()=>null};
 let saves=0,notice=[],renders=0,staleRule=false,staleLink=false,fail=false,contextDraft=null;
 const showToast=(m,t)=>notice.push([m,t]),renderOvertimeStats=()=>renders++;
 const p79SaveWorkOvertimeDraft=async draft=>{assert(contextDraft===draft,'reuse same fresh cloud validation context');saves++;return {ok:true,directOvertimeSaved:true,id:draft.id,report:{...draft.rule,id:draft.id,planned:fail}}};
 const row=(i,code,begin,end,linked=false)=>{const rule=api.report(rules.find(r=>r[1]===code));return {name:'fixture'+i,empId:'E'+i,rosterDate:date,reportVerified:true,clockIn:{timeStr:begin},clockOut:{timeStr:end},overtimeReport:{...rule,id:'R'+i,planned:true,...(linked?{leaveId:'L',forEmpId:'T',coverDate:date,overtimeDate:date}:{})},forEmpId:linked?'T':''};};
 const rows=[
 row(1,'休08-16',date+'T07:33:00+08:00',date+'T15:47:00+08:00'),
 row(2,'休16-24',date+'T15:31:00+08:00',date+'T23:46:00+08:00'),
 row(3,'休24-08',date+'T23:31:00+08:00','2026-11-24T07:45:00+08:00'),
 row(4,'延16-20',date+'T07:31:00+08:00',date+'T19:45:00+08:00',true),
 row(5,'延20-08',date+'T19:38:00+08:00','2026-11-24T07:48:00+08:00')
 ];
 api.prepareSaveValidation=async draft=>{contextDraft=draft;const current=rows.find(r=>r.empId===draft.empId).overtimeReport;return {rules:{rows:staleRule?rules.filter(r=>r[1]!==draft.rule.code):rules,config},cloud:{schedules:[{empId:draft.empId,schedule:{__meta:{[draft.date]:{overtimeReport:{...current,...(staleLink?{leaveId:'CHANGED'}:{})}}}}}]}};};
 const main=extract('        let p79MainPlannedSubmittingKey=','        // Identify old saved two-person');
 const bulk=extract('        function p79PlannedBulkKey(','        async function p79BatchConfirmPlannedOvertime(');
 const f=eval(main+bulk+';({candidate:p79PlannedBulkCandidate,select:p79PlannedBulkSelectPage,open:p79OpenMainPlannedOvertimeRow})');
 for(const r of rows)assert(f.candidate(r,today),'complete eligible shift '+r.overtimeReport.code);
 assert(!f.candidate({...rows[0],clockOut:null},today),'missing punch blocked');
 assert(!f.candidate(row(6,'延20-08',date+'T19:35:00+08:00','2026-11-24T05:47:00+08:00'),today),'short night shift blocked');
 p79OvertimePlannedFilteredRows=Array.from({length:60},(_,i)=>({...rows[0],empId:'X'+i,overtimeReport:{...rows[0].overtimeReport,id:'X'+i}}));
 p79OvertimePlannedDisplayedRows=p79OvertimePlannedFilteredRows.slice(0,50);
 f.select(true);assert(p79PlannedBulkSelected.size===60,'select all across pages');f.select(false);assert(!p79PlannedBulkSelected.size,'clear all across pages');
 p79WorkOvertimeDisplayedRows=rows;
 const button={dataset:{planKey:f.candidate(rows[3],today).key}};
 staleRule=true;await f.open(3,button);assert(saves===0&&notice.at(-1)[1]==='warning','changed rule blocks write');staleRule=false;
 staleLink=true;await f.open(3,button);assert(saves===0&&notice.at(-1)[1]==='warning','changed cover blocks write');staleLink=false;
 await f.open(3,button);assert(saves===1&&notice.at(-1)[1]==='success','direct report succeeds on same row');
 assert(contextDraft.id==='R4'&&contextDraft.leaveHandoffId==='L'&&contextDraft.forEmpId==='T','original report and cover preserved');
 fail=true;await f.open(3,button);assert(saves===2&&notice.at(-1)[1]==='warning'&&!p79PlannedBulkBusy,'unconfirmed result never marked success');
 assert(renders===4,'refresh after each attempted direct confirmation');
 return 'PASS complete early/middle/night, extensions, linked report, cross-page selection, fresh rule/cover checks, direct save and failure';
}
check(fs.readFileSync('work-hours/index.html','utf8'),fs.readFileSync('assets/port79-overtime-shift-match.js','utf8'),fs.readFileSync('assets/port79-overtime-report.js','utf8')).then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
