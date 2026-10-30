'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const analytics=require('../assets/port79-monthly-dashboard.js');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/port79-reference-dashboard.css','utf8');
const src=fs.readFileSync('assets/port79-reference-dashboard.js','utf8');
assert.match(html,/<th>排名<\/th><th>員工姓名<\/th><th>作業量<\/th><th>艙蓋<\/th><th>效率<\/th>/);
assert(!html.includes('<th>所屬單位</th>'),'unit is not displayed in the rank table');
assert(!src.includes(".slice(0,5)"),'no five-person cutoff in reference dashboard');
assert(!src.includes("esc(r.dept||'—')"),'unit must not render in any personnel rank row');
assert(!src.includes("slice(0,6).map((p,i)"),'fallback renderer cannot cap at six');
assert(css.includes('justify-content:center!important'),'the A-D switch buttons are centered');
assert(css.includes('.p79r-people-panel .p79d-table-scroll')&&css.includes('max-height:none!important'),'all personnel must be visible without clipped table height');
assert(css.includes('.p79r-people-panel tbody td:nth-child(2)'),'personnel names center align');

const detail=(name,id,moves,hc,hours)=>({empId:id,name,disc:moves,load:0,hatches:hc,timeHours:hours});
const rows=[detail('甲(AQC)','1',20,3,2),detail('甲','1',30,2,3),
 detail('乙','2',45,0,2),detail('丙','3',35,null,2),detail('丁','4',60,4,3)];
const rank=analytics.analyzeVessels({shipMasters:[],records:rows}).people;
const one=rank.find(x=>x.id==='1');
assert.equal(one.hatches,5,'sum hatch covers across same employee records');
assert.equal(one.moves,50,'keep existing container Moves calculation');
assert.equal(one.efficiency,10,'keep existing Moves per hour efficiency calculation');
assert.equal(rank.find(x=>x.id==='2').hatches,0,'an actual zero H/C remains zero');
assert.equal(rank.find(x=>x.id==='3').hatches,null,'missing H/C is not an invented zero');

const elements=new Map(),el=id=>{
 if(!['p79DashPeopleRanking','p79DashPeopleGroupFilters','p79DashMonth','p79DashVesselNotices'].includes(id))return null;
 if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'2026-10',
  querySelectorAll:()=>[],closest:()=>null});
 return elements.get(id);
};
const document={getElementById:el,readyState:'loading',addEventListener:()=>{}};
const root={document,P79MonthlyDashboard:analytics};
vm.runInNewContext(src,{window:root,console,Intl,Date,Number,Math,Set,Map,String});
const v={vessels:[],weekVessels:[],weekError:'',people:rank,detailCount:rows.length,timedRows:rows.length,count:0,containers:0,moves:0,workHours:12};
root.P79ReferenceDashboard.vessels(v);
let view=el('p79DashPeopleRanking').innerHTML;
assert.equal((view.match(/<tr>/g)||[]).length,4,'all four named employees, not a Top-5 subset');
const complete=Array.from({length:34},(_,i)=>({
 name:'員工'+String(i).padStart(2,'0'),id:'P'+i,group:i%2?'B組':'A組',
 moves:80-i,hatches:i,efficiency:30-i/10
}));
root.P79ReferenceDashboard.vessels({...v,people:complete});
view=el('p79DashPeopleRanking').innerHTML;
assert.equal((view.match(/<tr>/g)||[]).length,34,'display every one of 34 ranked people');
assert(view.includes('員工33')&&view.includes('<td>33</td>'),'last ranked employee and hatch cover are visible');
assert(!view.includes('所屬單位'));
assert(!view.includes('(AQC)'));
root.P79ReferenceDashboard.choosePeopleGroup('B組');
view=el('p79DashPeopleRanking').innerHTML;
assert.equal((view.match(/<tr>/g)||[]).length,17,'B group shows every member, not five');
assert(!view.includes('員工00')&&view.includes('員工33'));
root.P79ReferenceDashboard.choosePeopleGroup('ALL');
view=el('p79DashPeopleRanking').innerHTML;
assert.equal((view.match(/<tr>/g)||[]).length,34);
console.log('PASS 34 people and full group membership; five centered headings; actual H/C 0 versus unknown; existing Moves/efficiency unchanged; no source writes');
