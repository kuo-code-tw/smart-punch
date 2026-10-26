const fs=require('fs'),vm=require('vm'),a=require('assert/strict'),engine=require('../attendance/v6-engine.js');
const html=fs.readFileSync('attendance/index.html','utf8');
function fn(name){let i=html.indexOf('function '+name+'(');a(i>=0,name);if(html.slice(i-6,i)==='async ')i-=6;return html.slice(i,html.indexOf('\n        }',i)+10);}
const fixtures={'2026-09':[{id:'i',empId:'E',status:'上班簽到',timeStr:'2026/09/30 23:35'}],'2026-10':[{id:'o',empId:'E',status:'下班簽退',timeStr:'2026/10/01 07:45'},{id:'i2',empId:'E',status:'上班簽到',timeStr:'2026/10/15 08:00'},{id:'o2',empId:'E',status:'下班簽退',timeStr:'2026/10/15 16:00'},{id:'i3',empId:'E',status:'上班簽到',timeStr:'2026/10/31 23:35'}],'2026-11':[{id:'o3',empId:'E',status:'下班簽退',timeStr:'2026/11/01 07:45'}]};
function setup(){let token='T',network=0,builds=0;
 const c={Date,Intl,URL,console,window:{P79AttendanceV6:{buildShifts:rows=>{builds++;return engine.buildShifts(rows)}}},getActiveGasUrl:()=> 'https://example.invalid/',getAttendanceEmployeeMasterToken:()=>token,getTodayAttendanceIso:()=> '2026-12-01',normalizeAttendanceRecordIdentifiers:r=>r,getAttendanceDateKey:t=>engine.normalizeTime(t).split(' ')[0],shiftAttendanceMonthKey:(m,n)=>{const d=new Date(Number(m.slice(0,4)),Number(m.slice(5))-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')},fetchGasJsonWithRetry:async url=>{network++;const month=new URL(url).searchParams.get('month');return {ok:true,month,records:fixtures[month]||[]}}};
 vm.createContext(c);for(const name of ['p79ReadAttendanceExportSource','p79ReadAttendanceExportMonth','p79ReadAttendanceExportScope','p79SelectAttendanceExportShifts'])vm.runInContext(fn(name),c);
 return {c,network:()=>network,builds:()=>builds,change:()=>{token='OTHER'}};
}
(async()=>{
 let x=setup(),sources=[];const scope=await x.c.p79ReadAttendanceExportScope('2026-10',{sources});a.equal(x.network(),3,'always read month and boundary months from cloud');a.equal(x.builds(),1);a.equal(sources.length,3);a(sources.every(s=>s.source==='雲端讀取'));
 const selected=x.c.p79SelectAttendanceExportShifts(scope.source,'2026-10','2026-10-01','2026-10-31',scope.shifts);a.deepEqual(Array.from(selected,r=>r.id).sort(),['i2','i3','o2','o3']);a.equal(x.builds(),1);
 x=setup();await x.c.p79ReadAttendanceExportScope('2026-10',{preferCache:true});a.equal(x.network(),3,'obsolete preferCache input must not change cloud-only reads');
 x=setup();const narrow=await x.c.p79ReadAttendanceExportScope('2026-10',{start:'2026-10-15',end:'2026-10-15'});a.equal(x.network(),1);a.deepEqual(Array.from(x.c.p79SelectAttendanceExportShifts(narrow.source,'2026-10','2026-10-15','2026-10-15',narrow.shifts),r=>r.id),['i2','o2']);
 x=setup();const original=x.c.fetchGasJsonWithRetry;x.c.fetchGasJsonWithRetry=async(...args)=>{const data=await original(...args);x.change();return data};await a.rejects(x.c.p79ReadAttendanceExportMonth('2026-10'),/登入狀態/);
 x=setup();x.c.fetchGasJsonWithRetry=async()=>{throw Error('offline')};await a.rejects(x.c.p79ReadAttendanceExportScope('2026-10'),/offline/);
 a(!html.includes('exportPreferCache'));a(!html.includes('Port79DataCache'));a(html.includes("'雲端資料讀取時間'"));
 console.log('PASS cloud-only export, boundary month, no stale cache, one pairing pass, token guard and offline failure');
})().catch(e=>{console.error(e);process.exitCode=1});
