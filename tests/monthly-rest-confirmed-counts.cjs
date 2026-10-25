const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const c={window:null};c.window=c;vm.createContext(c);for(const f of ['rest-allocation','rest-attendance','monthly-rest-overtime'])vm.runInContext(fs.readFileSync('assets/port79-'+f+'.js','utf8'),c);c.p79MonthlyRestContext={employmentStart:()=>''};
const api=c.P79MonthlyRest,emp={empId:'FIXTURE',name:'測試'},dates=Array.from({length:31},(_,i)=>'2026-10-'+String(i+1).padStart(2,'0'));
function fixture(report){const schedule={...Object.fromEntries(dates.map((d,i)=>[d,i>=1&&i<=8?'休':'早'])),__meta:{}};schedule[dates[9]]='年';if(report)schedule.__meta[dates[0]]={overtimeReport:report};return api.balance(emp,schedule,'2026-10');}
const total=x=>Object.values(x).reduce((a,b)=>a+b,0);
for(const report of [null,{category:'休',code:'休24-08'},{category:'休',id:'',code:'休24-08'},{category:'休',id:'   ',code:'休24-08'}]){
 const b=fixture(report),model={balances:[{emp,...b}],rows:[]};assert.equal(total(b.unused),3);assert.equal(total(b.reported),0);assert.equal(total(b.remaining),3);assert.match(api.personSummary(model,emp.empId),/^例0／休1／國2$/);
 if(report){assert(b.ledger.some(x=>x.kind==='unconfirmed'));assert.match(api.auditText(model,emp.empId),/缺少申報編號（不扣額度）/);}
}
const b=fixture({category:'休',id:'CLOUD-FIXTURE',code:'休24-08'}),model={balances:[{emp,...b}],rows:[{empId:emp.empId,category:'國',date:dates[16],checked:false,acknowledged:false,saved:false}]};
assert.equal(total(b.unused),3);assert.equal(total(b.reported),1);assert.equal(total(b.remaining),2);assert.match(api.personSummary(model,emp.empId),/^例0／休0／國2$/);
model.rows[0].checked=true;assert.match(api.personSummary(model,emp.empId),/^例0／休0／國2$/,'selection does not reduce pending days');
model.rows[0].acknowledged=true;model.rows[0].checked=false;assert.match(api.personSummary(model,emp.empId),/^例0／休0／國2$/,'POST acknowledgement alone does not confirm saved count');
model.rows[0].saved=true;assert.match(api.personSummary(model,emp.empId),/^例0／休0／國1$/,'cloud-confirmed readback deducts exactly once without changing unused total');
model.rows[0].saved=false;model.rows[0].checked=true;assert.match(api.personSummary(model,emp.empId),/^例0／休0／國2$/,'unconfirmed retry keeps total pending quota');
const html=fs.readFileSync('work-hours/index.html','utf8');assert.match(html,/port79-monthly-rest-overtime\.js\?v=[^"'\\s<>]+/);
console.log('PASS confirmed counts: unused 3 vs pending 2; absent/empty IDs; plain markers; checked, ACK, readback, retry and unchanged total');
