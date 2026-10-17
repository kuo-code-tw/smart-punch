const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){let start=html.indexOf('function '+name+'(');assert(start>=0,name);if(html.slice(start-6,start)==='async ')start-=6;const line=html.slice(start,html.indexOf('\n',start));return line.endsWith('}')?line:html.slice(start,html.indexOf('\n}',start)+2);}
const els={};for(const id of ['driverVesselBody','driverVesselMonth','driverVesselShip','driverVesselName','driverVesselAqc','driverVesselCount','driverVesselLoadState','driverVesselSourceState','driverVesselRecordBody'])els[id]={value:'',innerHTML:'',textContent:''};els.driverVesselMonth.value='2026-10';
const c={console,Date,Map,Set,document:{getElementById:id=>els[id]},gcToken:'',records:[],shipMasters:[],driverVesselReads:new Map(),driverVesselReadVersion:0,canonicalOperationalRecords:rows=>rows,normalizePersonName:v=>String(v||'').trim(),displayPersonName:v=>String(v||''),normalizeAqcNo:v=>String(v||''),esc:v=>String(v),isoTodayLocal:()=> '2026-10-17',
 workloadRecordMetrics:r=>({disc:r.disc,load:r.load,hc:r.hatches,hours:r.timeHours,containers:r.disc+r.load,eff:(r.disc+r.load+r.hatches)/r.timeHours}),operationGroupForRecord:r=>r.testGroup||'B組',ensureOperationScheduleGroups(){},shipMasterDateMatchesMonth:(s,m)=>s.month===m,
 workloadSheetAudit:(m,rows)=>({containers:rows.reduce((n,r)=>n+r.disc+r.load,0),hc:rows.reduce((n,r)=>n+r.hatches,0),status:m?.workingSheetSource?'match':'pending',reasons:m?.workingSheetSource?[]:['未取得 WORKING SHEET']}),requireEfficiencyAccess:()=>true,mergeEfficiencyCloudData(){},saveLocal(){},invalidateWorkloadIndex(){}};
vm.createContext(c);for(const name of ['renderDriverVesselAqcSummary','renderDriverVesselDetailTable','compareDriverNames','driverVesselReference','driverVesselOperationRows','renderVesselDriverView','loadDriverVesselMonth','onDriverVesselMonthChange'])vm.runInContext(fn(name),c);
const row=(no,name,group='B組')=>({source:'working-report',workingNo:no,name,number:'8001',workDate:'2026-10-16',startTime:'08:00',endTime:'10:00',disc:10,load:20,hatches:1,timeHours:2,testGroup:group});
const rows=[row('5260182','陳先生'),row('5260182','王先生'),row('5260182','林先生'),row('5260182-1','其他司機')];
let passed=0;function test(name,f){f();passed++;console.log('PASS '+name);}
test('Chinese names use stroke order in the actual personal-workload index',()=>{c.records=['陳','王','林','張','曾','郭'].map(n=>row('5260182',n));c.people=()=>[];c.workloadIndexCache={};vm.runInContext(fn('buildWorkloadIndex'),c);assert.equal(c.buildWorkloadIndex().people.map(p=>p.name).join('、'),'王、林、張、郭、陳、曾');});
test('a selected vessel uses saved WR details and never absorbs a child job',()=>{const ref=c.driverVesselReference('5260182',[{workingNo:'5260182'}],rows);assert.equal(ref.rows.length,3);assert(!ref.rows.some(r=>r.workingNo.endsWith('-1')));});
test('same driver’s different monthly schedule groups remain separate',()=>{const grouped=c.driverVesselOperationRows([row('5260182','Driver A','A組'),row('5260182','Driver A','B組')]);assert.equal(grouped.length,2);assert.equal(grouped.reduce((s,g)=>s+g.containers,0),60);});
test('vessel page automatically reads saved masters, allows name filtering, and keeps source totals',()=>{c.records=rows;c.shipMasters=[{workingNo:'5260182',vessel:'TEST',month:'2026-10',workingSheetSource:{}},{workingNo:'5260182-1',vessel:'TEST CHILD',month:'2026-10'}];els.driverVesselShip.value='5260182';c.renderVesselDriverView();assert(els.driverVesselBody.innerHTML.indexOf('王先生')<els.driverVesselBody.innerHTML.indexOf('林先生'));const all=els.driverVesselSourceState.textContent;els.driverVesselName.value='林先生';c.renderVesselDriverView();assert(els.driverVesselBody.innerHTML.includes('林先生'));assert(!els.driverVesselBody.innerHTML.includes('王先生'));assert.equal(els.driverVesselSourceState.textContent,all);assert(els.driverVesselRecordBody.innerHTML.includes('08:00'));assert.equal((els.driverVesselRecordBody.innerHTML.match(/<td(?:>| class=)/g)||[]).length,12);assert(els.driverVesselRecordBody.innerHTML.includes('vessel-disc'));assert(els.driverVesselCount.textContent.includes('1 位司機'));});
test('history records without a master are selectable and show missing source status',()=>{c.shipMasters=[];c.records=[row('5260180','歷史司機')];els.driverVesselShip.value='';els.driverVesselName.value='';c.renderVesselDriverView();assert(els.driverVesselShip.innerHTML.includes('5260180'));assert(els.driverVesselSourceState.textContent.includes('未取得 WORKING SHEET'));assert(els.driverVesselBody.innerHTML.includes('歷史司機'));});
test('the real compact page renders without the removed summary table',()=>{const previous=els.driverVesselBody;delete els.driverVesselBody;c.renderVesselDriverView();assert(els.driverVesselRecordBody.innerHTML.includes('歷史司機'));els.driverVesselBody=previous;});
test('page has a clear new name, no second upload, and explicit centered detail cells',()=>{const section=html.slice(html.indexOf('<section id="view-personstats"'),html.indexOf('</main>',html.indexOf('<section id="view-personstats"')));assert(section.includes('全船 AQC 作業明細'));const main=section.split('id="integratedRecordDetails"')[0];assert.equal((main.match(/<th>/g)||[]).length,12);assert(!main.includes('id="driverVesselBody"'));assert(main.includes('全船 AQC 作業明細'));assert(section.includes('id="view-records"'));assert(section.includes('integratedRecordDetails'));assert(!/<button[^>]*data-tab="records"/.test(html));assert(!section.includes('type="file"'));assert(html.includes('#personRecordBody td'));assert(html.includes('text-align:center!important;vertical-align:middle!important'));assert(html.includes('個人作業紀錄'));assert(html.includes('port79-aqc-schedule-groups.js?v=20261017-ranking'));});
test('all three AQC are visible with separate subtotals and one row per source record',()=>{
 const input=['8001','8002','8003'].flatMap((number,i)=>[0,1].map(j=>({...row('5260182','Driver '+i),number,id:'record-'+i+'-'+j,disc:i+1,load:j+2})));
 els.driverVesselAqcSummary={innerHTML:''};c.renderDriverVesselAqcSummary(input,input);
 const out=c.renderDriverVesselDetailTable(input);for(const aqc of ['8001','8002','8003']){assert(out.includes('AQC '+aqc));assert(els.driverVesselAqcSummary.innerHTML.includes('AQC '+aqc))}
 assert.equal((out.match(/class="vessel-operation-row"/g)||[]).length,6);assert.equal((out.match(/class="vessel-aqc-divider/g)||[]).length,3);
 const before=JSON.stringify(input);c.renderDriverVesselDetailTable(input);assert.equal(JSON.stringify(input),before);
 const total=input.reduce((n,r)=>n+r.disc+r.load,0);assert.equal(total,27);
});
test('AQC summaries retain the whole ship while a filter shows only one machine',()=>{
 const input=['8001','8002','8003'].map(number=>({...row('5260182','Driver'),number}));c.renderDriverVesselAqcSummary(input,[input[0]]);
 assert.equal((els.driverVesselAqcSummary.innerHTML.match(/vessel-aqc-card/g)||[]).length,3);assert(els.driverVesselAqcSummary.innerHTML.includes('目前顯示 0 筆'));
});
test('changing ships clears person, machine, group and date restrictions',()=>{
 for(const id of ['driverVesselName','driverVesselAqc','recordGroupFilter','recordDateFrom','recordDateTo']){els[id]||={};els[id].value='old';}
 let renders=0;const original=c.renderVesselDriverView;c.renderVesselDriverView=()=>renders++;
 vm.runInContext(fn('clearDriverVesselFilters'),c);vm.runInContext(fn('onDriverVesselShipChange'),c);c.onDriverVesselShipChange();
 for(const id of ['driverVesselName','driverVesselAqc','recordGroupFilter','recordDateFrom','recordDateTo'])assert.equal(els[id].value,'');assert.equal(renders,1);c.renderVesselDriverView=original;
});
(async()=>{
 const render=c.renderVesselDriverView;let renders=0;c.renderVesselDriverView=()=>renders++;c.gcToken='session-a';els.driverVesselMonth.value='2026-09';const calls=[],merged=[];
 c.apiGetQuick=async(action,p)=>{calls.push({action,p});return action==='gcGetData'?{ok:true,shipMasters:[{workingNo:'old'}],records:[]}:{ok:true,shipMasters:[],records:[row('old','History Driver')]};};c.mergeEfficiencyCloudData=data=>merged.push(data);
 await c.loadDriverVesselMonth(true);assert.equal(calls.length,2);assert.equal(calls[1].action,'historyGetMonthData');assert.equal(calls[1].p.month,'2026-09');assert.equal(merged.length,2);assert.equal(c.driverVesselReads.get('session-a|2026-09').status,'ready');passed++;
 c.apiGetQuick=async action=>{if(action==='historyGetMonthData')throw Error('unavailable');return {ok:true,records:[],shipMasters:[]};};await c.loadDriverVesselMonth(true);assert.equal(c.driverVesselReads.get('session-a|2026-09').status,'partial');passed++;
 const resolvers=[];merged.length=0;c.apiGetQuick=()=>new Promise(r=>resolvers.push(r));const loading=c.loadDriverVesselMonth(true);els.driverVesselMonth.value='2026-08';resolvers.forEach(resolve=>resolve({ok:true,shipMasters:[],records:[]}));await loading;assert.equal(merged.length,0);passed++;
 let finish;const shared=new Promise(r=>finish=r);c.apiGetQuick=()=>shared;els.driverVesselMonth.value='2026-07';const pending=c.loadDriverVesselMonth(true);c.gcToken='session-b';finish({ok:true,shipMasters:[],records:[]});await pending;assert.equal(merged.length,0);passed++;
 c.renderVesselDriverView=render;
 console.log(JSON.stringify({passed,failed:0,scope:'Saved/history vessel selection, stroke sorting, filters and read-only loaders'}));
})().catch(e=>{console.error(e);process.exitCode=1;});

assert(!/<button[^>]*data-tab="groups"/.test(html),'Manual group management entry must be removed');
