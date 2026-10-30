'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const module=require('../assets/port79-monthly-dashboard.js');
const html=fs.readFileSync('index.html','utf8');
const script=fs.readFileSync('assets/port79-reference-dashboard.js','utf8');
const css=fs.readFileSync('assets/port79-reference-dashboard.css','utf8');
assert.equal(module.displayPersonName('林宏毅(AQC)'),'林宏毅');
assert.equal(module.displayPersonName('林宏毅（ AQC ）'),'林宏毅');
assert.equal(module.displayPersonName('林宏毅'),'林宏毅');
assert.equal(module.displayPersonName('AQC工程師'),'AQC工程師');
assert.equal(module.rosterGroup('A組'),'A組');assert.equal(module.rosterGroup(' b 組 '),'B組');
assert.equal(module.rosterGroup('AQC'),'','AQC is a job title, not a team');
assert.equal(module.rosterGroup('不分組'),'');
const records=[
 {empId:'E1',name:'林宏毅(AQC)',timeHours:2,totalMoves:50,dept:'AQC'},
 {empId:'E1',name:'林宏毅',timeHours:2,totalMoves:50,dept:'AQC'},
 {empId:'E2',name:'第二位',timeHours:2,totalMoves:120,group:'B組'},
 {empId:'E3',name:'第三位',timeHours:4,totalMoves:200,group:'C組'},
 {name:'第四位(AQC)',timeHours:2,totalMoves:80},
 {empId:'E5',name:'第五位(AQC)',timeHours:2,totalMoves:55}
];
const result=module.analyzeVessels({shipMasters:[],records});
assert.equal(result.people.length,5,'two spelling variants of one known employee merge, not duplicated');
assert.equal(result.people.find(p=>p.id==='E1').name,'林宏毅');
assert.equal(result.people.find(p=>p.id==='E1').moves,100);
assert.equal(result.people.find(p=>p.id==='E1').group,'','AQC role must not become an A-group marker');
const roster={employees:[
 {empId:'E1',name:'林宏毅',group:'A組'},
 {empId:'E2',name:'第二位',group:'B組'},
 {empId:'E3',name:'第三位',group:'C組'},
 {empId:'E4',name:'第四位',group:'D組'},
 {empId:'E5',name:'第五位',group:'不分組'}
],schedules:[
 {empId:'E1',name:'林宏毅',group:'A組',schedule:{__personnel:{group:'A組'}}},
 {empId:'E2',name:'第二位',group:'B組',schedule:{__personnel:{group:'B組'}}},
 {empId:'E3',name:'第三位',group:'C組',schedule:{__personnel:{group:'C組'}}},
 {empId:'E4',name:'第四位',group:'D組',schedule:{__personnel:{group:'D組'}}}
]};
const original=JSON.stringify(roster);
const people=module.assignPersonGroups(result.people,roster);
assert.equal(people.find(p=>p.id==='E1').group,'A組');
assert.equal(people.find(p=>p.id==='E2').group,'B組');
assert.equal(people.find(p=>p.id==='E3').group,'C組');
assert.equal(people.find(p=>p.name==='第四位').group,'D組','name-only ship detail uses unique authoritative roster name');
assert.equal(people.find(p=>p.id==='E5').group,'','unassigned personnel remains unassigned');
assert.equal(JSON.stringify(roster),original,'read-only group mapping does not change roster');
assert.equal(module.assignPersonGroups(result.people,null).find(p=>p.id==='E1').group,'','no authorization implies no guessed group');
const duplicate=module.assignPersonGroups([{id:'',name:'同名(AQC)',group:''}],{
 employees:[{empId:'X1',name:'同名',group:'A組'},{empId:'X2',name:'同名',group:'B組'}],schedules:[]
});
assert.equal(duplicate[0].group,'','same-name ambiguity is not guessed');
for(const team of ['ALL','A組','B組','C組','D組'])assert(html.includes('data-people-group="'+team+'"'),'filter button '+team);
assert(html.includes('p79DashPeopleGroupFilters')&&script.includes("addEventListener('click'"),'real buttons have a click handler');
assert(script.includes("matched.filter(p=>p.group===peopleGroup)"),'filter changes underlying table rows');
assert(script.includes('renderPeople();'),'monthly roster updates rerender the table');
assert(script.includes("aria-pressed"),'selected button is accessible');
assert(css.includes('.p79r-people-panel .p79d-table-scroll'),'compact table stays within card');
assert(html.includes('group-efficiency-v1'),'new JS and CSS asset versions bypass older browser cache');
console.log('PASS A/B/C/D grouping; AQC suffix removed in ranking only; unique-ID and name reconciliation, unknown/duplicate names safe; official data immutable; buttons wired and cache refreshed');
