const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
const start=html.indexOf('        function p79BuildOvertimeJobTitleSummary(rows,personnel=[]) {');
const end=html.indexOf('        function renderOvertimeStats() {',start);
assert(start>=0&&end>start,'job-title overtime calculation function must exist');
const c={Map,Set,Number,String,Array,Math};
vm.createContext(c);
vm.runInContext(html.slice(start,end),c);
const report=(emp,dept,date,declared,converted,extra={})=>({empId:emp,dept,jobTitle:dept==='A'?'ARMG':'AQC',dateKey:date,rosterDate:date,reportVerified:true,overtimeMinutes:977,overtimeReport:{id:emp+'-'+date,declaredHours:declared,convertedHours:converted,...extra}});
const a=report('E1','A','2026-10-01',4,6.02);
const b=report('E1','A','2026-10-02',8,12.70);
const x=report('E2','A','2026-10-03',4,null);
const y=report('E3','B','2026-10-01',8,12.70);
const invalid=report('E4','B','2026-10-02',5,7.67);
const withdrawn=report('E5','B','2026-10-03',8,12.70,{attendanceState:'rest'});
const planned=report('E6','B','2026-10-04',8,12.70,{planned:true});
const unverified={...report('E7','B','2026-10-05',8,12.70),reportVerified:false};
const incomplete=report('E8','B','2026-10-06',8,12.70,{attendanceReview:'待核'});
const staff=[
 ...['E1','E2','E9','E10'].map(empId=>({empId,jobTitle:'ARMG'})),
 ...['E3','E4','E11'].map(empId=>({empId,jobTitle:'AQC'})),
 {empId:'E12',jobTitle:'F/L'}
];
const rows=[a,b,x,y,invalid,withdrawn,planned,unverified,incomplete,{...a}];
const result=c.p79BuildOvertimeJobTitleSummary(rows,staff),A=result.groups.find(g=>g.jobTitle==='ARMG'),B=result.groups.find(g=>g.jobTitle==='AQC');
assert.equal(result.invalidHours,1,'unexpected non-4/8 report must be flagged, never silently rounded');
assert.equal(result.missingConversion,1,'missing conversion must be counted as unknown, not estimated from punches');
assert.equal(A.people,2);assert.equal(A.count,3);assert.equal(A.raw,16);
assert.equal(A.converted,18.72);assert.equal(A.staffCount,4);assert.equal(A.rawAverage,4);assert.equal(A.convertedAverage,4.68);
assert.equal(A.missing,1);
assert.equal(B.people,1);assert.equal(B.staffCount,3);assert.equal(B.count,1);assert.equal(B.raw,8);assert.equal(B.converted,12.7);assert.equal(B.invalid,1);assert(Math.abs(B.rawAverage-8/3)<1e-9);
assert.equal(result.totals.count,4);assert.equal(result.totals.people,3);assert.equal(result.totals.staffCount,8);assert.equal(result.totals.raw,24);assert.equal(result.totals.converted,31.42);assert.equal(result.totals.rawAverage,3);assert(Math.abs(result.totals.convertedAverage-31.42/8)<1e-9);assert.equal(result.groups.find(g=>g.jobTitle==='F/L').raw,0);
assert.equal(result.totals.missing,1);assert.equal(result.totals.invalid,1);
const cross=c.p79BuildOvertimeJobTitleSummary([
 {...a,dept:'甲單位',jobTitle:'ARMG'},
 {...y,dept:'乙單位',jobTitle:'ARMG'},
 {...b,empId:'E20',dept:'甲單位',jobTitle:'AQC'}
],[
 {empId:'E1',jobTitle:'ARMG'},{empId:'E3',jobTitle:'ARMG'},{empId:'E13',jobTitle:'ARMG'},
 {empId:'E20',jobTitle:'AQC'},{empId:'E21',jobTitle:'AQC'}
]);
assert.equal(cross.groups.length,2,'same job title across departments must merge, different job title in same department must not');
const ar=cross.groups.find(g=>g.jobTitle==='ARMG'),aq=cross.groups.find(g=>g.jobTitle==='AQC');
assert.equal(ar.raw,12);assert.equal(ar.count,2);assert.equal(ar.people,2);assert.equal(ar.staffCount,3);assert.equal(ar.rawAverage,4);
assert.equal(aq.raw,8);assert.equal(aq.count,1);assert.equal(aq.people,1);assert.equal(aq.staffCount,2);assert.equal(aq.rawAverage,4);

assert.equal(c.p79BuildOvertimeJobTitleSummary([{...a,reportVerified:false}],staff).totals.raw,0);
const fold=html.match(/<details id="p79OvertimeJobTitleSummary"[^>]*>/);
assert(fold&&!/\bopen\b/.test(fold[0]),'job-title summary must be collapsible and closed by default');
assert(html.includes('<summary id="p79OvertimeJobTitleSummaryTitle"'),'job-title fold must have a clickable heading');
assert(html.includes('點擊展開／收合'),'job-title fold must explain the interaction');
assert(html.includes('id="p79OvertimeJobTitleRows"'),'job-title table must be visible');
assert(html.includes('>總人數</th>')&&html.includes('>請假天數</th>'),'job-title population and approved leave days columns must appear');
assert(html.includes("p79BuildOvertimeJobTitleSummary(jobTitleRows,staff)"),'job-title aggregation must include all jobs, even when one employee is filtered');
assert(html.includes("let rows=jobTitleRows.filter("),'personal daily-row filtering must not restrict title-wide distribution');
assert(html.includes('id="p79OvertimeJobTitleNotice"'),'abnormal report notice must be visible');
assert(html.includes('換算加班時數</div><div id="overtimeTotalHours"'),'converted total card must use official conversions');
assert(html.includes("if(!p79WorkOvertimeOfficialReport(meta.overtimeReport,meta)||shown.has"),'stored cloud report cannot disappear simply because no punch-based estimate exists');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS all-employee job-title burden sharing, including non-reporters and a zero-overtime title: 4/8 actuals, decimal conversion, unknown/mismatched values, deduplication, per-person averages, invalid and revoked/preview exclusions');
