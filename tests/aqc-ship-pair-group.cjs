'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const engine=fs.readFileSync(path.join(root,'assets/port79-aqc-concurrent.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'assets/port79-aqc-multi-rod.js'),'utf8');
const html=fs.readFileSync(path.join(root,'aqc-efficiency/index.html'),'utf8');
const ctx={window:{},Date,Intl,console};
vm.createContext(ctx);vm.runInContext(engine,ctx);
const {index,compute,groupSegments}=ctx.window.P79AqcConcurrent;
assert.equal(typeof groupSegments,'function','UI needs the grouping function');
const make=(vessel,workingNo,voyageE,aqcs)=>({vessel,workingNo,voyageE,aqcs:aqcs.map(([number,commence,complete])=>({number,commence,complete}))});
const masters=[
 make('WAN HAI 316','5260176','S254',[
  ['8002','2026-10-13T03:23:00.000Z','2026-10-14T00:42:00.000Z'],
  ['8003','2026-10-13T03:27:00.000Z','2026-10-14T02:30:00.000Z'],
  ['8005','2026-10-13T03:32:59.999Z','2026-10-13T07:46:59.999Z']]),
 make('WAN HAI 292','5260177','S073',[
  ['7902','2026-10-13T05:54:59.999Z','2026-10-14T00:10:00.000Z'],
  ['7903','2026-10-13T05:56:00.000Z','2026-10-14T00:04:59.999Z'],
  ['7905','2026-10-13T08:36:00.000Z','2026-10-13T19:01:59.999Z']])
];
const idx=index([],masters,Date.parse('2026-10-28T12:00:00Z'));
const whole=compute(idx,[],{date:'2026-10-13',mode:'month',min:4,capacity:4});
const originalIntervals=whole.rows.map(r=>[r.start,r.end,r.totalRods]);
assert.equal(whole.rows.length,5,'five source change intervals shown in screenshot');
assert.deepEqual(whole.rows.map(r=>r.totalRods).join(','),'4,5,4,5,4');
const combined=groupSegments(whole.rows);
assert.equal(combined.length,1,'same two vessels must yield exactly one main record');
const job=combined[0];
assert.equal(job.start,'2026-10-13T13:54');
assert.equal(job.end,'2026-10-14T08:04');
assert.equal(job.segments.length,5,'all crane changes must remain auditable');
assert.equal(job.totalRods,5,'peak source count preserved, not silently clamped to four');
assert.equal(job.capacityConflict,true);
assert.equal(job.needsReview,true,'never confirm five actively moving cranes');
assert.equal(job.shipCount,2);
assert.deepEqual([...job.ships.map(s=>s.workingNo)].sort().join(','),'5260176,5260177');
assert.equal(job.ships.find(s=>s.workingNo==='5260176').rods,3);
assert.equal(job.ships.find(s=>s.workingNo==='5260177').rods,3);
assert.ok(!job.ships.some(s=>s.rods===5),'do not assign five rods to one vessel');
assert.deepEqual(whole.rows.map(r=>[r.start,r.end,r.totalRods]),originalIntervals,'source segments unchanged');
assert.equal(job.segments.filter(r=>r.capacityConflict).length,2,'two 5-rod source anomaly windows retained');
assert.ok(job.segments.every(x=>x._end>x._start),'valid original intervals');
const fake=(start,end,ships)=>({_start:start,_end:end,start:'2026-10-13T10:00',end:'2026-10-13T11:00',
 date:'2026-10-13',totalRods:4,sourceOverlapRods:4,verifiedRods:4,durationMinutes:(end-start)/60000,
 capacityConflict:false,needsReview:false,displayRods:4,ships});
const a={ship:'A',voyage:'S1',workingNo:'101',rods:2,aqcNumbers:['7901','7902'],evidence:[]};
const b={ship:'B',voyage:'S2',workingNo:'102',rods:2,aqcNumbers:['7903','7905'],evidence:[]};
const c={ship:'C',voyage:'S3',workingNo:'103',rods:2,aqcNumbers:['8002','8003'],evidence:[]};
const basic=[fake(0,60000,[a,b]),fake(60000,120000,[b,a]),fake(180000,240000,[a,b]),fake(240000,300000,[a,c])];
const grouped=groupSegments(basic);
assert.equal(grouped.length,3,'gap and changed vessel pair must split distinct jobs');
assert.equal(grouped[0].segments.length,2,'ship display ordering cannot create duplicates');
assert.equal(grouped[1].segments.length,1,'gap starts a new job');
assert.equal(grouped[2].segments.length,1,'different ship cannot join earlier operation');
const differentVoyage=groupSegments([fake(0,60000,[a,b]),fake(60000,120000,[{...a,voyage:'S99'},b])]);
assert.equal(differentVoyage.length,2,'same ship name but different voyage is not the same job');
assert.match(ui,/groupSegments\(result\.rows\)/,'display and export should consolidate using same rules');
assert.match(ui,/groupOfSegment/,'daily summary counts unique groups');
assert.match(ui,/時段變化核對/,'export includes traceable original intervals');
assert.match(ui,/group\.segments/,'export traceability requires original intervals');
assert.match(ui,/同組船舶作業的桿數變化/,'detail provides original change timeline');
assert.match(ui,/期間來源最多/,'per-vessel peak is labeled as historical source evidence');
assert.ok(ui.includes("const totalText='來源峰值 '+esc(r.totalRods)+' 桿'"),'main AQC peak count uses 桿');
assert.ok(ui.includes("'來源峰值 '+esc(x.totalRods)+' 桿'"),'source preview uses 桿');
assert.ok(ui.includes("'來源該船桿數','來源合計桿數'"),'audit Excel column names use 桿');
assert.ok(!ui.includes('支'),'all AQC quantity unit text uses 桿 rather than 支');
assert.match(html,/20261028-ship-pair-groups-v8/,'browser loads new UI and engine');
assert.match(html,/p79-aqc-multi-rod-table-compact-20261028/,'previous compact/centered layout retained');
console.log('PASS AQC real Oct 13 ship pair: 5 source intervals -> 1 job; peak/evidence, gaps, voyages and Excel accounting');
