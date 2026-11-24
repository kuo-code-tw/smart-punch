'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const a=code.indexOf('function isReadOnlySource()'),b=code.indexOf('function visibleExistingRows()',a);
assert(a>=0&&b>a,'automatic prior-month confirmation helpers exist');
const ctx={cats:['例','休','國'],snapshot:{provisional:false,readOnlyDueAttendance:false,attendanceEvidence:{complete:true}},
 autoPlan:true,loadedMonth:'2026-10',today:()=> '2026-11-01',
 model:{workflow:{canSubmit:true},rows:[
 {empId:'FL01',date:'2026-10-15',category:'休',status:'可申報',checked:false,saved:false,planned:false},
 {empId:'FL02',date:'2026-10-16',checked:false,saved:false,planned:true},
 {empId:'FL03',date:'2026-10-20',checked:false,saved:true,planned:false}
 ]}};
vm.createContext(ctx);vm.runInContext(code.slice(a,b),ctx);
assert.equal(ctx.autoHistoricalReady(),true);
ctx.autoSelectVerifiedHistory();
assert.deepEqual(ctx.model.rows.map(r=>r.checked),[true,false,false],
 'only already-verified, not-yet-submitted historical candidates are selected');
ctx.snapshot.readOnlyDueAttendance=true;ctx.model.rows[0].checked=false;
ctx.autoSelectVerifiedHistory();assert.equal(ctx.model.rows[0].checked,false,'missing evidence prevents preselection');
ctx.snapshot.readOnlyDueAttendance=false;ctx.snapshot.provisional=true;
ctx.autoSelectVerifiedHistory();assert.equal(ctx.model.rows[0].checked,false,'provisional archive remains read-only');
ctx.snapshot.provisional=false;ctx.snapshot.attendanceEvidence.complete=false;ctx.autoSelectVerifiedHistory();assert.equal(ctx.model.rows[0].checked,false,'incomplete evidence without legacy flags prevents preselection');ctx.snapshot.attendanceEvidence.complete=true;ctx.loadedMonth='2026-11';
assert.equal(ctx.autoHistoricalReady(),false,'current month is not historical');
ctx.model.rows=[
 {empId:'A',date:'2026-11-01',category:'休',status:'可申報'},
 {empId:'B',date:'2026-11-01',category:'國',status:'可申報'},
 {empId:'C',date:'2026-11-02',category:'休',status:'可申報'},
 {empId:'D',date:'2026-11-01',category:'例',status:'可申報'},
 {empId:'E',date:'2026-11-01',category:'休',status:'待核對'},
 {empId:'F',date:'2026-11-01',category:'休',status:'可申報',attempted:true}
];
ctx.autoSelectVerifiedHistory();
assert.deepEqual(ctx.model.rows.map(r=>!!r.checked),[true,true,false,true,false,false]);
assert(code.includes('const selected=visibleRows().map(({r})=>r).filter'),'only current visible scope is submitted');
assert(code.includes("!backfillContext(loadedMonth).historical&&!confirm("),'explicit current-month confirmation before writing');
assert(code.includes("if(!hasFormal&&autoPlan&&!autoHistoricalReady())return q('#mrSavePlans').onclick();"),
 'historical automatic selection must enter the existing formal verification flow');
assert(code.includes("if(selected.some(r=>r.category==='例')&&!confirm("),'regular-day legal exception still requires explicit confirmation');
assert(code.includes('if(context.historical&&!confirm('),
 'cross-month formal submission requires one explicit approval');
assert(code.includes('if(!fullDayEvidence(fresh,r.empId,r.date,attendance[0]))'),
 'fresh punch evidence must be revalidated');
assert(code.includes('if(meta.overtimeReport||meta.overtime||meta.forEmpId'),
 'existing declarations can never be duplicated');
assert(code.includes('if(result?.ok!==true||result.directOvertimeSaved!==true'),
 'backend acknowledgment is checked');
assert(code.includes("if(report?.id===r.id&&report.planned!==true&&report.category===r.category"),
 'post-write confirmation requires cloud readback');
console.log('PASS historical auto mode: all genuine candidates preselected, one existing batch submit, no implicit writes, verified readback and read-only guard');
