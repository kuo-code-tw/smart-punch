'use strict';
// Regression: HR read failures must never erase WORKING REPORT volume/time charts.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/personnel-reference-dashboard.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const nodes=new Map();
function element(id){
 if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',hidden:false,querySelectorAll:()=>[]});
 return nodes.get(id);
}
const doc={getElementById:element,querySelector:()=>null};
const win={addEventListener(){}};
new Function('window','document',source)(win,doc);
const report=[
 {name:'現職甲',workDate:'2026-11-16',disc:8,load:12,hours:2,hc:0,containers:20},
 {name:'離職乙',workDate:'2026-11-17',disc:6,load:14,hours:4,hc:2,containers:20}
];
win.P79PersonnelReference.render({sourceRows:report,rows:[],persons:[],metrics:r=>r,rosterVerified:false});
assert.equal(element('p79prPeople').textContent,'—','never pretend to know the current headcount when HR is offline');
assert.equal(element('p79prCount').textContent,'2','original WORKING REPORT records stay visible');
assert.equal(element('p79prContainers').textContent,'40','work quantities independent of HR');
assert.equal(element('p79prHours').textContent,'6.0','work hours independent of HR');
assert(element('p79prDailyChart').innerHTML.includes('<svg'),'daily trend must render without HR');
assert(!element('p79prRankBody').innerHTML.includes('離職乙'),'do not rank departed employees without HR');
const active=[{name:'現職甲',group:'A組',hours:2,containers:20,hc:0,eff:10}];
win.P79PersonnelReference.render({sourceRows:report,rows:[report[0]],persons:active,metrics:r=>r,groupCode:s=>s[0],rosterVerified:true,rosterCount:1,excludedRows:1});
assert.equal(element('p79prPeople').textContent,'1','only verified active personnel count');
assert.equal(element('p79prCount').textContent,'2','archive totals still include both historical report records');
assert.equal(element('p79prContainers').textContent,'40');
assert(element('p79prRankBody').innerHTML.includes('現職甲'));
assert(!element('p79prRankBody').innerHTML.includes('離職乙'));
assert(html.includes('const rs=sourceRows;'),'main weekly reporting must not depend on HR');
assert(html.includes('const personnelRows=verifiedLive.rows;'),'employee charts must depend on verified HR');
assert(html.includes('sourceRows:rs,persons:rankedPersonnelEfficiencyPersons(hrView.persons)'),'reference rendering uses source work records');
console.log('PASS HR outage keeps report metrics/charts, while live people ranking remains verified-only');
