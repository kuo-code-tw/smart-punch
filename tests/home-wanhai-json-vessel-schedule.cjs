'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),src=fs.readFileSync(path.join(root,'assets/port79-google-sheet-schedule.js'),'utf8');
const obj={document:{readyState:'loading',addEventListener(){}},setTimeout(){},clearTimeout(){}};
vm.runInNewContext(src,{window:obj,URL,Intl,Date});
const parse=obj.P79ManualShipSchedule.parseRows;
const inputs=[
 {name:'WAN HAI 178',localName:'萬春',inVoyage:'N076',outVoyage:'S077',eta:'2026/11/02 14:00',etb:'2026/11/02 15:00',etd:'2026/11/03 01:00',berth:'W80',status:'預定'},
 {name:'CAPE FELTON',localName:'',inVoyage:'N160',outVoyage:'S611',eta:'2026/11/02 19:00',etb:'2026/11/02 20:00',etd:'2026/11/02 22:30',berth:'W64'},
 {name:'',localName:'',inVoyage:'',outVoyage:'',berth:'NO'}
];
const rows=parse(inputs);
assert.equal(rows.length,2);
assert.equal(rows[0].name,'WAN HAI 178');
assert.equal(rows[0].localName,'萬春');
assert.equal(rows[0].inVoyage,'N076');assert.equal(rows[0].outVoyage,'S077');
assert.equal(rows[0].eta,'2026/11/02 14:00');
assert.equal(rows[0].etb,'2026/11/02 15:00');
assert.equal(rows[0].etd,'2026/11/03 01:00');
assert.equal(rows[0].berth,'W80');
assert.equal(rows[1].berth,'W64');
assert.equal(parse([{name:'bad',inVoyage:''}]).length,0);
assert(!src.includes('Eways_GetVesselSchedule'),'only user-entered spreadsheet data allowed');
new vm.Script(src);
console.log('PASS: private ship schedule schema preserves ETA ETB ETD berth and filters empty sheet rows');