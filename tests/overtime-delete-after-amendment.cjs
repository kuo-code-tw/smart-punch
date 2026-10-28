const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
const start=html.indexOf('async function p79DeleteWorkOvertimeRow(index,button){');
const end=html.indexOf('async function p79ComparisonOutput(',start);
assert(start>=0&&end>start,'delete routine must remain available');
const fn=html.slice(start,end);
assert(!fn.includes('if(!state.canDelete)'), 'a previously cached delete flag must not block an authorized delete');
assert(!fn.includes('if(!state?.ready||!state.revision)'), 'a stale revision must not pre-empt live validation');
assert(html.includes("class=\"px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 text-xs font-bold\">已修改</button>"));
assert(html.includes("p79OpenOvertimeChangeForRow('+rowIndex+')"),'edited indicator must still open the correct audit record');
assert(!html.includes('✎ 已修改・查看紀錄'),'removed superseded long label');
const htmlBtn=html.slice(html.indexOf('const overtimeRowsHtml = '),html.indexOf('const pagination = ',html.indexOf('const overtimeRowsHtml = ')));
assert(!htmlBtn.includes('?.canDelete?'),'rendered delete controls must not be gated on cached canDelete flag');

async function simulate(mode){
 const date='2026-10-27',month='2026-10';
 const row={planned:mode==='planned',empId:'E1',name:'模擬員工',rosterDate:date,dateKey:date,reportVerified:true,overtimeReport:{id:'REPORT-1'},forEmpId:'',coverCandidate:false,coverAlreadyArranged:false};
 const state=new Map([[month,{ready:true,canDelete:false,revision:null,at:Date.now(),rows:[]}]]);
 const calls=[],messages=[],notice=[],button={disabled:false,textContent:'刪除加班'};
 const rosterId=mode==='replaced'?'REPORT-NEW':'REPORT-1';
 const schedule=after=>({empId:'E1',month,schedule:{__meta:{[date]:after?{}:{overtimeReport:{id:rosterId}}}}});
 const context={console,Date,JSON,String,Array,Map,Set,Promise,AbortController,crypto:{randomUUID:()=> 'client-1'},
   p79WorkOvertimeDisplayedRows:[row],p79CanDeleteOvertime:()=>true,normalizeScheduleDateKey:v=>v,
   p79WorkOvertimeMonths:state,confirm:()=>true,alert:s=>messages.push(s),
   currentPort79SsoToken:()=> 'token',getActiveGasUrl:()=> 'https://mock.invalid/exec',
   setTimeout:(fn,ms)=>1,clearTimeout:()=>{},localStorage:{setItem:(...args)=>notice.push(args)},
   schedules:[schedule(false)],normalizeScheduleMonthKey:v=>v,
   records:[],p79OvertimeCalculationCache:{cached:true},p79LoadWorkOvertimeMonths:()=>{
     state.set(month,{ready:true,canDelete:true,revision:'refreshed',rows:[schedule(true)],promise:Promise.resolve()});
   },renderOvertimeStats:()=>{},
   fetch:async(url,options={})=>{
     if(options.method==='POST'){
       const body=JSON.parse(options.body);calls.push(body);
       if(body.action==='scheduleAcquireEditLock')return {json:async()=>({ok:true,mine:true})};
       if(body.action==='scheduleReleaseEditLock')return {json:async()=>({ok:true})};
       if(body.action==='deleteOvertimeAssignment'){
         assert.equal(body.expectedRevision,'cloud-current','must use current cloud revision, not cached');
         assert.equal(body.empId,'E1');assert.equal(body.date,date);
         return {json:async()=>({ok:true,affectedEmployeeIds:['E1']})};
       }
       throw Error('unexpected action: '+body.action);
     }
     calls.push({GET:url});
     return {json:async()=>({
       ok:true,revision:'cloud-current',overtimeLinkedDelete:mode!=='server-disabled',
       schedules:[schedule(calls.filter(x=>x.GET).length===2)]
     })};
   }
 };
 context.globalThis=context;context.p79OvertimePlannedDisplayedRows=[row];vm.createContext(context);vm.runInContext(html.slice(html.indexOf('function p79WorkOvertimeIsUnconfirmedPlan('),html.indexOf('        function buildOvertimeStatisticsRows(')),context);vm.runInContext(fn,context);
 if(mode==='planned'){const a=html.indexOf('        async function p79DeletePlannedOvertimeRow('),b=html.indexOf('        function p79OvertimePlannedVisibleRows(',a);vm.runInContext(html.slice(a,b),context);await context.p79DeletePlannedOvertimeRow(0,button);}else await context.p79DeleteWorkOvertimeRow(0,button);
 return{calls,messages,notice,button,state};
}
(async()=>{
 let saved=await simulate('ok');
 assert.equal(saved.calls.filter(x=>x.action==='deleteOvertimeAssignment').length,1,'authorized deletion must proceed after any earlier edit');
 assert.equal(saved.notice.length,1,'broadcast only after verified removal');
 assert.match(saved.messages.at(-1),/已由雲端確認刪除/);
 assert.equal(saved.button.textContent,'刪除加班');assert.equal(saved.button.disabled,false);
 const planned=await simulate('planned');
 assert.equal(planned.calls.filter(x=>x.action==='deleteOvertimeAssignment').length,1,'manual saved plan uses the cloud-verified deletion route');
 assert.equal(planned.calls.find(x=>x.action==='deleteOvertimeAssignment').expectedReportId,'REPORT-1');
 assert.match(planned.messages.at(-1),/已由雲端確認刪除/);
 for(const m of ['server-disabled','replaced']){
   const guarded=await simulate(m);
   assert.equal(guarded.calls.filter(x=>x.action==='deleteOvertimeAssignment').length,0,'unsafe deletion must not be sent: '+m);
   assert.match(guarded.messages.at(-1),/刪除未確認/);
   assert.equal(guarded.notice.length,0);
 }
 console.log('PASS delete after amendment with stale flag/revision; current cloud authorization, original ID guard, safe rejection, shorter audit label');
})().catch(e=>{console.error(e);process.exitCode=1});
