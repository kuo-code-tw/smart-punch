const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
(async()=>{
 let now=Date.parse('2026-10-22T07:59:00+08:00'),token='A',reads=0,records=[];
 const c={window:null,Date,Intl};c.window=c;vm.createContext(c);
 for(const name of ['rest-attendance','schedule-rest-evidence'])vm.runInContext(fs.readFileSync('assets/port79-'+name+'.js','utf8'),c);
 const client=c.P79ScheduleRestEvidence.create({token:()=>token,now:()=>now,employees:()=>[{id:'TEST'}],schedules:()=>[{empId:'TEST',schedule:{'2026-10-21':'晚'}}],leaveDates:()=>[],timestamp:r=>r.time,buildShifts:r=>r,read:async month=>{reads++;return {ok:true,month,records:month==='2026-10'?records:[]}}});
 await client.refreshIfStale('2026-10');assert.equal(client.status('2026-10').evidence.days['TEST|2026-10-21'].state,'open');assert.equal(reads,2);
 await client.refreshIfStale('2026-10');assert.equal(reads,2,'focus events reuse current evidence');
 now+=61000;await client.refreshIfStale('2026-10');assert.equal(reads,4);assert.equal(client.status('2026-10').evidence.days['TEST|2026-10-21'].state,'rest','overnight completes without roster change');
 records=[{id:'PAIR',empId:'TEST',time:Date.parse('2026-10-21T23:50:00+08:00'),clockIn:{time:Date.parse('2026-10-21T23:50:00+08:00')},clockOut:{time:Date.parse('2026-10-22T07:50:00+08:00')}}];now+=61000;await client.refreshIfStale('2026-10');assert.equal(client.status('2026-10').evidence.days['TEST|2026-10-21'].state,'worked','newly supplemented cross-day cards clear rest');
 const html=fs.readFileSync('work-hours/index.html','utf8'),start=html.indexOf('        function p79RefreshVisibleOvertimeEvidence(){'),end=html.indexOf('        function p79LoadWorkOvertimeMonths(',start);
 let visible=true,selected='2026-10',calls=[];const state={token:'A',ready:true,attendanceEvidence:{complete:true,checkedAt:now-61000}};
 Object.assign(c,{document:{visibilityState:'visible',getElementById:id=>id==='overtimeTableBody'?{getClientRects:()=>visible?[{}]:[]}:{value:selected}},currentPort79SsoToken:()=>token,p79WorkOvertimeMonths:new Map([['2026-10',state]]),p79EnsureWorkRestEvidence:(month)=>calls.push(month)});
 vm.runInContext(html.slice(start,end),c);c.p79RefreshVisibleOvertimeEvidence();assert.equal(calls.length,1);
 state.restEvidencePending=true;c.p79RefreshVisibleOvertimeEvidence();assert.equal(calls.length,1);state.restEvidencePending=false;visible=false;c.p79RefreshVisibleOvertimeEvidence();assert.equal(calls.length,1);visible=true;token='B';c.p79RefreshVisibleOvertimeEvidence();assert.equal(calls.length,1);
 assert(html.includes('value="review"'));assert(html.includes('🔴 疑似多報｜整班無卡，請核對後刪除'));assert(html.includes("source==='review' ? row.overtimeReport?.attendanceState==='rest'"));
 console.log('PASS overnight end refresh, fresh-read throttle, supplemented cards, visible overtime refresh, pending/account guards and review filter wiring');
})().catch(e=>{console.error(e);process.exit(1)});
