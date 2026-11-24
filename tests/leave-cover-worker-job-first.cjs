'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const pickerSource=fs.readFileSync('assets/port79-smart-cover-picker.js','utf8');
const approvedSource=fs.readFileSync('assets/port79-approved-cover-auto.js','utf8');
const createSource=fs.readFileSync('assets/port79-leave-daily-simple.js','utf8');
const page=fs.readFileSync('leave/index.html','utf8');
const root={};vm.runInNewContext(pickerSource,{window:root,Date,Map,Set});
const picker=root.P79SmartCoverPicker;
const date='2026-11-14';
const person=(empId,name,jobTitle,shift='休',dept='79W')=>({empId,name,jobTitle,dept,employmentStatus:'active'});
const people=[
 person('LEAVER','郭昇龍','F/L','晚'),
 person('A','方乃慶','F/L','中'),
 person('B','翁楚程','F/L','早'),
 person('C','其他職稱員工','AQC','早'),
 person('D','已請假員工','F/L','休'),
 person('E','不同單位員工','F/L','休','79D'),
 person('X','<script>alert(1)</script>','<img src=x>')
];
const rosters=new Map(people.map(p=>[p.empId,{[date]:p.shift||'休'}]));
const base={people,target:people[0],date,mode:'two',selected:[],rosters,
 leaves:[{empId:'D',startDate:date,endDate:date,status:'已核准'}],
 jobFilter:'F/L',nameFilter:'A'};
let html=picker.render(base);
let jobs=[...html.matchAll(/<select data-smart-action="slot-job" data-smart-slot="([01])"[\s\S]*?<\/select>/g)];
let peopleBoxes=[...html.matchAll(/<select data-smart-action="slot" data-smart-slot="([01])"[\s\S]*?<\/select>/g)];
assert.equal(jobs.length,2,'two independent visible job title selectors');
assert.equal(peopleBoxes.length,2,'two independently selected four-hour worker positions');
assert(jobs.every(x=>x[0].includes('<option value="F/L" selected>F/L</option>')),'leave applicant F/L auto-selects for both');
assert(peopleBoxes[0][0].includes('方乃慶')&&peopleBoxes[1][0].includes('翁楚程'),'both worker names are reachable without advancing filters');
assert(peopleBoxes.every(x=>!x[0].includes('其他職稱員工')),'primary name lists are narrowed by chosen title');
assert(jobs.every(x=>x[0].includes('AQC')&&x[0].includes('全部職稱')),'other titles always reachable');
assert(peopleBoxes.every(x=>!x[0].includes('不同單位員工')),'cross-department candidates are blocked');
assert(peopleBoxes.every(x=>x[0].includes('已請假員工')&&x[0].includes(' disabled')),'leave conflicts stay blocked');

html=picker.render({...base,slotJobs:['F/L','AQC'],selected:['A','C']});
peopleBoxes=[...html.matchAll(/<select data-smart-action="slot" data-smart-slot="([01])"[\s\S]*?<\/select>/g)];
assert(peopleBoxes[0][0].includes('方乃慶')&&!peopleBoxes[0][0].includes('其他職稱員工'),'first worker stays F/L');
assert(peopleBoxes[1][0].includes('其他職稱員工')&&!peopleBoxes[1][0].includes('翁楚程'),'second worker can use AQC independently');
assert(html.includes('已選好 2 位'),'mixed-title workers still complete 2 x 4-hour requirement');

const single=picker.render({...base,mode:'one',selected:['C']});
assert.equal((single.match(/data-smart-action="slot-job" data-smart-slot=/g)||[]).length,1);
assert(single.includes('value="AQC" selected'),'existing different-title worker is correctly inferred');
html=picker.render({...base,slotJobs:['',''],selected:[]});
peopleBoxes=[...html.matchAll(/<select data-smart-action="slot" data-smart-slot="([01])"[\s\S]*?<\/select>/g)];
assert(peopleBoxes[0][0].includes('方乃慶')&&peopleBoxes[0][0].includes('其他職稱員工'),'explicit all-job filter still exists');
assert(!html.includes('<script>alert(1)</script>'),'candidate display escapes HTML');
assert(!html.includes('<img src=x>'),'job labels escape HTML');

const events=[];
const jobControls=[0,1].map(slot=>({dataset:{smartAction:'slot-job',smartSlot:String(slot)},value:slot===0?'F/L':'AQC',closest:()=>({dataset:{smartDate:date}})}));
picker.bind({querySelectorAll:()=>jobControls},action=>events.push(action));
jobControls[0].onchange();jobControls[1].onchange();
assert.deepEqual(JSON.parse(JSON.stringify(events)),[
 {kind:'slot-job',date,slot:0,value:'F/L'},
 {kind:'slot-job',date,slot:1,value:'AQC'}
],'job changes are independently scoped by date and worker position');

for(const script of [approvedSource,createSource]){
 assert(script.includes("action.kind==='slot-job'"),'both new and approved leave forms listen to title selection');
 assert(script.includes('slotJobs'), 'each assignment stores its own current job filter');
 assert(script.includes("if(action.slot===0){"),'first worker changes never silently shift the second 4-hour timeslot');
 new vm.Script(script);
}
new vm.Script(pickerSource);
assert(page.includes('p79-cover-worker-job-first-v1'),'live page includes job/name layout');
for(const asset of ['port79-smart-cover-picker.js','port79-approved-cover-auto.js','port79-leave-daily-simple.js'])
 assert(page.includes(asset+'?v='+(asset==='port79-leave-daily-simple.js'?'20261119-group-consecutive-leave-close-v1':'20261116-sameday-4h-stroke-v1')),'static cache refreshed: '+asset);
console.log('PASS job-first leave cover: two independent role filters, proper defaults, conflict checks, different titles and single-person mode');
