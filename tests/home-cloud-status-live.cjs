'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/port79-home-cloud-status.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const styles=fs.readFileSync(path.join(root,'assets/port79-home-original-shell.css'),'utf8');
assert.doesNotThrow(()=>new Function(source));
assert.match(html,/port79-home-cloud-status\.js\?v=20261117-live-cloud-v1/);
assert.match(source,/action=getCloudActivity/,'must use the same cloud activity backend as other systems');
assert.match(source,/setInterval\(poll,15000\)/,'must poll real state every 15 seconds');
assert.match(source,/getFolderSyncStatus/,'computer sync must be real, not simulated');
assert(!source.includes("label='可使用'"),'cloud state may not be a fixed permission indicator');
for(const k of ['busy','done','error','idle','offline']){
 assert(styles.includes('[data-state="'+k+'"]'),'state '+k+' must have visible styling');
}
function fn(name){
 const begin=source.indexOf('function '+name+'('),end=source.indexOf('\n}',begin);
 assert(begin>=0&&end>begin,'missing '+name);return source.slice(begin,end+2);
}
function chip(name){
 const span={textContent:'準備中'};
 const title={textContent:name};
 const a={dataset:{},title:'',attrs:{},setAttribute(k,v){this.attrs[k]=v},
  querySelector(k){return k==='.p79-sys-state'?span:k==='b'?title:null}};
 return {node:a,span};
}
const chips=Object.fromEntries(['attendance','workhours','leave','schedule','efficiency','hr','history'].map(k=>[k,chip(k)]));
const ctx={
 keys:Object.keys(chips),window:{P79Messages:{operation:v=>v}},
 currentNode:key=>chips[key]?.node||null,
 lastValid:false
};
const renderer=new Function('ctx','with(ctx){'+fn('describe')+'\n'+fn('updateChip')+'\n'+fn('render')+'\nreturn render;}')(ctx);
assert.equal(renderer({ok:false}),false);
assert.equal(chips.attendance.span.textContent,'準備中','no fake status before actual data');
assert.equal(renderer({ok:true,systems:{
 attendance:{active:[{operation:'read',action:'getAttendance'}]},
 schedule:{active:[{operation:'read',action:'getSchedule'},{operation:'write',action:'saveSchedule'}]},
 leave:{lastCompleted:{ok:true,ageMs:1000,action:'saveLeave'}},
 efficiency:{lastCompleted:{ok:false,ageMs:2000,action:'saveVessel',error:'失敗'}},
 hr:{active:[]},
 history:{lastCompleted:{ok:true,ageMs:30000,action:'oldHistory'}}
}}),true);
assert.equal(chips.attendance.node.dataset.state,'busy');
assert.equal(chips.attendance.node.dataset.operation,'read');
assert.equal(chips.attendance.span.textContent,'讀取中');
assert.equal(chips.schedule.node.dataset.state,'busy');
assert.equal(chips.schedule.node.dataset.operation,'write','writes must take priority over reads');
assert.equal(chips.schedule.span.textContent,'寫入中');
assert.equal(chips.leave.node.dataset.state,'done');
assert.equal(chips.leave.span.textContent,'工作完成');
assert.equal(chips.efficiency.node.dataset.state,'error');
assert.equal(chips.efficiency.span.textContent,'工作失敗');
assert.equal(chips.hr.node.dataset.state,'idle');
assert.equal(chips.hr.span.textContent,'待命');
assert.equal(chips.history.node.dataset.state,'idle','expired completed job must not glow forever');
assert.equal(chips.workhours.span.textContent,'被動待命','unreported workhours remain passive, not falsely busy');
assert(chips.schedule.node.title.includes('saveSchedule'),'details must come from actual jobs');
console.log('PASS real cloud read/write/done/error/idle/passive statuses and computer sync wiring');
