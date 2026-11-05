'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const src=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const evidenceApi=Function('window',src('assets/port79-schedule-rest-evidence.js')+';return window.P79ScheduleRestEvidence;')({});
const allocate=Function(src('assets/port79-rest-allocation.js')+';return {p79RestQuota,p79AllocateRestMonth};')();
const html=src('schedule/index.html');
const extract=(name)=>{
  const start=html.indexOf('    function '+name+'('),stop=html.indexOf('\n    }',start);
  assert(start>=0&&stop>start,'missing helper '+name);
  return html.slice(start,stop+6);
};
const display=Function('p79ConfirmedOvertimeReport','p79CompactOvertimeCode',
  extract('p79NightSplitRestLabel')+extract('p79VisibleRestKind')+
  ';return {p79NightSplitRestLabel,p79VisibleRestKind};')(
    m=>!!m?.overtimeReport?.id&&m.overtimeExcluded!==true&&
      !(m.overtimeRevocations||[]).some(x=>x.confirmed===true&&x.reportId===m.overtimeReport.id),
    v=>String(v||'').trim()
  );
const ts=x=>Date.parse(x+'+08:00'),day='2026-11-05',who='E1';
const punch=(pk,time,status)=>({id:pk,empId:who,attNo:'1',timeStr:time,status});
const first=punch('a','2026/11/05 20:00','上班簽到');
const last=punch('b','2026/11/06 00:00','下班簽退');
const report={id:'OT1',category:'延',code:'延20-24',overtimeStart:'20:00',overtimeEnd:'00:00'};
const meta={overtime:true,overtimeReport:report};
const roster={[day]:'晚',__meta:{[day]:meta}};
const pair={empId:who,start:ts('2026-11-05T20:00:00'),end:ts('2026-11-06T00:00:00'),workDate:day};
const base={month:'2026-11',schedules:[{empId:who,schedule:roster}],
 people:[{id:who,attNo:'1'}],sessions:[pair],referenceSessions:[pair],
 officialRecords:[first,last],referenceRecords:[first,last],
 officialByMonth:{'2026-11':true},referenceByMonth:{'2026-11':true},
 referenceAvailable:true,now:ts('2026-11-06T13:00:00'),
 timestamp:r=>Date.parse(r.timeStr.replaceAll('/','-').replace(' ','T')+':00+08:00')};
const detect=patch=>evidenceApi.detectNightSplitRest({...base,...patch});
const yes=detect({});
assert.equal(yes[who+'|'+day].restEnd,'08:00','paired midnight OUT is not night work');
assert.equal(yes[who+'|'+day].workDate,day,'the rest belongs to Nov 5');
const absent=patch=>assert.equal(detect(patch)[who+'|'+day],undefined);
absent({now:ts('2026-11-06T11:59:00')});
absent({referenceAvailable:false});
absent({sessions:[]});
absent({referenceSessions:[]});
absent({officialRecords:[first,last,punch('c','2026/11/06 02:00','上班簽到')]});
absent({referenceRecords:[first,last,punch('c','2026/11/06 02:00','上班簽到')]});
absent({schedules:[{empId:who,schedule:{[day]:'早',__meta:{[day]:meta}}}]});
absent({schedules:[{empId:who,schedule:{[day]:'晚',__meta:{[day]:{...meta,overtimeRevocations:[{reportId:'OT1',confirmed:true}]}}}}]});
absent({officialByMonth:{'2026-11':false}});
absent({sessions:[{...pair,end:ts('2026-11-05T22:00:00')}]});
absent({schedules:[{empId:who,schedule:{[day]:'晚',__meta:{[day]:{...meta,overtimeReport:{...report,id:''}}}}}]});
// Strict cross-month guard: even a full 20-24 pair cannot classify a missing next-month feed.
const boundary='2026-10-31',bs=ts('2026-10-31T20:00:00'),be=ts('2026-11-01T00:00:00');
const boundaryData={...base,month:'2026-10',schedules:[{empId:who,schedule:{
 [boundary]:'晚',__meta:{[boundary]:meta}}}],sessions:[{...pair,start:bs,end:be,workDate:boundary}],
 referenceSessions:[{...pair,start:bs,end:be,workDate:boundary}],
 officialByMonth:{'2026-10':true,'2026-11':false},
 referenceByMonth:{'2026-10':true,'2026-11':false},
 officialRecords:[punch('c1','2026/10/31 20:00','上班簽到'),punch('c2','2026/11/01 00:00','下班簽退')],
 referenceRecords:[punch('c1','2026/10/31 20:00','上班簽到'),punch('c2','2026/11/01 00:00','下班簽退')]};
assert.equal(evidenceApi.detectNightSplitRest(boundaryData)[who+'|'+boundary],undefined);
assert.equal(evidenceApi.detectNightSplitRest({...boundaryData,
 officialByMonth:{'2026-10':true,'2026-11':true},
 referenceByMonth:{'2026-10':true,'2026-11':true}})[who+'|'+boundary].workDate,boundary);

// Existing monthly 例→休→國 allocator must keep formal OT and count the
// partial-night rest once, not reclassify all punched shifts as leave.
const month='2026-11',restDates=new Set([1,7,8,14,15,21,22,28,29]);
const monthly={},existing={};
for(let d=1;d<=30;d++)monthly[month+'-'+String(d).padStart(2,'0')]=restDates.has(d)?'休':'早';
monthly[day]='晚';existing[day]=meta;
const none=allocate.p79AllocateRestMonth(monthly,existing,month,[], '', '', [], [], [], []);
const assigned=allocate.p79AllocateRestMonth(monthly,existing,month,[], '', '', [], [], [day], []);
assert.equal(none.meta[day].restCategory,undefined,'work-only day cannot consume a rest quota');
assert.equal(assigned.meta[day].restCategory,'例','priority must assign 例 before 休');
assert.equal(assigned.meta[day].restSegmentSource,'night-split-v1');
assert.equal(assigned.meta[day].overtimeReport.id,'OT1','formal OT must survive allocation');
for(const category of ['例','休','國']){
 const count=Object.values(assigned.meta).filter(x=>x?.restCategory===category).length;
 assert(count<=allocate.p79RestQuota(month).counts[category],'quota over-allocated: '+category);
}
assert.equal(assigned.meta[day].restCategory,
 allocate.p79AllocateRestMonth(monthly,assigned.meta,month,[], '', '', [], [], [day], []).meta[day].restCategory,
 'recalculation must be stable and not count twice');
assert.equal(display.p79NightSplitRestLabel(meta,'晚',assigned.meta[day],null,'延20-24',yes[who+'|'+day]),'20-24＋例');
assert.equal(display.p79NightSplitRestLabel(meta,'晚',assigned.meta[day],null,'延20-24',null),'','without proof do not claim overnight rest');
assert.equal(display.p79VisibleRestKind('晚','20-24＋例'),'例');
assert.equal(display.p79VisibleRestKind('晚','20-24＋休'),'休');
assert.equal(display.p79VisibleRestKind('晚','20-24＋國'),'國');
console.log('PASS: night-split dual-source evidence, cross-month safety, quota priority, label and double-count guards');
