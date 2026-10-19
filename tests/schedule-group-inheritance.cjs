const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const h=fs.readFileSync('schedule/index.html','utf8');
function fn(n){const a=h.indexOf('    function '+n+'(');assert(a>=0);return h.slice(a,h.indexOf('\n    }',a)+6);}
const c={String,Object,Array,Set,console,document:{getElementById:()=>({value:'2026-11'})},employeeMasterBase:[{id:'E1',group:'不分組',role:'ARMG'}],employees:[],schedulePersonnelOverrides:{'2026-10':{E1:{group:'C組'}}},currentScheduleMonthKey:()=> '2026-11',cloneScheduleEmployee:e=>({...e}),scheduleEmployeeEligibleForMonth:()=>true,scheduleOrderNumber:x=>x??null};
vm.createContext(c);for(const n of ['scheduleGroupIsMeaningful','latestHistoricalScheduleOverride','applySchedulePersonnelOverrides'])vm.runInContext(fn(n),c);
c.applySchedulePersonnelOverrides('2026-11');assert.equal(c.employees[0].group,'C組');
c.schedulePersonnelOverrides['2026-11']={E1:{group:'B組'}};c.applySchedulePersonnelOverrides('2026-11');assert.equal(c.employees[0].group,'B組');
c.schedulePersonnelOverrides['2026-11'].E1.group='不分組';c.applySchedulePersonnelOverrides('2026-11');assert.equal(c.employees[0].group,'C組','default unassigned row inherits previous group');c.schedulePersonnelOverrides['2026-11'].E1.groupExplicit=true;c.applySchedulePersonnelOverrides('2026-11');assert.equal(c.employees[0].group,'不分組');
c.schedulePersonnelOverrides['2026-12']={};c.applySchedulePersonnelOverrides('2026-12');assert.equal(c.employees[0].group,'不分組','nearest unassignment must not resurrect October C');
assert.equal(c.schedulePersonnelOverrides['2026-10'].E1.group,'C組');
for(const m of h.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS new month inherits previous group, explicit changes and unassignment preserved, history unchanged, scripts parse');
