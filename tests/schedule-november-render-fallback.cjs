const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const start=html.indexOf('    function p79ScheduleRenderReadOnlyFallback('),end=html.indexOf('    let scheduleSaveTimer',start);
assert(start>=0&&end>start,'recovery routine exists in actual schedule page');
const source=html.slice(start,end);
const month='2026-11',day=n=>month+'-'+String(n).padStart(2,'0');
const people=Array.from({length:4},(_,i)=>({id:'S'+i,role:'指揮手',group:'D組',name:'指揮手'+i})).concat({id:'Q1',role:'AQC',group:'A組',name:'其他職稱'});
const roster=Object.fromEntries(people.map(p=>[p.id,{}]));
roster.S0[day(1)]='早';roster.S0[day(2)]='休';roster.S1[day(1)]='晚';roster.Q1[day(1)]='國';
const original=JSON.stringify(roster),main={innerHTML:''};
const ctx={console,String,Math,Date,Array,Number,JSON,Map,Set,Promise,
 employees:people,monthlyScheduleData:roster,
 activeRoleTab:'指揮手',activeGroupFilter:'ALL',p79ScheduleSourceState:{month,kind:'live'},
 currentScheduleMonthKey:()=>month,currentPort79SsoToken:()=> 'FIXTURE-ADMIN',
 p79ScheduleHasOfficialData:()=>true,
 document:{getElementById:id=>id==='app-main-container'?main:null},
 getDaysInMonth:()=>30,scheduleEscapeHtml:x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
 applyScheduleAccessUi:()=>{}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
assert.equal(ctx.p79ScheduleRenderReadOnlyFallback(new Error('畫面資料尚未完整載入，請重新讀取後再操作')),true);
assert(main.innerHTML.includes('指揮手0')&&main.innerHTML.includes('指揮手3'));
assert(!main.innerHTML.includes('其他職稱'),'role filter must never display unrelated personnel');
assert(main.innerHTML.includes('>早</td>')&&main.innerHTML.includes('>晚</td>'));
assert(main.innerHTML.includes('>待排班</td>'),'missing shifts are marked missing, not invented rest');
assert(main.innerHTML.includes('待排117格'),'4 people x 30 days minus three real shifts');
assert(!main.innerHTML.includes('<select')&&!main.innerHTML.includes('儲存排班'),'failure view remains READ ONLY');
assert.equal(JSON.stringify(roster),original,'diagnostic rendering does not mutate cloud roster');
main.innerHTML='';ctx.p79SchedulePreviewRenderError(new Error('畫面資料尚未完整載入，請重新讀取後再操作'));
assert(main.innerHTML.includes('指揮手0'),'error handler must show recovered roster instead of hiding entire role');
ctx.p79ScheduleHasOfficialData=()=>false;ctx.p79ScheduleSourceState.kind='loading';main.innerHTML='';
assert.equal(ctx.p79ScheduleRenderReadOnlyFallback(Error('not verified')),false,'must not display unverified state');
ctx.p79SchedulePreviewRenderError(Error('not verified'));
assert(!main.innerHTML.includes('<table'),'no fake data shown before cloud/cache confirmation');
assert(html.includes("const rosterShift=String(monthlyScheduleData[emp.id]?.[dayStr]??'').trim()||'待排班';"),'the normal day-cell view must not fabricate 休 for absent dates');
assert(html.includes("if(shiftVal==='待排班')"),'pending dates must not be counted as work or off');
assert(html.includes("pairedWork&&rosterShift==='待排班'"),'a valid paired punch still shows 已出勤 for an unplanned date');
console.log('PASS November four-command roster: verified read-only recovery, actual shifts retained, missing days not forged, role/identity isolation, pending totals, no cloud mutation');
