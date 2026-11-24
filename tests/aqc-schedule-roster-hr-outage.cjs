'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const {createStore}=require('../assets/port79-aqc-schedule-groups.js');
const {rankMonth}=require('../assets/port79-personnel-ranking.js');
const reference=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/personnel-reference-dashboard.js'),'utf8');
function fn(name){
 const start=html.indexOf('function '+name+'(');
 assert(start>=0,'Missing '+name);
 const end=html.indexOf('\n}',start);
 assert(end>start,'Missing end of '+name);
 return html.slice(start,end+2);
}
const store=createStore(v=>String(v||'').replace(/\s+/g,''));
store.setOwner('owner');
store.apply('2026-11',{ok:true,month:'2026-11',employees:[
 {empId:'A1',attNo:'ATT-A1',name:'現職甲',employmentStatus:'active',jobTitle:'AQC',group:'不分組'},
 {empId:'B1',name:'現職乙',employmentStatus:'active',jobTitle:'AQC',group:'B組'},
 {empId:'C1',name:'離職丙',employmentStatus:'resigned',jobTitle:'AQC',group:'C組'},
 {empId:'D1',name:'狀態未核對',jobTitle:'AQC',group:'D組'}
],schedules:[
 {empId:'A1',month:'2026-11',schedule:{__personnel:{role:'AQC',group:'A組',groupExplicit:true}}},
 {empId:'B1',month:'2026-11',schedule:{__personnel:{role:'AQC',group:'B組',groupExplicit:true}}},
 {empId:'C1',month:'2026-11',schedule:{__personnel:{role:'AQC',group:'C組',groupExplicit:true}}}
]});
const records=[
 {source:'working-report',workDate:'2026-11-06',empId:'ATT-A1',name:'現職甲',hours:2,disc:10,load:5,hc:1,workingNo:'R1'},
 {source:'working-report',workDate:'2026-11-07',empId:'B1',name:'現職乙',hours:2,disc:20,load:2,hc:0,workingNo:'R1'},
 {source:'working-report',workDate:'2026-11-08',empId:'C1',name:'離職丙',hours:1,disc:9,load:0,hc:0,workingNo:'R1'},
 {source:'working-report',workDate:'2026-11-09',empId:'UNKNOWN',name:'未知',hours:1,disc:1,load:0,hc:0,workingNo:'R1'}
];
const before=JSON.stringify(records);
const metric=r=>({hours:r.hours,disc:r.disc,load:r.load,hc:r.hc,containers:r.disc+r.load});
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',title:'',hidden:false,querySelectorAll:()=>[],querySelector:()=>null});return elements.get(id);}
const document={getElementById:el,querySelector:()=>null};
const ctx={window:{},document,Map,Set,Date,Array,
 p79AqcHeadcountVerified:false,systemEmployees:[],
 operationScheduleReads:new Map([['2026-11',{status:'ready'}]]),
 currentOperationScheduleStore:()=>store,isoTodayLocal:()=> '2026-11-17',
 normalizePersonName:v=>String(v||'').replace(/\s+/g,''),
 displayPersonName:v=>String(v||''),
 personnelGroupCode:v=>/^[ABCD]組$/.test(v)?v[0]:'',
 workloadRecordMetrics:metric,
 operationGroupForRecord:r=>store.lookup(String(r.workDate||'').slice(0,7),r).group,
 people:()=>[]
};
vm.createContext(ctx);
for(const name of ['p79ScheduledAqcReportView','p79VerifiedAqcReportView','updateCurrentAqcHeadcount'])
 vm.runInContext(fn(name),ctx);
const view=ctx.p79VerifiedAqcReportView(records);
assert.equal(view.verified,true,'valid schedule AQC roster must not be blocked by failed HR-only API');
assert.equal(view.source,'schedule');
assert.equal(view.rosterCount,2,'resigned and unknown employment staff must be excluded from live roster');
ctx.isAqcEmployee=e=>e.employmentStatus==='active';ctx.systemEmployees=[{empId:'A1',employmentStatus:'resigned'}];
assert.equal(ctx.p79VerifiedAqcReportView(records).rosterCount,1,'older schedule must not resurrect a known resigned employee');ctx.systemEmployees=[];
assert.equal(view.rows.length,2,'only verified monthly schedule AQC records can become personnel work rows');
assert.deepEqual(Array.from(view.persons,p=>p.group).sort(),['A組','B組']);
assert.equal(view.persons.find(p=>p.empId==='A1').containers,15);
assert.equal(JSON.stringify(records),before,'historical source must remain untouched');
ctx.updateCurrentAqcHeadcount();
assert.equal(el('kpiPeople').textContent,'2','AQC count uses verified schedule when HR endpoint is unavailable');
assert.match(el('kpiPeople').title,/正式排班表/);
const ranked=rankMonth({month:'2026-11',records:view.rows,roster:view.roster,metrics:metric,
 groupFor:r=>ctx.operationGroupForRecord(r),normalize:v=>String(v||'').replace(/\s+/g,'')});
assert.deepEqual(ranked.map(p=>p.name).sort(),['現職乙','現職甲']);
assert.equal(ranked.find(p=>p.empId==='A1').groups.join(','),'A組');
assert(!ranked.some(p=>p.name==='離職丙'));
const win={addEventListener:()=>{}};const ui={window:win,document,Intl,Number,Math,String,Map,Array};
vm.createContext(ui);vm.runInContext(reference,ui);
win.P79PersonnelReference.render({sourceRows:records,rows:view.rows,persons:view.persons,
 metrics:metric,groupCode:v=>/^[ABCD]組$/.test(v)?v[0]:'',rosterVerified:true,
 rosterSource:'schedule',rosterCount:view.rosterCount,excludedRows:view.excluded});
assert.equal(el('p79prPeople').textContent,'2');
assert.equal(el('p79prCount').textContent,'4','original report total must not change');
assert(el('p79prGroups').innerHTML.includes('aria-label="A 組"')&&el('p79prGroups').innerHTML.includes('aria-label="B 組"'),'both schedule group cards are rendered');
assert(el('p79prRankBody').innerHTML.includes('現職甲'));
assert(!el('p79prRankBody').innerHTML.includes('離職丙'));
assert.match(el('p79prFreshness').textContent,/已核對正式排班表 AQC 2 人/);
ctx.currentOperationScheduleStore=()=>createStore();
ctx.operationScheduleReads=new Map();
const waiting=ctx.p79VerifiedAqcReportView(records);
assert.equal(waiting.verified,false,'must not guess personnel from work reports if schedule is not loaded');
assert(html.includes("verified.source==='schedule'?verified.roster"),'monthly rank must use verified schedule roster');
assert(html.includes('const personnelRows=verifiedLive.rows;'),'weekly display must consume verified schedule rows');
assert(html.includes('personnel-reference-dashboard.js?v=20261117-schedule-roster-v3'));
console.log('PASS HR outage fallback uses saved schedule groups; active and resigned exclusion; monthly ranks, group cards, KPI, source totals, and pending safety');
