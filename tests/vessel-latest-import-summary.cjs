const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function between(start,end){
 const i=html.indexOf(start),j=html.indexOf(end,i+start.length);
 assert(i>=0&&j>i,'function region missing: '+start);
 return html.slice(i,j);
}
const code=[
 between('function workingNoSortParts(v)','function sameShipMasterJob(a,b)'),
 between('function shipMasterToSummary(s)','// 2026-09-24：gcSyncAll'),
 between('function renderVesselSummary(v)','function reportTime(v)')
].join('\n');
const nodes=new Map(),saved=[],card={shown:false};
card.classList={add(v){if(v==='hidden')card.shown=false;},remove(v){if(v==='hidden')card.shown=true;}};
const element=id=>id==='vesselSummaryCard'?card:(nodes.has(id)?nodes.get(id):(nodes.set(id,{textContent:''}),nodes.get(id)));
const ctx={Date,Array,String,Math,Number,shipMasters:[],lastVesselSummary:null,
 document:{getElementById:element},num:x=>Number(x)||0,
 p79VesselChineseDisplay:s=>s.vessel,
 p79EfficiencyWriteOptional:(k,v)=>saved.push({key:k,value:v})
};
vm.createContext(ctx);
vm.runInContext(code,ctx);
const old={workingNo:'5260196-CALL2',vessel:'WAN HAI 105',workingSheetImportedAt:'2026-11-08T03:00:00.000Z',wharf:'79R',aqcs:[{},{}]};
const fresh={workingNo:'5260218',vessel:'最新匯入測試船',workingSheetImportedAt:'2026-11-11T01:00:00.000Z',wharf:'79R',aqcs:[{}]};
assert.equal(ctx.latestVesselMasterForSummary([old,fresh]).workingNo,'5260218','newer import must win over old CALL2');
assert.equal(ctx.latestVesselMasterForSummary([
 {...old,workingSheetImportedAt:''},{...fresh,workingSheetImportedAt:''}
]).workingNo,'5260218','when import time missing compare base numbers, not concat CALL');
assert.equal(ctx.workingNoSortParts('5260196-CALL2').base,5260196);
assert.equal(ctx.latestVesselMasterForSummary([
 {workingNo:'5260196-CALL1'},{workingNo:'5260196-CALL2'}
]).workingNo,'5260196-CALL2','higher call wins within same base number');
assert.equal(ctx.latestVesselMasterForSummary([
 {...old,workingSheetImportedAt:'2026-11-12T01:00:00.000Z'},fresh
]).workingNo,'5260196-CALL2','actual later import beats higher working number');
assert.equal(ctx.vesselSummaryImportTime({workingSheetImportedAt:'bad'}),0);
ctx.shipMasters=[old,fresh];
ctx.lastVesselSummary={...old,vessel:'STALE LOCAL CACHE'};
ctx.renderVesselSummary();
assert.equal(element('vsWorkingNo').textContent,'5260218','render must replace stale cached vessel after cloud sync');
assert.equal(element('vsVessel').textContent,'最新匯入測試船');
assert.match(element('vsImportMeta').textContent,/11\/11/);
assert.equal(card.shown,true);
assert(saved.some(x=>x.value.includes('5260218')),'latest summary should be saved to cache');
ctx.shipMasters=[old];
ctx.renderVesselSummary();
assert.equal(element('vsWorkingNo').textContent,'5260196-CALL2','do not invent a new ship if it is absent from loaded master data');
const startup=between("try{lastVesselSummary=JSON.parse(localStorage.getItem('ship_stats_last_vessel_summary')", "const psm=document.getElementById('personStatMonth')");
assert.match(startup,/updateLatestVesselSummaryFromMasters\(\)/);
assert.doesNotMatch(startup,/replace\(\/\\D\/g/,'boot must not flatten CALL suffix');
assert.match(html,/workingSheetImportedAt,sourceFileName:String\(file\?\.name/,'new import must retain imported timestamp in summary');
for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(/\bsrc=|application\/ld\+json/i.test(script[1])||!script[2].trim())continue;
 new vm.Script(script[2]);
}
console.log('PASS new import 5260218 beats 5260196-CALL2; timestamp precedence; CALL suffix fallback; cache and cloud redraw; script parsing');
