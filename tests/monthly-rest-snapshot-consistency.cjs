'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const month='2026-10',date=n=>month+'-'+String(n).padStart(2,'0');
const html=fs.readFileSync('schedule/index.html','utf8');
const from=html.indexOf('    function p79ScheduleRestCountCells(');
const to=html.indexOf('    function p79RefreshScheduleRestCounts(',from);
assert(from>=0&&to>from,'official roster summary renderer must be present');
let ledger={quota:{例:4,休:5,國:2},remaining:{例:0,休:1,國:1},reported:{例:0,休:0,國:0},reserved:{例:0,休:0,國:0},ledger:[]};
const ctx={
 p79RestQuota:()=>({counts:{例:4,休:5,國:2}}),
 p79DailyRestCount:()=>({dates:{例:['01','02','03','04'],休:['05','06','07'],國:['10','25']}}),
 p79ScheduleRestBalance:()=>ledger,p79ScheduleTyphoonDays:()=>[],
 scheduleEscapeHtml:x=>String(x||'')
};
vm.createContext(ctx);vm.runInContext(html.slice(from,to),ctx);
const selected={例:[date(1),date(2),date(3),date(4)],休:[date(5),date(6),date(7)],國:[date(10),date(25)]};
const render=(person=0,typhoon=[])=>ctx.p79ScheduleRestCountCells({id:'E'+person,name:person===1?'胡毓麒':'測試員工'+person},month,{},typhoon,[],selected);
const span=(html,category)=>html.match(new RegExp('data-rest-category="'+category+'"[^>]*><span>([^<]+)<\/span>'))?.[1];
let output=render();
assert.equal(span(output,'例'),'4/0');assert.equal(span(output,'休'),'3/2');assert.equal(span(output,'國'),'2/0','two visibly selected national dates must not show a phantom 2/1');
assert.match(output,/班格與正式帳本差異須核對/,'a mismatching official ledger remains visible for review');
const first=['例','休','國'].map(k=>span(output,k)).join('|');
ledger={...ledger,remaining:{例:3,休:4,國:2}};
assert.equal(['例','休','國'].map(k=>span(render(),k)).join('|'),first,'late official ledger refresh must not change visible quotas');
ledger={...ledger,ledger:[{date:date(20),kind:'reported',category:'休'}]};
assert.equal(span(render(),'休'),'3/1','confirmed report outside visible dates consumes one quota');
ledger={...ledger,ledger:[{date:date(5),kind:'reported',category:'休'}]};
assert.equal(span(render(),'休'),'3/2','a report already represented by a visible cell must not double-deduct');
ledger={...ledger,ledger:[]};
assert.equal(span(render(1,[date(25)]),'國'),'1/1','typhoon day never counts again as a national date');
for(let n=0;n<83;n++)assert.equal(span(render(n),'國'),'2/0','fixture '+n+' counter is deterministic');
assert(!html.includes('const rest=verified?Math.max(0,ledger.remaining[category])'),
 'renderer must not switch remainder sources when the cloud ledger arrives');

const evidenceSrc=fs.readFileSync('assets/port79-schedule-rest-evidence.js','utf8');
const ec={window:null};ec.window=ec;
ec.P79RestAttendance={build:({now,schedules})=>({complete:true,checkedAt:now,days:{['E1|'+date(6)]:{state:'rest'}},proof:schedules[0].schedule[date(6)]})};
vm.createContext(ec);vm.runInContext(evidenceSrc,ec);
let time=Date.parse('2026-10-30T00:00:00Z'),token='MANAGER',offline=false,shift='休';
const c=ec.P79ScheduleRestEvidence.create({
 token:()=>token,now:()=>time,
 employees:()=>[{id:'E1'}],
 schedules:()=>[{empId:'E1',schedule:{[date(6)]:shift}}],
 timestamp:()=>time,buildShifts:()=>[],leaveDates:()=>[],
 read:async m=>{if(offline)throw Error('temporary offline');return{ok:true,month:m,records:[]}},
 update:()=>{}
});
(async()=>{
 assert.equal((await c.refresh(month)).complete,true);
 offline=true;time+=61000;await c.refresh(month);
 assert.equal(c.status(month).evidence.complete,false,'a failed official read cannot retain verified=true');
 assert(html.includes('if(!state.error)renderRoleScheduleView();'),'the screen preserves its last rendered counts during failed refresh');
 assert.match(c.status(month).error,/temporary offline/);
 shift='早';time+=61000;await c.refresh(month);
 assert.equal(c.status(month).evidence.complete,false,'changed roster cannot reuse an earlier attendance classification');
 offline=false;time+=61000;assert.equal((await c.refresh(month)).complete,true);
 assert.equal(c.status(month).evidence.proof,'早','fresh evidence is calculated with the new roster');
 token='OTHER';
 assert.equal(c.status(month).evidence.complete,false,'another user cannot inherit manager evidence');
 console.log('PASS 83 fixture rosters, stable 例休國 quotas, real declarations outside visible cells, typhoon exclusion, transient cloud refresh, roster revision and identity isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
