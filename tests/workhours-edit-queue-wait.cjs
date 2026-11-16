const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
const source=html.slice(html.indexOf('        function p79WaitWorkhoursEditSync'),html.indexOf('        function p79PrepareWorkhoursEdit'));
function setup(){let queue={paused:false},token='A',checks=[],timeouts=[],cleared=0,drains=0;const events=new Map();const c={Promise,Error,p79AttendanceEditOpenGeneration:1,currentPort79SsoToken:()=>token,setInterval:f=>(checks.push(f),1),clearInterval:()=>cleared++,setTimeout:f=>(timeouts.push(f),2),clearTimeout:()=>{},window:{p79V5QueueInfoForId:()=>queue,p79V5Drain:()=>{drains++},addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)}};vm.createContext(c);vm.runInContext(source,c);return {c,events,checks,timeouts,setQueue:q=>queue=q,setToken:t=>token=t,get cleared(){return cleared},get drains(){return drains}};}
(async()=>{
let t=setup(),settled=false,p=t.c.p79WaitWorkhoursEditSync({id:'A'}).then(()=>settled=true);await Promise.resolve();assert.equal(settled,false);assert.equal(t.drains,1);t.setQueue(null);t.events.get('p79-attendance-outbox-updated')();await p;assert(settled);assert.equal(t.events.size,0);assert.equal(t.cleared,1);
t=setup();p=t.c.p79WaitWorkhoursEditSync({id:'A'});t.setToken('B');t.checks[0]();await assert.rejects(p,/登入身分/);assert.equal(t.events.size,0);
t=setup();p=t.c.p79WaitWorkhoursEditSync({id:'A'});t.timeouts[0]();await assert.rejects(p,/輸入已保留/);assert.equal(t.events.size,0);
t=setup();p=t.c.p79WaitWorkhoursEditSync({id:'A'});t.setQueue({paused:true});t.checks[0]();await p;assert.equal(t.events.size,0);
assert(html.includes('p79WaitWorkhoursEditSync(record).then(()=>p79PrepareWorkhoursEdit(record,true))'));
console.log('PASS same-record ACK automatically resumes verification; account change, timeout and paused recovery clean up listeners');
})().catch(e=>{console.error(e);process.exitCode=1});
