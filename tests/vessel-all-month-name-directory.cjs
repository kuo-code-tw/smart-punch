'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('assets/port79-vessel-name-directory.js','utf8');
const context={};vm.createContext(context);vm.runInContext(src,context);
const api=context.P79VesselNameDirectory;
const records=JSON.parse(src.split('const records=')[1].split(';\n')[0]);
assert.equal(api.metadata.months.length,21);assert(api.metadata.records>5000);
let resolved=0,ambiguous=0;
for(const [key,values] of Object.entries(records)){
 const names=[...new Set(values.map(x=>x[0]))],imos=[...new Set(values.map(x=>x[1]).filter(Boolean))];
 const expected=names.length===1&&imos.length<=1?names[0]:'';
 assert.equal(api.getChineseName(key),expected,key);
 if(expected)resolved++;else ambiguous++;
}
assert.equal(resolved,api.metadata.unambiguous);assert(ambiguous>0);
for(const [name,chinese] of [['wan-hai 271','百春'],['WAN HAI 371','登春'],['WAN HAI 315','貴春'],['WAN HAI 316','光春'],['WAN HAI 178','闊春'],['WAN HAI 376','宙春']])assert.equal(api.getChineseName(name),chinese);
assert.equal(api.getChineseName('WAN HAI 271','9302695'),'','wrong IMO never matches another vessel');
assert.equal(api.getChineseName('WAN HAI 9999'),'');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
function fn(name){const a=html.indexOf('function '+name+'(');assert(a>=0);return html.slice(a,html.indexOf('\n}',a)+2);}
const c={P79VesselNameDirectory:api,shipMasters:[],localStorage:{getItem:()=>null}};
vm.createContext(c);vm.runInContext(fn('p79VesselChineseName')+'\n'+fn('p79VesselChineseDisplay'),c);
for(const month of ['2025-01','2026-09','2026-10','2026-11']){
 for(const [name,value] of Object.entries(records)){
  const chinese=api.getChineseName(name);if(!chinese)continue;
  const record={vessel:name,firstDate:month+'-01'};
  assert.equal(c.p79VesselChineseDisplay(record),chinese);assert.equal(record.vesselChineseName,undefined,'lookup does not mutate historical data');
 }
}
assert.equal(c.p79VesselChineseDisplay({vessel:'WAN HAI 271',vesselChineseName:'既有核定名稱'}),'既有核定名稱');
assert(html.includes('vesselChineseName:p79VesselChineseDisplay(s)'),'exports use the same directory');
for(const f of ['index.html','aqc-efficiency/index.html'])assert(fs.readFileSync(f,'utf8').includes('port79-vessel-name-directory.js'));
console.log('PASS '+resolved+' official names across all month contexts; '+ambiguous+' ambiguous names withheld; IMO, existing names and immutable history preserved');
