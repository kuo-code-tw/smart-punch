const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),c={window:null};c.window=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/port79-rest-allocation.js','utf8'),c);vm.runInContext(fs.readFileSync('assets/port79-rest-attendance.js','utf8'),c);c.p79MonthlyRestContext={employmentStart:()=>''};vm.runInContext(fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8'),c);
const dates=Array.from({length:31},(_,i)=>'2026-10-'+String(i+1).padStart(2,'0')),emp={empId:'A',name:'測試'};
function fixture(n){const roster=Object.fromEntries(dates.map((d,i)=>[d,i<n?'國':'早']));roster.__meta=Object.fromEntries(dates.slice(0,n).map(d=>[d,{restCategory:'國'}]));return roster;}
function balance(r,s){return c.P79MonthlyRest.balance(emp,r,'2026-10',s)}
const json=x=>JSON.parse(JSON.stringify(x));
let r=fixture(5),before=JSON.stringify(r),b=balance(r);assert.deepEqual(json(b.quota),{例:4,休:5,國:2});assert.deepEqual(json(b.off),{例:4,休:1,國:0});assert.equal(b.remaining.例,0);assert.equal(JSON.stringify(r),before,'do not rewrite roster labels');
assert.deepEqual(json(balance(fixture(9)).off),{例:4,休:5,國:0});assert.deepEqual(json(balance(fixture(11)).remaining),{例:0,休:0,國:0});
r=fixture(0);r.__meta[dates[0]]={overtimeReport:{id:'R',category:'國'}};
let days=Object.fromEntries(dates.map((d,i)=>['A|'+d,{state:i<5?'rest':'worked'}]));let s={attendanceEvidence:{complete:true,days}};b=balance(r,s);assert.deepEqual(json(b.off),{例:4,休:1,國:0});assert.equal(b.reported.國,0,'no-card report returns day to priority pool');
days['A|'+dates[0]].state='missing';b=balance(r,s);assert.equal(b.off.例,4);assert.equal(b.off.休,0);assert.equal(b.reported.國,1,'missing punch is not counted as rest');
r=fixture(7);days=Object.fromEntries(dates.map((d,i)=>['A|'+d,{state:i<2?'rest':i<7?'open':'worked'}]));b=balance(r,{attendanceEvidence:{complete:true,days}});assert.deepEqual(json(b.off),{例:2,休:0,國:0});assert.deepEqual(json(b.reserved),{例:2,休:3,國:0},'future rest continues priority after completed rest');assert.equal(b.remaining.例,0);
console.log('PASS rest priority: all labels use 例→休→國; 11-day month; no-card reports; missing punches; future rest; original roster preserved');
