const fs=require('fs'),vm=require('vm'),a=require('assert/strict'),engine=require('../attendance/v6-engine.js');
const html=fs.readFileSync('attendance/index.html','utf8');
function fn(name){let i=html.indexOf('function '+name+'(');a(i>=0,name);if(html.slice(i-6,i)==='async ')i-=6;return html.slice(i,html.indexOf('\n        }',i)+10);}
const fixtures={'2026-09':[{id:'i',empId:'E',status:'上班簽到',timeStr:'2026/09/30 23:35'}],'2026-10':[{id:'o',empId:'E',status:'下班簽退',timeStr:'2026/10/01 07:45'},{id:'i2',empId:'E',status:'上班簽到',timeStr:'2026/10/15 08:00'},{id:'o2',empId:'E',status:'下班簽退',timeStr:'2026/10/15 16:00'},{id:'i3',empId:'E',status:'上班簽到',timeStr:'2026/10/31 23:35'}],'2026-11':[{id:'o3',empId:'E',status:'下班簽退',timeStr:'2026/11/01 07:45'}]};
function setup(){let token='T',viewer='A@admin',network=0,builds=0;const saved=[],hits=new Map(Object.entries(fixtures).map(([month,records])=>[month,{data:{ok:true,month,records},savedAt:1234}]));
 const cache={viewerKey:()=>viewer,getExportSnapshot:async(action,month)=>action==='getAttendanceMonthRaw'?hits.get(month)||null:null,storeExportSnapshot:async(...args)=>saved.push(args)};
 const c={Date,Intl,URL,console,window:{Port79DataCache:cache,P79AttendanceV6:{buildShifts:rows=>{builds++;return engine.buildShifts(rows)}}},getActiveGasUrl:()=> 'https://example.invalid/',getAttendanceEmployeeMasterToken:()=>token,getTodayAttendanceIso:()=> '2026-12-01',normalizeAttendanceRecordIdentifiers:r=>r,getAttendanceDateKey:t=>engine.normalizeTime(t).split(' ')[0],shiftAttendanceMonthKey:(m,n)=>{const d=new Date(Number(m.slice(0,4)),Number(m.slice(5))-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')},fetchGasJsonWithRetry:async url=>{network++;const month=new URL(url).searchParams.get('month');return {ok:true,month,records:fixtures[month]||[]}}};
 vm.createContext(c);for(const name of ['p79ReadAttendanceExportSource','p79ReadAttendanceExportMonth','p79ReadAttendanceExportScope','p79SelectAttendanceExportShifts'])vm.runInContext(fn(name),c);
 return {c,hits,saved,cache,network:()=>network,builds:()=>builds,change:()=>{token='OTHER';viewer='B@admin'}};
}
(async()=>{
 let x=setup(),sources=[];const scope=await x.c.p79ReadAttendanceExportScope('2026-10',{preferCache:true,sources});a.equal(x.network(),0,'complete cache does not wait for any month cloud request');a.equal(x.builds(),1);a.equal(sources.length,3);a(sources.every(s=>s.source==='本機快取'&&s.savedAt===1234));
 const selected=x.c.p79SelectAttendanceExportShifts(scope.source,'2026-10','2026-10-01','2026-10-31',scope.shifts);a.deepEqual(Array.from(selected,r=>r.id).sort(),['i2','i3','o2','o3']);a.equal(x.builds(),1,'date filtering does not rebuild attendance pairs');
 x=setup();x.hits.delete('2026-11');await x.c.p79ReadAttendanceExportScope('2026-10',{preferCache:true});a.equal(x.network(),1,'only missing boundary month fetched');a.equal(x.saved.length,1);
 x=setup();await x.c.p79ReadAttendanceExportScope('2026-10',{preferCache:false});a.equal(x.network(),3,'latest cloud option bypasses all cache');
 x=setup();const narrow=await x.c.p79ReadAttendanceExportScope('2026-10',{preferCache:false,start:'2026-10-15',end:'2026-10-15'});a.equal(x.network(),1,'middle-of-month range does not download adjacent months');a.deepEqual(Array.from(x.c.p79SelectAttendanceExportShifts(narrow.source,'2026-10','2026-10-15','2026-10-15',narrow.shifts),r=>r.id),['i2','o2']);
 x=setup();const original=x.cache.getExportSnapshot;x.cache.getExportSnapshot=async(...args)=>{const result=await original(...args);x.change();return result};await a.rejects(x.c.p79ReadAttendanceExportMonth('2026-10',{preferCache:true}),/登入狀態/);
 x=setup();x.hits.clear();x.c.fetchGasJsonWithRetry=async()=>{throw Error('offline')};await a.rejects(x.c.p79ReadAttendanceExportScope('2026-10',{preferCache:true}),/offline/);
 a(html.includes('id="exportPreferCache" type="checkbox" checked'));a(html.includes("'資料來源與快取時間'"));
 console.log('PASS cached export has zero cloud reads, missing-month fallback, explicit latest mode, single pairing pass, cross-month output, account changes and failed network');
})().catch(e=>{console.error(e);process.exitCode=1});
