'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');
const start=html.indexOf('        function p79OvertimeDisplaySummary(rows,officialSummary){');
const end=html.indexOf('        function renderOvertimeStats() {',start);
assert(start>=0&&end>start,'displayed overtime aggregation helper exists');
const c={Map,Set,Number,String,Array,Math};vm.createContext(c);
vm.runInContext(html.slice(start,end),c);
const people=[{empId:'A',jobTitle:'F/L'},{empId:'B',jobTitle:'F/L'}];
const empty={groups:[{jobTitle:'F/L',staffCount:2,people:0,count:0,raw:0,converted:0,missing:0,invalid:0,rawAverage:0,convertedAverage:0}],totals:{raw:0,converted:0,count:0,missing:0,staffCount:2,people:0,rawAverage:0,convertedAverage:0},invalidHours:0,missingConversion:0};
const entries=[
 {empId:'A',dateKey:'2026-11-02',jobTitle:'F/L',overtimeMinutes:248,clockIn:{id:'in-a'},clockOut:{id:'out-a'}},
 {empId:'B',dateKey:'2026-11-02',jobTitle:'F/L',overtimeMinutes:261,clockIn:{id:'in-b'},clockOut:{id:'out-b'}}
];
const result=c.p79OvertimeDisplaySummary(entries,empty);
assert.equal(Math.round(result.totals.raw*60),509,'4h08+4h21 = 8h29, not zero');
assert.equal(result.fallbackCount,2,'two visible completed shifts');
assert.equal(result.totals.missing,2,'no saved conversion must be indicated as unresolved');
assert.equal(result.totals.converted,0,'never fabricate payroll conversion values');
assert(Math.abs(result.groups[0].raw-509/60)<1e-9,'job-title rollup matches card');
assert.equal(result.groups[0].rawAverage,result.groups[0].raw/2,'per-person average matches raw hours');
assert.equal(c.p79OvertimeDisplaySummary([...entries,entries[0]],empty).fallbackCount,2,'duplicate session not double-counted');
assert.equal(c.p79OvertimeDisplaySummary(entries.slice(0,1),empty).totals.raw,248/60,'employee filters change the total');
assert.equal(c.p79OvertimeDisplaySummary([...entries,{empId:'C',overtimeMinutes:300,planned:true},{empId:'D',overtimeMinutes:400,timeCheckRequired:true}],empty).fallbackCount,2,'planned and abnormal intervals never count automatically');
const oct={
 groups:[{jobTitle:'F/L',staffCount:2,people:1,count:1,raw:8,converted:12.70,missing:0,invalid:0,rawAverage:4,convertedAverage:6.35}],
 totals:{raw:8,converted:12.70,count:1,missing:0,staffCount:2,people:1,rawAverage:4,convertedAverage:6.35},
 invalidHours:0,missingConversion:0
};
const verified=c.p79OvertimeDisplaySummary([{...entries[0],reportVerified:true}],oct);
assert.equal(verified.totals.raw,8,'October saved declared hours remain authoritative');
assert.equal(verified.totals.converted,12.70,'October saved conversion remains unchanged');
assert.equal(verified.fallbackCount,0,'reported shift not added twice');
const mixed=c.p79OvertimeDisplaySummary(entries,oct);
assert.equal(Math.round(mixed.totals.raw*60),989,'mixed months combine saved October and visible November without duplication');
assert.equal(mixed.totals.converted,12.70);
assert.equal(mixed.totals.missing,2);
assert(html.includes('>加班時數（未換算）</div>')&&html.includes('>換算加班時數</div>'),'card wording no longer implies missing IDs mean zero work');
assert(html.includes("'待換算（'+totals.missing+'筆）'"),'missing conversions show pending rather than false 0');
assert(html.includes('p79OvertimeDisplaySummary(jobTitleRows,p79BuildOvertimeJobTitleSummary(jobTitleRows,staff))'));
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS displayed 11-month 8h29 in raw totals, conversion missing rather than fake 0, role sums and filtered rows; October declarations unchanged');
