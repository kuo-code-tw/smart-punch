'use strict';
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const i=html.indexOf('    function p79ScheduleRestCountCells('),j=html.indexOf('    function p79RefreshScheduleRestCounts(',i);
a(i>0&&j>i,'roster counter function required');
const month='2026-10',day=d=>month+'-'+String(d).padStart(2,'0');
const cloudConfirmed=html.indexOf('p79ConfirmScheduleSource(data,requestMonth,requestStartedAt,requestViewer,token);');
const summaryRefresh=html.indexOf('p79RefreshScheduleRestCounts(requestMonth);',cloudConfirmed);
const attendanceRefresh=html.indexOf('p79ScheduleRestClient().refresh(requestMonth);',summaryRefresh);
a(cloudConfirmed>=0&&summaryRefresh>cloudConfirmed&&attendanceRefresh>summaryRefresh&&attendanceRefresh-cloudConfirmed<600,
 'official cloud response must refresh visible counters before attendance reread, even if it fails');
let official=false,dirty=false,ledger=[],cloudRest={},confirmed=[];
const c={
  window:null,Set,Map,
  p79RestQuota:()=>({counts:{例:4,休:5,國:2}}),
  p79DailyRestCount:()=>({dates:{例:[],休:[],國:[]}}),
  p79ScheduleRestBalance:()=>({quota:{例:4,休:5,國:2},remaining:{例:0,休:2,國:0},reported:{例:0,休:2,國:0},reserved:{例:0,休:0,國:0},ledger}),
  p79ScheduleTyphoonDays:()=>[],scheduleEscapeHtml:x=>String(x),
  p79ScheduleHasOfficialData:()=>official,
  monthlyScheduleMeta:{E1:cloudRest},
  P79ScheduleRestSummary:{confirmedDates:()=>confirmed}
};
Object.defineProperty(c,'port79ScheduleDirty',{get:()=>dirty});c.window=c;
vm.createContext(c);vm.runInContext(html.slice(i,j),c);
const shown={例:[day(2),day(9),day(16),day(23)],休:[day(5),day(11),day(22)],國:[day(6),day(24)]};
const render=(id='E1',typhoon=[])=>c.p79ScheduleRestCountCells({id},month,null,typhoon,[],shown);
const value=(id,category)=>render(id).match(new RegExp('data-rest-category="'+category+'"[^>]*><span>([^<]+)</span>'))?.[1];
a.equal(value('E1','休'),'3/2','only three visible cells before a confirmed source is present');
official=true;
cloudRest[day(28)]={overtimeReport:{id:'FORMAL-28',category:'休',code:'休16-24'}};
a.equal(value('E1','休'),'4/1','a formally identified cloud row remains counted when receipt map was cleared');
a.equal(value('OTHER','休'),'3/2','other employee metadata must not leak into count');
dirty=true;
a.equal(value('E1','休'),'3/2','a locally edited draft is not cloud-confirmed');
dirty=false;
cloudRest[day(28)].overtimeExcluded=true;
a.equal(value('E1','休'),'3/2','excluded overtime must not be counted');
cloudRest[day(28)].overtimeExcluded=false;
cloudRest[day(28)].overtimeRevocations=[{confirmed:true,reportId:'FORMAL-28'}];
a.equal(value('E1','休'),'3/2','confirmed revocation is respected');
cloudRest[day(28)].overtimeRevocations=[];
ledger=[{date:day(28),category:'休',kind:'reported'}];
dirty=true;
a.equal(value('E1','休'),'4/1','independently verified quota ledger restores missing confirmed date');
a.equal(value('E1','國'),'2/0');
ledger=[];dirty=false;
a(render('E1',[day(28)]).includes('<span>3/2</span>'),'typhoon date stays exempt');
for(let idx=0;idx<83;idx++)a.equal(value('FIX'+idx,'休'),'3/2','all personnel remain isolated '+idx);
console.log('PASS roster 休 3/2 -> 4/1 from source redundancy, ledger-only, official-vs-draft, revocation, typhoon and 83-person isolation');
