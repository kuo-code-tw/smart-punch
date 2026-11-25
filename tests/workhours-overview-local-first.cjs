'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const original=fs.readFileSync('assets/port79-workhours-reference-dashboard.js','utf8');
const asset=original.replace(" if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();"," window.testOverview={compute,paint};");
assert.notEqual(asset,original);
const month='2026-11',day=month+'-19';
const people=[{empId:'A',name:'Scoped',jobTitle:'ARMG',dept:'OPS',attNo:'1'},{empId:'H',name:'Hidden',jobTitle:'HIDDEN',dept:'OPS',attNo:'2'}];
const report={id:'R1',declaredHours:4,category:'延',overtimeDate:day,status:'已核對出勤'};
const roster=[{empId:'A',month,schedule:{__meta:{[day]:{overtimeReport:report},[month+'-20']:{overtimeReport:{...report,id:'R2'},overtimeExcluded:true},[month+'-21']:{overtimeReport:{...report,id:'R3',planned:true}}}}},{empId:'H',month,schedule:{__meta:{[day]:{overtimeReport:{...report,id:'HIDDEN'}}}}}];
const raw=[{id:'I',empId:'A',timeStr:day+' 19:35:00'},{id:'O',empId:'A',timeStr:month+'-20 05:47:00'}];
function fixture({ready=false,verified=false,error='',invalidated=false,localRoster=null,localRaw=null,memory=[]}={}){
 let token='TOKEN',policy=true,loadCalls=[],diskCalls=[],verifiedCalls=0,attendanceCalls=0;
 const nodes=new Map(), element=()=>({dataset:{},style:{},classList:{contains:()=>false,toggle:()=>{}},replaceChildren(){},appendChild(){},append(){},insertRow:()=>({insertCell:()=>({append(){}})}),addEventListener(){}});
 function node(k){if(!nodes.has(k))nodes.set(k,{...element(),value:({prStart:month+'-01',prEnd:month+'-30'})[k]||'ALL'});return nodes.get(k);}
 const document={getElementById:node,createElement:element,hidden:false},months=new Map();
 if(ready||error||invalidated)months.set(month,{token,ready,pending:ready&&!error&&!verified,error,source:'本機快取，背景核對中',cachePreview:!verified,rows:ready?roster:[],at:Date.now()-1000,previewInvalidated:invalidated});
 const window={sessionStorage:{getItem:k=>k==='port79_user_session'?JSON.stringify({systemPermissions:{workhours:'manage'},dataScope:'OPS'}):''},Port79JobTitleVisibility:{ready:()=>policy,isVisible:j=>j!=='HIDDEN'},P79WorkhoursCache:{enabled:()=>true,verifiedRawMonths:()=>verified?[{month,records:raw}]:null},Port79DataCache:{viewerKey:()=>token==='TOKEN'?'A@admin':'B@admin',getSchedulePreview:async(m,o)=>{diskCalls.push(['roster',m,o.strict]);return localRoster?{data:{schedules:localRoster}}:null},getDisplaySnapshot:async()=>localRaw?{data:{fullDatabase:true,monthStats:[{month,ok:true}],records:localRaw}}:null}};
 const stubs={window,document,hasValidHomepageAdminSession:()=>true,currentPort79SsoToken:()=>token,getActiveGasUrl:()=> 'https://script.google.com/macros/s/TEST/exec',p79WorkhoursEligibleEmployees:()=>people,p79OvertimeUnitOfPerson:e=>e.dept,p79WorkOvertimeMonths:months,p79WorkOvertimeMonthVerified:()=>verified,p79LoadWorkOvertimeMonths:(r,m,f)=>loadCalls.push([m,f]),records:memory,p79WorkOvertimeOfficialReport:(r,m)=>!!r?.id&&!m?.overtimeExcluded&&!r.revoked,p79WorkOvertimeIsUnconfirmedPlan:r=>r.overtimeReport.planned===true,p79WorkOvertimeLedgerMonth:r=>r.monthKey,buildOvertimeStatisticsRows:()=>{verifiedCalls++;return [{empId:'A',overtimeReport:report,reportVerified:true,monthKey:month,rosterDate:day}]},p79OvertimeCalculationCache:{plannedRows:[]},employees:people,buildDailyAttendanceRows:rs=>rs.some(r=>r.id==='I')&&rs.some(r=>r.id==='O')?[{empId:'A',accountingDateKey:day,clockIn:rs.find(r=>r.id==='I'),clockOut:rs.find(r=>r.id==='O')}]:[],getAttendanceTimestamp:r=>Date.parse(r.timeStr.replace(' ','T')+'+08:00'),p79ReadWorkRestMonth:async()=>{attendanceCalls++;throw Error('unexpected cloud read')},p79WorkRestMonths:()=>[month],mergeAttendanceRecordCollections:(a,b)=>a.concat(b)};
 new Function(...Object.keys(stubs),asset)(...Object.values(stubs));
 return {api:window.testOverview,nodes,months,loadCalls,diskCalls,verifiedCalls:()=>verifiedCalls,attendanceCalls:()=>attendanceCalls,changeToken:()=>{token='OTHER'},denyPolicy:()=>{policy=false}};
}
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
(async()=>{
 let f=fixture({ready:true,memory:raw}),d=f.api.compute();
 assert.equal(d.ok,true);assert.equal(d.preview,true);assert.equal(d.reportsAvailable,true);assert.equal(d.reports.length,2);assert(d.reports.every(r=>r.empId==='A'&&r.id!=='R2'));assert.equal(d.overtime,4);assert.equal(d.attendanceAvailable,true);assert.equal(f.verifiedCalls(),0);assert.equal(f.attendanceCalls(),0);
 f.api.paint(d);assert(f.nodes.get('prDataStatus').textContent.includes('本機'));assert.equal(f.nodes.get('prKpiApplications').textContent,'2');f.api.compute(true);assert.equal(f.loadCalls.length,0);
 f=fixture({ready:true,error:'排班讀取等候8秒後仍未取得鎖',memory:raw});d=f.api.compute();assert.equal(d.ok,true);assert.equal(d.overtime,4);assert(d.syncError.includes('8秒'));f.api.paint(d);assert(f.nodes.get('prDataStatus').textContent.includes('保留目前資料'));assert.equal(f.nodes.get('prKpiApplications').textContent,'2');f.api.compute(true);assert.equal(f.loadCalls.length,0);f.months.get(month).at=Date.now()-11000;f.api.compute(true);assert.equal(f.loadCalls.length,1);
 f=fixture({error:'offline',localRoster:roster,localRaw:raw});assert.equal(f.api.compute().ok,false);await settle();d=f.api.compute();assert.equal(d.ok,true);assert.equal(d.preview,true);assert.equal(d.reports.length,2);assert.equal(d.attendanceAvailable,true);assert(f.diskCalls.some(c=>c[0]==='roster'&&c[2]===true));assert.equal(f.attendanceCalls(),0);
 f=fixture({error:'offline',localRaw:raw});f.api.compute();await settle();d=f.api.compute();assert.equal(d.ok,true);assert.equal(d.reportsAvailable,false);assert.equal(d.attendanceAvailable,true);f.api.paint(d);assert.equal(f.nodes.get('prKpiApplications').textContent,'—');assert(f.nodes.get('prTrend').innerHTML.includes('#087efa'));assert(!f.nodes.get('prTrend').innerHTML.includes('stroke="#11a442"'));
 f=fixture({ready:true,verified:true,memory:raw});d=f.api.compute();assert.equal(d.preview,false);assert.equal(d.overtime,4);assert.equal(f.verifiedCalls(),1);assert.equal(f.attendanceCalls(),0);
 f=fixture({ready:true,localRoster:roster,localRaw:raw,memory:raw});f.api.compute();f.changeToken();await settle();d=f.api.compute();assert.equal(d.ok,false);
 f=fixture({ready:true,localRoster:roster,localRaw:raw,memory:raw});f.api.compute();f.months.get(month).ready=false;f.months.get(month).previewInvalidated=true;await settle();d=f.api.compute();assert.equal(d.ok,false);assert(d.reason.includes('權限'));
 f=fixture({ready:true,memory:raw});f.denyPolicy();assert.equal(f.api.compute().ok,false);
 console.log('PASS overview local-first scoped snapshot, lock failure, unknown versus zero, query throttle, raw-only preview, verified upgrade, permission invalidation');
})().catch(e=>{console.error(e);process.exitCode=1});
