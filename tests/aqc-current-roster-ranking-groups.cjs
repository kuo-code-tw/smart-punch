'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const {rankMonth}=require('../assets/port79-personnel-ranking.js');
function extract(name){const start=html.indexOf('function '+name+'(');assert(start>=0,name);const end=html.indexOf('\n}',start);assert(end>start,name);return html.slice(start,end+2);}
const official=[
 {empId:'A1',attNo:'ATT-A1',name:'現職甲',employmentStatus:'active',jobTitle:'AQC',group:'A組'},
 {empId:'B1',name:'離職乙',employmentStatus:'resigned',jobTitle:'AQC',group:'B組'},
 {empId:'C1',name:'現職丙',employmentStatus:'active',jobTitle:'AQC',group:'C組'}
];
const ctx={systemEmployees:official,p79AqcHeadcountVerified:true,Map,Set,Date,
 normalizePersonName:s=>String(s||'').replace(/\s+/g,''),
 displayPersonName:s=>String(s||''),personnelGroupCode:s=>/^[ABCD]組$/.test(s)?s[0]:'',
 gcToken:'t1',operationScheduleReads:new Map(),window:{},currentOperationScheduleStore:()=>ctx.store};
ctx.window.P79AqcScheduleGroups={createStore:()=>ctx.store};
ctx.store={setOwner(){},lookup(month,person){
 const id=String(person.empId||'');
 if(id==='A1')return {status:'missing',group:'排班無此司機'};
 if(id==='C1')return {status:'ok',group:'C組'};
 if(id.startsWith('NAME:')&&person.name==='現職甲')return {status:'ok',group:'A組'};
 return {status:'missing',group:'排班無此司機'};
}};
vm.createContext(ctx);
for(const name of ['currentOfficialJobTitle','isAqcEmployee','people','operationGroupForRecord'])vm.runInContext(extract(name),ctx);
assert.equal(ctx.operationGroupForRecord({empId:'A1',name:'現職甲',workDate:'2026-11-10'}),'A組','HR-verified unique schedule alias resolves false missing employee');
assert.equal(ctx.operationGroupForRecord({empId:'ATT-A1',name:'現職甲',workDate:'2026-11-10'}),'A組','HR-attested attendance ID resolves to the official scheduled employee');
assert.equal(ctx.operationGroupForRecord({empId:'OTHER',name:'現職甲',workDate:'2026-11-10'}),'排班身分／組別待核對','unknown real ID cannot impersonate an HR employee');
assert.equal(ctx.operationGroupForRecord({empId:'B1',name:'離職乙',workDate:'2026-11-10'}),'排班身分／組別待核對','resigned employee gets no live group');
const source=[
 {empId:'A1',name:'現職甲',source:'working-report',workDate:'2026-11-01',disc:10,load:0,hc:0,hours:2,workingNo:'10'},
 {empId:'B1',name:'離職乙',source:'working-report',workDate:'2026-11-02',disc:20,load:0,hc:0,hours:2,workingNo:'20'}
];
const filtered=source.filter(r=>official.some(e=>e.empId===r.empId&&ctx.isAqcEmployee(e)));
assert.equal(filtered.length,1);
const rank=rankMonth({month:'2026-11',records:filtered,roster:official.filter(e=>ctx.isAqcEmployee(e)).map(e=>({empId:e.empId,name:e.name,group:e.group})),metrics:r=>r,groupFor:r=>ctx.operationGroupForRecord(r),normalize:s=>String(s||'').replace(/\s+/g,'')});
assert.deepEqual(rank.map(r=>r.name),['現職甲','現職丙']);
assert.equal(rank[0].groups.join('、'),'A組');
assert(!rank.some(r=>r.groups.includes('排班無此司機')),'stale schedule failure label is not considered a group');
assert(html.includes("const verified=p79AqcHeadcountVerified?p79VerifiedAqcReportView(sourceRows):p79ScheduledAqcReportView(sourceRows,month);"),'monthly ranking must use current schedule roster if HR API is unavailable');
assert(html.includes('const verifiedLive=p79VerifiedAqcReportView(sourceRows)'),'weekly personnel ranking must gate on verified HR');
assert(html.includes('const rs=sourceRows;'),'raw report statistics cannot be gated by HR availability');
assert(html.includes('const personnelRows=verifiedLive.rows;'),'live person names still require HR verification');
assert(html.includes("if(wkPeople)wkPeople.textContent=verifiedLive.verified?peopleMap.size:'—';"),'unverified HR cannot claim active headcount');
assert(html.includes('sourceRows:rs,persons:rankedPersonnelEfficiencyPersons(hrView.persons)'),'reference charts get historical rows even when HR unavailable');
assert(!html.includes('store?.has(month)?store.personnel(month):people()'),'schedule snapshot cannot resurrect a resigned employee');
assert(html.includes('personnel-ranking.js?v=20261117-active-hr-v1'));
console.log('PASS active AQC HR roster, unique schedule-name correction, unknown-ID guard, and monthly/weekly personnel isolation');
