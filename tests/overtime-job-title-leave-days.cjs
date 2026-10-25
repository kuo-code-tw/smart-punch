const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
const a=html.indexOf('        function p79BuildOvertimeTitleLeaveDays(');
const b=html.indexOf('        function renderOvertimeStats() {',a);
assert(a>=0&&b>a,'approved leave aggregation must be defined before render');
const ctx={Map,Set,Date,Math,Number,String,Array};
const normal=x=>String(x||'').trim().toUpperCase();
ctx.leaveBelongsToEmployee=(l,e)=>normal(l.empId)===normal(e.empId);
ctx.toDateInputValue=v=>{const m=String(v||'').match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):''};
ctx.getLeaveDays=l=>{
 if(l.durationUnit==='days')return Number(l.days??l.hours??0);
 if(l.startDate&&l.endDate)return Math.round((Date.parse(ctx.toDateInputValue(l.endDate)+'T00:00:00Z')-Date.parse(ctx.toDateInputValue(l.startDate)+'T00:00:00Z'))/86400000)+1;
 return Number(l.hours||0)/8;
};
vm.createContext(ctx);
vm.runInContext(html.slice(a,b),ctx);
const all=[
 {empId:'E1',jobTitle:'ARMG'},{empId:'E2',jobTitle:'ARMG'},
 {empId:'E3',jobTitle:'AQC'},{empId:'E4',jobTitle:'AQC'},
 {empId:'E5',jobTitle:'F/L'}
];
// Even staff with no overtime must have their approved leave included by job title.
const approved=[
 {id:'L1',empId:'E2',status:'已核准',startDate:'2026-10-03',endDate:'2026-10-03',durationUnit:'days',days:1},
 {id:'L2',empId:'E1',status:'已核準',startDate:'2026-10-05',endDate:'2026-10-05',durationUnit:'days',days:0.5},
 {id:'L3',empId:'E3',status:'已核准',startDate:'2026-09-30',endDate:'2026-10-02',durationUnit:'days',days:3},
 {id:'L4',empId:'E4',status:'待審核',startDate:'2026-10-08',endDate:'2026-10-08',durationUnit:'days',days:1},
 {id:'L5',empId:'E4',status:'已駁回',startDate:'2026-10-09',endDate:'2026-10-09',durationUnit:'days',days:1},
 {id:'L6',empId:'E4',status:'已核准',startDate:'2026-11-01',endDate:'2026-11-01',durationUnit:'days',days:1},
 {id:'L7',empId:'OUT_OF_SCOPE',status:'已核准',startDate:'2026-10-11',endDate:'2026-10-11',durationUnit:'days',days:1}
];
let summary=ctx.p79BuildOvertimeTitleLeaveDays(all,[...approved,approved[0]],'2026-10');
assert.equal(summary.loaded,true);assert.equal(summary.unknown,0);
assert.equal(summary.byTitle.get('ARMG').days,1.5,'all ARM G workers count, including no overtime');
assert.equal(summary.byTitle.get('AQC').days,2,'cross-month full-day leave counts only days in October');
assert.equal(summary.byTitle.get('F/L').days,0,'valid all-staff roster with no approved leave is zero');
assert.equal([...summary.byTitle.values()].reduce((n,x)=>n+x.days,0),3.5);
assert.equal(ctx.p79BuildOvertimeTitleLeaveDays(all,null,'2026-10').loaded,false,'unknown cloud read is not zero');
assert.equal(ctx.p79BuildOvertimeTitleLeaveDays(all,[],'ALL').loaded,false,'ALL month cannot imply complete leave coverage');
summary=ctx.p79BuildOvertimeTitleLeaveDays(all,[{id:'CROSS-PART',empId:'E3',status:'已核准',durationUnit:'days',days:.5,startDate:'2026-09-30',endDate:'2026-10-01'}],'2026-10');
assert.equal(summary.unknown,1,'no exact per-day distribution for partial cross-month leave; do not guess');
assert.equal(summary.byTitle.get('AQC').unknown,true);
const section=html.slice(html.indexOf('<details id="p79OvertimeJobTitleSummary"'),html.indexOf('</details>',html.indexOf('<details id="p79OvertimeJobTitleSummary"')));
const headers=(section.match(/<th class="p-2[^"]*">/g)||[]).length;
assert.equal(headers,7,'seven columns after removing both converted-hour columns and adding leave days');
assert(section.includes('>總人數</th>')&&section.includes('>請假天數</th>'));
assert(!section.includes('>換算合計（小時）</th>')&&!section.includes('>每人平均分擔換算（小時）</th>'));
assert(html.includes('monthRosterState?.ready')&&html.includes('p79BuildOvertimeTitleLeaveDays('),'leave data must use verified cloud roster');
assert(html.includes("'<td class=\"p-2 text-right\">'+(g.jobTitle==='全部職稱合計'"),'approved leave must display per role and in totals');
assert(html.includes('colspan="7"'),'empty state column span must match');
console.log('PASS job-title leave days: staff including non-overtime, approved only, duplicate id, month overlap, half day, unknown cloud/cross-month, table columns');
