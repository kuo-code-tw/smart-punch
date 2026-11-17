const assert=require('assert/strict'),{createStore}=require('../assets/port79-aqc-schedule-groups.js');
let passed=0;function test(name,f){f();passed++;console.log('PASS '+name);}
const store=createStore(v=>String(v||'').replace(/\s+/g,''));store.setOwner('session-a');
const employees=[{empId:'A1',name:'Driver A',jobTitle:'AQC',group:'A組'},{empId:'B1',name:'Driver B',jobTitle:'ARMG',group:'機械組'}];
const payload=(month,group='B組',role='AQC')=>({ok:true,employees,schedules:[{empId:'A1',month,group:'old group',role:'ARMG',schedule:{__personnel:{role,group}}}]});
test('the month-specific AQC personnel override beats the employee default and row fallback',()=>{store.apply('2026-10',payload('2026-10'));assert.equal(store.lookup('2026-10',{empId:'a1'}).group,'B組');});
test('historical months retain their own groups instead of using the current month',()=>{store.apply('2026-09',payload('2026-09','C組'));assert.equal(store.lookup('2026-09',{empId:'A1'}).group,'C組');assert.equal(store.lookup('2026-10',{empId:'A1'}).group,'B組');assert.equal(store.lookup('2026-08',{empId:'A1'}).status,'unavailable');});
test('non-AQC personnel never appear as an AQC group',()=>{assert.equal(store.lookup('2026-10',{empId:'B1'}).status,'not-aqc');});
test('a name-only report can use a unique roster name',()=>{assert.equal(store.lookup('2026-10',{empId:'NAME:Driver A',name:'Driver A'}).group,'B組');});
test('a wrong real ID cannot silently use another employee with the same name',()=>{assert.equal(store.lookup('2026-10',{empId:'WRONG',name:'Driver A'}).status,'missing');});
test('duplicate names require an employee ID',()=>{store.apply('2026-11',{ok:true,employees:[...employees,{empId:'A2',name:'Driver A',jobTitle:'AQC',group:'D組'}],schedules:[]});assert.equal(store.lookup('2026-11',{name:'Driver A'}).status,'ambiguous');assert.equal(store.lookup('2026-11',{empId:'A2'}).group,'D組');});
test('an explicit ungrouped assignment stays ungrouped',()=>{store.apply('2026-12',payload('2026-12','不分組'));assert.equal(store.lookup('2026-12',{empId:'A1'}).group,'不分組');});
test('another month’s schedule does not override the selected month',()=>{store.apply('2027-01',payload('2026-10','D組'));assert.equal(store.lookup('2027-01',{empId:'A1'}).group,'A組');});
test('incomplete responses fail while conflicting personnel only flag that employee',()=>{assert.throws(()=>store.apply('2027-02',{ok:false,employees,schedules:[]}));assert.throws(()=>store.apply('2027-02',{ok:true,employees}));const data=payload('2027-02');data.schedules.push({...data.schedules[0],schedule:{__personnel:{role:'AQC',group:'D組'}}});store.apply('2027-02',data);assert.equal(store.lookup('2027-02',{empId:'A1'}).status,'conflict');assert.equal(store.lookup('2027-02',{empId:'B1'}).status,'not-aqc');});
test('identical employee duplicates preserve unique name matching',()=>{store.apply('2027-04',{ok:true,employees:[...employees,employees[0]],schedules:[]});assert.equal(store.lookup('2027-04',{name:'Driver A'}).group,'A組');});
test('an empty override role retains the base schedule role',()=>{store.apply('2027-03',{ok:true,employees,schedules:[{month:'2027-03',empId:'A1',schedule:{__personnel:{group:'C組'}}}]});assert.equal(store.lookup('2027-03',{empId:'A1'}).group,'C組');});
test('failed refresh invalidation and account changes clear previously read groups',()=>{store.invalidate('2026-10');assert.equal(store.lookup('2026-10',{empId:'A1'}).status,'unavailable');store.setOwner('session-b');assert.equal(store.lookup('2026-09',{empId:'A1'}).status,'unavailable');});

test('monthly schedule-only employee IDs still resolve group without changing live roster',()=>{
 const s=createStore();s.setOwner('session-schedule-only');
 s.apply('2026-11',{ok:true,month:'2026-11',
  employees:[{empId:'E1',name:'In roster',jobTitle:'AQC',group:'A組'}],
  schedules:[{empId:'E2',month:'2026-11',schedule:{__personnel:{role:'AQC',group:'C組'}}}]});
 assert.equal(s.lookup('2026-11',{empId:'E2',name:'Has monthly schedule'}).group,'C組');
 assert.equal(s.lookup('2026-11',{empId:'E2'}).status,'ok');
 assert.deepEqual(s.personnel('2026-11').map(e=>e.empId),['E1'],'do not re-create an active employee from historical schedule only');
});
test('explicit alternate attendance ID maps to the same named employee',()=>{
 const s=createStore();s.setOwner('attendance');
 s.apply('2026-11',{ok:true,employees:[{empId:'E1',attNo:'ATT-001',name:'Staff',jobTitle:'AQC',group:'B組'}],schedules:[]});
 assert.equal(s.lookup('2026-11',{empId:'ATT-001',name:'Staff'}).group,'B組');
 assert.equal(s.lookup('2026-11',{empId:'NOT-REGISTERED',name:'Staff'}).status,'missing','a random real ID must never match by name');
});
test('ambiguous alternate IDs are rejected without corrupting primary IDs',()=>{
 const s=createStore();s.setOwner('ambiguous');
 s.apply('2026-11',{ok:true,employees:[
  {empId:'A',attNo:'SHARED',name:'Staff A',jobTitle:'AQC',group:'A組'},
  {empId:'B',attNo:'SHARED',name:'Staff B',jobTitle:'AQC',group:'B組'}
 ],schedules:[]});
 assert.equal(s.lookup('2026-11',{empId:'SHARED'}).status,'ambiguous');
 assert.equal(s.lookup('2026-11',{empId:'A'}).group,'A組');
 assert.equal(s.lookup('2026-11',{empId:'B'}).group,'B組');
});
test('top-level verified month allows schedule rows without duplicated row.month',()=>{
 const s=createStore();s.setOwner('month');
 s.apply('2026-11',{ok:true,month:'2026-11',employees:[],schedules:[{empId:'X',schedule:{__personnel:{role:'AQC',group:'D組'}}}]});
 assert.equal(s.lookup('2026-11',{empId:'X'}).group,'D組');
 s.apply('2026-10',{ok:true,month:'2026-11',employees:[],schedules:[{empId:'X',schedule:{__personnel:{role:'AQC',group:'D組'}}}]});
 assert.equal(s.lookup('2026-10',{empId:'X'}).status,'missing','foreign month payload must not contaminate local month');
});
console.log(JSON.stringify({passed,failed:0,scope:'Read-only schedule employee/month personnel semantics; no backend writes'}));
