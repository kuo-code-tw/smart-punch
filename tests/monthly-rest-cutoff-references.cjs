'use strict';
const fs=require('node:fs');
function test(core,ui){
 const assert=(x,m)=>{if(!x)throw Error(m)};
 const month='2026-11',now=month+'-24',day=n=>month+'-'+String(n).padStart(2,'0');
 const emp={empId:'A',name:'fixture'},roster=Object.fromEntries(Array.from({length:30},(_,i)=>[day(i+1),'晚']));
 roster.__meta={[day(19)]:{overtimeReport:{id:'R19',category:'延'}},[day(21)]:{forEmpId:'B'}};
 roster[day(22)]='休';
 const pair=n=>({empId:'A',date:day(n),start:Date.parse(day(n)+'T00:00:00+08:00'),end:Date.parse(day(n)+'T08:00:00+08:00')});
 const window={P79RestAttendance:{state:()=> 'worked',isLeaveDay:()=>false},P79Overtime:{inferRule:(s,e,d,r)=>r[0]||null,ruleAttendanceIssue:()=>''},p79RestQuota:()=>({slots:[]})};
 new Function('window',core)(window);
 new Function('window','document',ui)(window,{});
 const api=window.P79MonthlyRest,rules=[['休','休24-08',8,12.7,'','','24','08','full']];
 const snapshot={schedules:[{empId:'A',schedule:roster}],pairs:[pair(16),pair(18),pair(19),pair(21),pair(22),{...pair(23),end:null}],leaveDates:[],attendanceEvidence:{complete:true}};
 const b={dates:Object.keys(roster).filter(d=>d.startsWith(month)),remaining:{例:0,休:3,國:0},typhoonDates:[],nextReportDate:day(18)};
 const refs=api.rosterPeriodReferences(snapshot,emp,b,month,rules,now);
 assert(refs.some(r=>r.date===day(18)&&r.actualReference&&!r.eligible),'18th completed ordinary shift visible but not formal');
 assert(refs.some(r=>r.date===day(22)&&r.actualReference&&!r.eligible),'completed original rest date visible for review');
 assert(!refs.some(r=>[day(16),day(19),day(21),day(23)].includes(r.date)),'cutoff/existing/cover/incomplete excluded');
 const suggestions=api.personPeriodSuggestions({balances:[{emp,...b}],rows:[],plannedRows:[],rosterReferences:{A:refs}},'A',now).suggestions;
 assert(suggestions.length===3&&suggestions.some(r=>r.date===day(18)),'fill dated references from selected range');
 const person={id:'A',name:'fixture',reviewType:'deficit',due:4,category:'例0／休4／國0',suggestions};
 const rows=window.P79MonthlyRestDashboard.dailyPendingRows({roster:[person],ready:[],planned:[]});
 assert(rows.filter(r=>r.residualOnly).length===1&&rows.filter(r=>!r.residualOnly).every(r=>r.date>=day(18)),'residual separate from dated rows');
 assert(rows.filter(r=>!r.residualOnly).every(r=>window.P79MonthlyRestDashboard.selectionMode(r)==='review'),'reference never formally submitted');
 assert(ui.includes('const pending=daily.filter(r=>!r.residualOnly)'),'blank row removed from filing list');
 return 'PASS cutoff 17 -> completed work from 18, exclusions, references not payable, residual separated';
}
console.log(test(fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8'),fs.readFileSync('assets/port79-monthly-rest-dashboard.js','utf8')));
