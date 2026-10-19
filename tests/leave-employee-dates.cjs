const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('leave/index.html','utf8');
for(const id of ['leaveStart','leaveEnd']){
 assert(new RegExp('<label for="'+id+'">').test(html));
 assert(new RegExp('<input id="'+id+'" type="date" required').test(html));
}
assert(!/mountRange\(\{startId:'leaveStart'/.test(html),'employee dates stay native and visible without custom calendar');
const begin=html.indexOf('(async function init(){');
const finish=html.indexOf('\n})();',begin);
const init=html.slice(begin,finish+6);
function run(start='',end=''){
 const elements={leaveStart:{value:start},leaveEnd:{value:end},leaveDays:{value:''}};
 let loaded=false;
 const c={Intl,Date,$:id=>elements[id],restoreAdmin:()=>new Promise(()=>{}),loadCloud:()=>{loaded=true;return new Promise(()=>{});},updateDays:()=>{elements.leaveDays.value=elements.leaveStart.value===elements.leaveEnd.value?'1':'2';}};
 vm.runInNewContext(init,c);
 assert(loaded);
 return elements;
}
const pending=run();
const taipei=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
assert.equal(pending.leaveStart.value,taipei);
assert.equal(pending.leaveEnd.value,taipei);
assert.equal(pending.leaveDays.value,'1','dates and day count ready while network remains pending');
const selected=run('2026-10-20','2026-10-21');
assert.equal(selected.leaveStart.value,'2026-10-20');
assert.equal(selected.leaveEnd.value,'2026-10-21','initialization preserves selected dates');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS native labeled employee dates, Taipei defaults before pending network, preserved selection and inline syntax');
