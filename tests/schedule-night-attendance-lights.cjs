const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('schedule/index.html','utf8');
function fn(name){let start=html.indexOf('function '+name+'(');assert(start>=0,name);if(html.slice(start-6,start)==='async ')start-=6;return html.slice(start,html.indexOf('\n    }',start)+6)}
const now=Date.parse('2026-10-18T07:26:00+08:00');
class TestDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now}}
const people=[{id:'E1',attNo:'91'},{id:'E2',attNo:'463'},{id:'E3',attNo:'260'},{id:'COL1',attNo:'1'},{id:'COL2',attNo:'1'}];
const c={Date:TestDate,Intl,Set,Map,AbortController,setTimeout,clearTimeout,encodeURIComponent,employees:people,GAS_URL:'https://example.invalid',currentPort79SsoToken:()=> 'session',scheduleTaipeiTodayKey:()=> '2026-10-18',scheduleNightRosterDate:()=> '2026-10-17'};vm.createContext(c);
for(const name of ['scheduleAttendanceRecordTimestamp','scheduleAttendanceRecordType','scheduleNightAttendanceLatest','readScheduleNightAttendance','applyScheduleNightAttendance'])vm.runInContext(fn(name),c);
const record=(empId,timeStr,status)=>({empId,timeStr,status});
const rows=[record('E1','2026/10/17 23:35','上班簽到'),record('E2','2026/10/17 23:34','上班簽到'),record('E2','2026/10/18 07:00','下班簽退'),{attNo:'260',timeStr:'2026/10/17 23:32',status:'上班簽到'},record('STALE','2026/10/16 23:00','上班簽到'),record('FUTURE','2026/10/18 23:00','上班簽到'),{attNo:'1',timeStr:'2026/10/17 23:00',status:'上班簽到'}];
const latest=c.scheduleNightAttendanceLatest(rows,people,now);assert.equal(latest.get('E1').type,'IN');assert.equal(latest.get('E2').type,'OUT');assert.equal(latest.get('E3').type,'IN');assert(!latest.has('FUTURE'));assert(!latest.has('STALE'));assert(!latest.has('COL1'));
const set=c.applyScheduleNightAttendance(new Set(['E2','TODAY']),{nightDate:'2026-10-17',latest});assert(set.has('E1'));assert(set.has('E3'));assert(!set.has('E2'));assert(set.has('TODAY'));
const ties=c.scheduleNightAttendanceLatest([record('E1','2026/10/18 01:00','下班簽退'),record('E1','2026/10/18 01:00','上班簽到')],people,now);assert.equal(ties.get('E1').type,'OUT');
const middle=c.scheduleNightAttendanceLatest([record('MID','2026/10/17 16:00','上班簽到')],people,now);assert(!c.applyScheduleNightAttendance(new Set(),{nightDate:'2026-10-17',latest:middle}).has('MID'));
(async()=>{
let requests=[];c.fetch=async(url,opts)=>{requests.push({url,opts});return {ok:true,json:async()=>({ok:true,month:'2026-10',records:rows})}};
const read=await c.readScheduleNightAttendance('session');assert.equal(requests.length,1);assert.equal(read.latest.get('E1').type,'IN');assert.equal(requests[0].opts.cache,'no-store');assert(requests[0].url.includes('token=session'));
c.scheduleTaipeiTodayKey=()=> '2026-11-01';c.scheduleNightRosterDate=()=> '2026-10-31';requests=[];c.fetch=async(url)=>{requests.push(url);const month=new URL(url).searchParams.get('month');return {ok:true,json:async()=>({ok:true,month,records:[]})}};await c.readScheduleNightAttendance('session');assert.equal(requests.length,2);assert(requests.some(u=>u.includes('month=2026-10')));assert(requests.some(u=>u.includes('month=2026-11')));
c.fetch=async()=>({ok:true,json:async()=>({ok:true,month:'wrong',records:[]})});await assert.rejects(c.readScheduleNightAttendance('session'),/未完成讀取/);
c.scheduleTaipeiTodayKey=()=> '2026-11-01';c.scheduleNightRosterDate=()=> '2026-11-01';requests=[];c.fetch=async()=>{throw new Error('daytime must not scan months')};assert.equal(await c.readScheduleNightAttendance('session'),null);
Object.assign(c,{console,p79ScheduleAttendanceStateBusy:false,p79ScheduleAttendanceAuthExpired:false,p79ScheduleAttendanceHasSynced:false,p79ScheduleAttendanceLastSyncedAt:0,isGasUrlConfigured:()=>true,p79RefreshScheduleDutyPeriod(){},refreshNightRosterSnapshot(){},setScheduleAttendanceLiveStatus(){},renderTodaySchedulePanel(){},renderRoleScheduleView(){},todayAttendanceActiveEmpIds:new Set(),scheduleTaipeiTodayKey:()=> '2026-10-18',scheduleNightRosterDate:()=> '2026-10-17'});
c.fetch=async(url)=>url.includes('getScheduleAttendanceState')?{ok:true,json:async()=>({ok:true,today:'2026-10-18',activeEmpIds:['E2']})}:{ok:true,json:async()=>({ok:true,month:'2026-10',records:rows})};
vm.runInContext(fn('refreshScheduleAttendanceState'),c);assert(await c.refreshScheduleAttendanceState());assert(c.todayAttendanceActiveEmpIds.has('E1'));assert(c.todayAttendanceActiveEmpIds.has('E3'));assert(!c.todayAttendanceActiveEmpIds.has('E2'));

for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
console.log('PASS prior-evening IN lights, later OUT clears, identity fallback, collisions, stale/future exclusions, OUT tie, cross-month reads, invalid response and daytime bypass');
})().catch(e=>{console.error(e);process.exitCode=1});
