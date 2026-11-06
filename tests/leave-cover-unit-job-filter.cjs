'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const moduleSrc=fs.readFileSync('assets/port79-smart-cover-picker.js','utf8');
const create=fs.readFileSync('assets/port79-leave-daily-simple.js','utf8');
const approved=fs.readFileSync('assets/port79-approved-cover-auto.js','utf8');
const htmlPage=fs.readFileSync('leave/index.html','utf8');
const ctx={window:{},Date,Map,Set};vm.runInNewContext(moduleSrc,ctx);
const picker=ctx.window.P79SmartCoverPicker;
const date='2026-11-08';
const p=(id,name,unit,job,dept='第一事業處')=>({empId:id,name,unit,jobTitle:job,dept,employmentStatus:'active'});
const people=[
 p('LEAVER','請假者','第一單位','AQC'),
 p('U1-A','甲員','第一單位','指揮手'),
 p('U1-B','乙員','第一單位','堆高機'),
 p('U2-A','丙員','第二單位','指揮手'),
 p('U2-B','丁員','第二單位','堆高機'),
 p('EMPTY','戊員','','指揮手'),
 p('FOREIGN','他部門','第三單位','指揮手','其他部門')
];
const rosters=new Map(people.map(x=>[x.empId,{[date]:'休'}]));
const params={people,target:people[0],date,rosters,selected:['U1-A','U2-A'],mode:'two',scope:'new'};
const opts=picker.candidates(params);
assert.equal(opts.length,5,'same department, non-leave candidates only');
assert.equal(picker.personUnit(people[5]),'未設定單位','missing unit is distinguishable');
assert.equal(picker.personJob(people[0]),'AQC');
let html=picker.render(params);
assert(html.includes('data-smart-action="filter-unit"'), 'unit selector visible');
assert(html.includes('data-smart-action="filter-job"'), 'job selector visible');
assert(html.includes('第一單位')&&html.includes('第二單位'),'select options reflect HR master');
assert(html.includes('未設定單位'),'staff without unit remain identifiable');
assert(!html.includes('第三單位'),'no cross-department recommendation via filter');
assert(html.includes('甲員')&&html.includes('丙員'),'initial all-person list shows multiple units');

html=picker.render({...params,unitFilter:'第一單位'});
assert(html.includes('甲員')&&html.includes('乙員'),'unit selection lists only matching staff');
assert(!html.includes('丙員')&&!html.includes('丁員'),'other units removed from visible list');
assert(html.includes('已勾選 2 / 2 位'),'hiding an assigned person never deselects');
assert(html.includes('甲員</span>')&&html.includes('丙員</span>'),'both assigned staff stay in preview');
const unitOnly=Array.from(picker.recommend({...params,unitFilter:'第一單位'},'two'));
assert.deepEqual(unitOnly.sort(),['U1-A','U1-B'],'recommendation honors selected unit');

html=picker.render({...params,unitFilter:'第一單位',jobFilter:'指揮手'});
assert(html.includes('甲員'),'unit and title selection match');
assert(!html.includes('乙員</strong>'),'wrong title hidden from candidate list');
assert(html.includes('已勾選 2 / 2 位'),'selected person count unchanged');
assert.deepEqual(Array.from(picker.recommend({...params,unitFilter:'第一單位',jobFilter:'指揮手'},'two')),['U1-A']);
assert(!picker.render({...params,unitFilter:'不存在單位'}).includes('甲員</strong>'));
assert(picker.render({...params,unitFilter:'不存在單位'}).includes('目前篩選沒有符合的候選人'));

const actions=[],fakeRoot={querySelectorAll(){return [unitNode,jobNode];}};
const closest=()=>({dataset:{smartDate:date}});
const unitNode={dataset:{smartAction:'filter-unit'},value:'第二單位',closest};
const jobNode={dataset:{smartAction:'filter-job'},value:'堆高機',closest};
picker.bind(fakeRoot,action=>actions.push(action));
unitNode.onchange();jobNode.onchange();
assert.deepEqual(JSON.parse(JSON.stringify(actions)),[
 {kind:'filter-unit',date,value:'第二單位'},
 {kind:'filter-job',date,value:'堆高機'}
],'change handlers update current day without issuing a network or save request');

assert(create.includes("entry.filterUnit=action.value;entry.filterJob=''"),'new leave clears old title when switching unit');
assert(approved.includes("row.filterUnit=action.value;row.filterJob=''"),'approved leave clears old title when switching unit');
assert(create.includes('unitFilter:row.filterUnit'),'new leave passes filter state');
assert(approved.includes('unitFilter:entry.filterUnit'),'approved leave passes filter state');
assert(htmlPage.includes('p79-smart-cover-unit-job-filter-v2'),'filter fields styled in the official page');
assert(htmlPage.includes('smart-cover-picker.js?v=20261106-unit-title-filter-v2'),'updated shared JS is cache-busted');

const bad=p('ATTACK','<img src=x onerror=alert(1)>','<script>alert(1)</script>','職稱</option><img src=x>');
html=picker.render({...params,people:[...people,bad]});
assert(!html.includes('<img src=x'),'staff names and titles HTML-escaped');
assert(!html.includes('<script>alert(1)</script>'),'unit HTML-escaped');
new vm.Script(moduleSrc);new vm.Script(create);new vm.Script(approved);
for(const m of htmlPage.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/g))
 if(!/\\bsrc=|application\\/json|importmap/.test(m[1]))new vm.Script(m[2]);
console.log('PASS unit/title filters: both entry points, department limits, selected persistence, HR title/unit, recommendations, escaping and JS parse');
