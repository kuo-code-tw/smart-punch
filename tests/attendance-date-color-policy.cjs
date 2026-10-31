'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('assets/port79-attendance-overtime.js','utf8');
new vm.Script(code);
const dates=['2026-10-15','2026-10-16','2026-10-17','2026-10-18','2026-11-01'];
const buttons=dates.map(date=>({date,style:{
 setProperty(k,v){this[k]=v},removeProperty(k){delete this[k]}
},dataset:{},removeAttribute(k){delete this[k]},setAttribute(k,v){this[k]=v}}));
const strip={querySelectorAll:()=>buttons,querySelector:()=>null,appendChild(x){this.legend=x}};
const document={readyState:'complete',getElementById:id=>id==='p79AttendanceDateStrip'?strip:null,
 createElement:()=>({style:{},textContent:''})};
const revocation={confirmed:true,report:{id:'R3',code:'休08-16'},reportId:'R3',
 empId:'E3',date:dates[2],actor:'主管',at:'2026-10-28'};
const state={ready:true,people:[{empId:'E1',name:'甲'},{empId:'E3',name:'乙'}],rows:[
 {empId:'E1',schedule:{__meta:{
  [dates[0]]:{overtimeReport:{id:'R1',code:'國08-16'}},
  [dates[1]]:{overtimeReport:{id:'R2',code:'休08-16',reportedAt:'original',modifiedAt:'edited'}}
 }}},
 {empId:'E3',schedule:{__meta:{[dates[2]]:{overtimeRevocations:[revocation]}}}}
]};
const c={document,renderRecordsPagination(){return 1},
 p79AttendanceOvertimeMonths:new Map([['2026-10',state]]),addEventListener(){}};
c.window=c;
vm.createContext(c);
vm.runInContext(code,c);
const ui=c.P79AttendanceOvertimeDayStatus;
ui.decorateOvertimeDateStrip(dates,dates[3]);
const expected=[
 ['reported','#dcfce7'],['amended','#fef3c7'],['revoked','#fee2e2'],
 ['none','#ffffff'],['unknown','#f1f5f9']
];
expected.forEach(([audit,color],i)=>{
 assert.equal(buttons[i].dataset.p79OvertimeAudit,audit,dates[i]+' label');
 assert.equal(buttons[i].style['background-color'],color,dates[i]+' background');
});
assert.match(buttons[3].style['box-shadow'],/#4f46e5/,'未申報選取日保持白底、紫框');
assert.match(buttons[3].title,/沒有正式加班申報/);
assert.match(buttons[4].title,/尚未確認/,'雲端沒載入不能假裝無申報');
assert.equal(strip.legend.textContent,'白：無申報｜綠：已申報／已核對｜黃：歷史修改待核對｜紅：已取消｜灰：未確認');
console.log('PASS: 白=無申報、綠=已申報、黃=已修改、紅=已取消、灰=雲端未知，不被選取日期覆蓋');
