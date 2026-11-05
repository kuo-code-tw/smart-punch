const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n}',a)+2);}
(async()=>{
 let calls=0,clock=0,lights=[];
 const c={Date:{now:()=>clock},GC_FULL_READ_TIMEOUT_MS:90000,Math,String,Promise,setTimeout(f,ms){clock+=ms;f();},p79SetEfficiencySyncLight:(...v)=>lights.push(v),apiGetQuick:async()=>{if(++calls<3)throw Object.assign(Error('船舶雲端資料正在同步，請稍後自動重試'),{retryable:true});return {ok:true,shipMasters:[{workingNo:'1'}]};}};
 vm.createContext(c);vm.runInContext(fn('p79ReadFullVesselData'),c);
 assert((await c.p79ReadFullVesselData('gcGetData',{})).ok);assert.equal(calls,3);assert.equal(lights.length,2);
 calls=0;c.apiGetQuick=async()=>{calls++;throw Error('權限不足');};await assert.rejects(c.p79ReadFullVesselData('gcGetData'),/權限不足/);assert.equal(calls,1);
 calls=0;c.apiGetQuick=async()=>{calls++;throw Object.assign(Error('busy'),{retryable:true});};await assert.rejects(c.p79ReadFullVesselData('gcGetData'),e=>e.vesselReadPending===true);assert.equal(calls,6);assert(clock<90000);
 const names={shipMasters:[{vessel:'WAN HAI 123',vesselChineseName:'測試船名'}],String,Set,localStorage:{getItem:()=>JSON.stringify({OTHER:'另一艘'})}};
 vm.createContext(names);vm.runInContext(fn('p79VesselChineseName')+'\n'+fn('p79VesselChineseDisplay'),names);
 assert.equal(names.p79VesselChineseDisplay({vessel:'WAN HAI 123'}),'測試船名');assert.equal(names.p79VesselChineseDisplay({vessel:'OTHER'}),'另一艘');assert.equal(names.p79VesselChineseDisplay({vessel:'UNKNOWN'}),'');
 assert.equal(names.p79VesselChineseName({localName:'ENGLISH ONLY'}),'');
 names.shipMasters.push({vessel:'WAN HAI 123',vesselChineseName:'不同名稱'});assert.equal(names.p79VesselChineseDisplay({vessel:'WAN HAI 123'}),'');
 const merge={num:v=>Number(v)||0,effectiveShipOverrides:()=>({}),getShipOverride:()=>({}),String,Array,Date,Object,Math};vm.createContext(merge);
 // Verify the field is included in the same non-empty merge protection as English names.
 assert(html.includes("'workingNo','vessel','vesselChineseName','voyageI'"));
 assert(html.includes('vesselChineseName:updated.vesselChineseName'));
 assert(html.includes('p79EfficiencyManualSyncActive||document.visibilityState'));
 console.log('PASS busy read retries, bounded pending state, permission errors stop, Chinese exact matching, ambiguity and English-only protection');
})().catch(e=>{console.error(e);process.exitCode=1;});
