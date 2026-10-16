const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{performance}=require('perf_hooks');
const root=path.resolve(__dirname,'..'),after=fs.readFileSync(path.join(root,'aqc-efficiency/index.html'),'utf8');
// Fixed parent of the original optimization; optional HTML override remains supported.
const baseline=process.argv[2];
const before=baseline?fs.readFileSync(baseline,'utf8'):require('child_process').execFileSync('git',['show','083fd1ffeba4e30c2db7289cf38f48665b23ae39:aqc-efficiency/index.html'],{cwd:root,encoding:'utf8',maxBuffer:5*1024*1024});
function fn(src,name){const start=src.indexOf('function '+name+'(');assert(start>=0,name);const end=src.indexOf('\n}',start);assert(end>start,name);return src.slice(start,end+2)}
function context(src){
  const c={console,shipMasters:[],records:[],roster:[],month:'',year:'2026',range:null,lookupCalls:0,
    PERSON_NAME_ALIAS_GROUPS:[['張嘉誠','張家誠']],
    document:{getElementById:()=>({get value(){return c.month}})},getPort79Year:()=>c.year,
    dashboardDateRange:()=>({active:!!c.range}),dateWithinDashboardRange:d=>d>=c.range[0]&&d<=c.range[1],
    people:()=>c.roster,personGroupId:p=>p.groupId||'',
    // Unchanged bundle move calculation is provided as a boundary dependency.
    recordMoveValues:r=>({disc:r.bundleDisc??r.disc,load:r.bundleLoad??r.load})};
  vm.createContext(c);vm.runInContext('const num=v=>Number(v)||0; const round=(v,n=2)=>Number.isFinite(v)?Number(v.toFixed(n)):0;',c);
  for(const name of ['normalizePersonName','samePersonName','displayPersonName','normalizeAqcNo','normalizeMonthlySerial','monthlyShipNo','normalizeShipText','workingNoHasSuffix','recordMatchesMasterDate','timeDiffHours','effectiveHours','operationalSourceRank','vesselMasterForRecord','canonicalOperationalRecords','summaryRows'])vm.runInContext(fn(src,name),c);
  const resolve=c.vesselMasterForRecord;c.vesselMasterForRecord=r=>{c.lookupCalls++;return resolve(r)};return c;
}
const a=context(before),b=context(after),results=[];let passed=0;
const plain=x=>JSON.parse(JSON.stringify(x));
function test(name,f){f();passed++;results.push({name,ok:true});console.log('PASS '+name)}
function fixture(masters,records,roster=[],options={}){for(const c of [a,b])Object.assign(c,{shipMasters:structuredClone(masters),records:structuredClone(records),roster:structuredClone(roster),month:'',year:'2026',range:null,lookupCalls:0,...options})}
function equalCanon(){assert.deepEqual(plain(b.canonicalOperationalRecords(b.records)),plain(a.canonicalOperationalRecords(a.records)))}
function equalSummary(){assert.deepEqual(plain(b.summaryRows()),plain(a.summaryRows()))}
const row=(id,extra={})=>({id,workingNo:'5260149',name:'測試員',empId:'E1',workDate:'2026-10-12',number:'GC101',startTime:'08:00',endTime:'16:00',containers:12,hatches:2,source:'web',...extra});
const masters=[{workingNo:'5260149',vessel:'WAN HAI 177',firstDate:'2026-10-12',lastDate:'2026-10-14',voyageE:'S062',aqcs:[{number:'101'}]},{workingNo:'5260149-1',vessel:'WAN HAI 177',firstDate:'2026-10-12'},{workingNo:'5260149-2',vessel:'WAN HAI 177',firstDate:'2026-10-12'}];
test('parent and child jobs remain three separate segments',()=>{fixture(masters,masters.map((s,i)=>row('R'+i,{workingNo:s.workingNo})));equalCanon();assert.equal(b.canonicalOperationalRecords(b.records).length,3)});
test('short serial aliases deduplicate but retain child suffixes',()=>{fixture(masters,[row('parent'),row('alias',{workingNo:'0149'}),row('child',{workingNo:'0149-1'}),row('child2',{workingNo:'149-02'})]);equalCanon();assert.equal(b.canonicalOperationalRecords(b.records).length,3)});
test('source priority, completeness and original tie order preserved',()=>{fixture(masters,[row('first'),row('tie'),row('excel',{source:'excel-import'}),row('driver',{source:'gc-driver-efficiency'}),row('official',{source:'working-report'})]);equalCanon();assert.equal(b.canonicalOperationalRecords(b.records)[0].id,'official')});
test('missing identifiers retain name, voyage, date and ambiguous-master fallbacks',()=>{fixture([...masters,{workingNo:'5260200',vessel:'WAN HAI 177',firstDate:'2026-11-01',voyageE:'S063'}],[row('missing',{workingNo:'',vessel:'WAN HAI 177 S062',voyage:'S062'}),row('outside',{workingNo:'',vessel:'WAN HAI 177',workDate:'2026-09-01'}),row('unknown',{workingNo:'',vessel:'UNKNOWN',number:'GC999'}),row('no-time',{workingNo:'',startTime:'',endTime:'',note:'備註'})]);equalCanon();assert.equal(b.lookupCalls,a.lookupCalls)});
test('ID/name OR matches, aliases, empty and numeric IDs count exactly once',()=>{fixture(masters,[row('one',{name:'張家誠',empId:'E1'}),row('two',{name:'張嘉誠 (AQC)',empId:'E2',startTime:'17:00',endTime:'18:00'}),row('empty',{name:'',empId:'',startTime:'19:00',endTime:'20:00'}),row('numeric',{name:'其他',empId:7,startTime:'21:00',endTime:'22:00'})],[{empId:'E1',name:'張嘉誠'},{empId:'E2',name:'張家誠'},{empId:'',name:''},{empId:7,name:'不同'},{empId:'7',name:'其他'},{empId:'E1',name:'重複工號'}]);equalSummary()});
test('working-report moves, hatches, overnight hours and ranking ties preserved',()=>{fixture(masters,[row('night',{startTime:'23:00',endTime:'01:00',source:'working-report',disc:10,load:20,bundleDisc:8,bundleLoad:19}),row('driver',{empId:'E2',name:'第二員',source:'gc-driver-efficiency',disc:4,load:5}),row('negative',{empId:'E3',name:'第三員',containers:-3,hatches:5,timeHours:1})],[{empId:'E1',name:'測試員'},{empId:'E2',name:'第二員'},{empId:'E3',name:'第三員'}]);equalSummary()});
test('month, year and date range filters preserve full results',()=>{for(const opts of [{month:'2026-10'},{year:'2027'},{year:''},{range:['2026-10-12','2026-10-12']}]){fixture(masters,[row('oct'),row('nov',{workDate:'2026-11-01'}),row('future',{workDate:'2027-10-12'})],[{empId:'E1',name:'測試員'}],opts);equalSummary()}});
test('in-place edits, additions, deletions and repeated reads remain fresh',()=>{fixture(masters,[row('edit')],[{empId:'E1',name:'測試員'}]);for(let i=0;i<10;i++){for(const c of [a,b]){c.records[0].containers=i*13;c.records[0].workingNo=i%2?'5260149-2':'5260149';c.roster[0].name=i%2?'新姓名':'測試員'}equalCanon();equalSummary()}for(const c of[a,b])c.records.push(row('add',{startTime:'17:00'}));equalSummary();for(const c of[a,b])c.records.shift();equalSummary();equalSummary()});
// Deterministic differential fixtures include duplicate IDs, missing IDs/names and non-string IDs.
let seed=79149;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
for(let scenario=0;scenario<150;scenario++)test('differential fixture '+scenario,()=>{const roster=Array.from({length:20},(_,i)=>({empId:i%6===0?i:'E'+(i%8),name:['甲','乙','張家誠','張嘉誠 (AQC)',''][rnd(5)]}));const rows=Array.from({length:100},(_,i)=>row('R'+i,{workingNo:['5260149','0149','5260149-1','0149-2',''][rnd(5)],name:['甲','乙','張家誠','張嘉誠 (AQC)',''][rnd(5)],empId:rnd(3)?'E'+rnd(8):rnd(8),workDate:rnd(4)?'2026-10-12':'2026-11-02',startTime:(8+rnd(12))+':00',endTime:(8+rnd(12))+':00',source:['web','working-report','gc-driver-efficiency','excel-import'][rnd(4)],containers:rnd(30),disc:rnd(10),load:rnd(20),hatches:rnd(4)}));fixture(masters,rows,roster);equalCanon();equalSummary()});
test('all vessel and portal inline scripts parse',()=>{let count=0;for(const file of ['aqc-efficiency/index.html','index.html'])for(const m of fs.readFileSync(path.join(root,file),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(m[1].trim()){new vm.Script(m[1]);count++}}assert(count>0)});
const bigMasters=Array.from({length:600},(_,i)=>({workingNo:String(5260000+i),vessel:'VESSEL '+i}));
const roster=Array.from({length:300},(_,i)=>({empId:'E'+i,name:'員工'+i}));
const rows=Array.from({length:18000},(_,i)=>row('R'+i,{workingNo:bigMasters[i%600].workingNo,empId:'E'+(i%300),name:'員工'+(i%300),workDate:'2026-10-'+String(1+Math.floor(i/600)).padStart(2,'0'),startTime:'08:00',endTime:'16:00'}));
fixture(bigMasters,rows,roster);equalSummary();
function bench(c){const times=[];c.lookupCalls=0;let result;for(let i=0;i<3;i++){const start=performance.now();result=plain(c.summaryRows());times.push(performance.now()-start)}return{medianMs:+times.sort((x,y)=>x-y)[1].toFixed(2),masterLookups:c.lookupCalls/3,rows:result.length}}
const old=bench(a),optimized=bench(b);assert.equal(optimized.masterLookups,0);assert.equal(old.masterLookups,18000);
const report={scope:'Synthetic Node differential tests; no Google writes, real browser CPU measurement or cloud save verification',passed,failed:0,results,benchmark:{records:rows.length,ships:600,people:300,baseline:old,optimized,speedup:+(old.medianMs/optimized.medianMs).toFixed(2)}};
fs.writeFileSync(path.join(__dirname,'vessel-speed-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.benchmark));
