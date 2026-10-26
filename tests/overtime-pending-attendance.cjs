const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const hours=fs.readFileSync('work-hours/index.html','utf8');
function fn(name){const a=hours.indexOf('function '+name+'('),b=hours.indexOf('\n        }',a);assert(a>=0&&b>a);return hours.slice(a,b+10);}
const emp={empId:'AP1',attNo:'01',name:'林家奕',dept:'第二事業處',jobTitle:'F/L'},punch={empId:'AP1',attNo:'01',timeStr:'2026/10/19 15:35:00',status:'上班'};
const report={id:'OT1',planned:true,code:'休16-20',declaredHours:4};
const ctx={console,Date,Map,Set,JSON,Math,Number,String,Array,records:[punch],employees:[emp],p79WorkhoursEligibleEmployees:()=>[emp],canCurrentAdminViewEmployee:()=>true,normalizeAdminIds:()=>[],sysConfig:{adminIds:[]},isAdminLoggedIn:true,isCurrentViewerSuperAdmin:()=>true,normalizeAttendanceStatsAttNo:x=>String(x||''),normalizeEmployeeLookupName:x=>x,normalizeScheduleDateKey:x=>String(x||'').replaceAll('/','-'),p79LoadWorkOvertimeMonths(){},p79WorkOvertimeMonths:new Map(),p79MergeWorkOvertimeSnapshot(){},p79EmployeeDateEligible:()=>true,p79OvertimeCalculationCache:null,schedules:[{empId:'AP1',schedule:{__meta:{'2026-10-19':{overtimeReport:report}}}}],buildDailyAttendanceRows:()=>[{empId:'AP1',dateKey:'2026/10/19',clockIn:punch,clockOut:null,sortTime:1}]};
vm.createContext(ctx);vm.runInContext(fn('p79WorkOvertimeOfficialReport'),ctx);vm.runInContext(fn('buildOvertimeStatisticsRows'),ctx);
const rows=ctx.buildOvertimeStatisticsRows();assert.equal(rows.length,1);assert.equal(rows[0].clockIn.timeStr,punch.timeStr);assert.equal(rows[0].clockOut,null);assert.equal(rows[0].overtimeMinutes,0,'no fabricated hours before clock-out');
assert(hours.includes("row.planned&&!row.clockIn?'待出勤'"));assert(hours.includes("row.clockIn?'尚未下班':'待出勤'"));
const app={};app.window=app;vm.runInNewContext(fs.readFileSync('assets/port79-overtime-application.js','utf8'),app);vm.runInNewContext(fs.readFileSync('assets/port79-overtime-monthly-matrix.js','utf8'),app);
const snap={schedules:[{empId:'AP1',schedule:{'2026-10-01':'例','2026-10-02':'休','2026-10-03':'國',__meta:{}}}]};
assert.equal(app.P79OvertimeMonthlyMatrix.leaveCode('休16-24'),'休');assert.equal(app.P79OvertimeMonthlyMatrix.leaveCode('國08-16'),'國');
const model=app.P79OvertimeMonthlyMatrix.build(snap,[emp],'2026-10');assert(!model.issues.some(x=>x.includes('尚未排班')));
const screen=app.P79OvertimeMonthlyMatrix.screen(model,false,{});for(const color of ['FFE4E6','DBEAFE','FEF3C7'])assert(screen.includes('background:#'+color+'!important'));assert(screen.includes('mm-rest-legend'));
assert(!fs.readFileSync('assets/port79-overtime-application.js','utf8').includes('為預排資料，請切換預排申請表'));
for(const m of hours.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS pending clock-in shown without invented duration, distinct rest colors and legend, quiet planned/missing-schedule notices, scripts parse');
// 每日格固定實際時數，換算合計仍獨立使用來源換算欄。
assert.equal(app.P79OvertimeMonthlyMatrix.leaveCode('普通傷病假'),'病');
const actualModel=app.P79OvertimeMonthlyMatrix.build({schedules:[{empId:'AP1',schedule:{'2026-10-04':'普通傷病假',__meta:{'2026-10-11':{overtimeReport:{id:'A',category:'休',overtimeStart:'08',overtimeEnd:'16',convertedHours:12.7,planned:false}}}}}]},[emp],'2026-10');
assert.equal(actualModel.rows[0].actualValues[10],8);assert.equal(actualModel.rows[0].actualValues[3],'病');
const actualHtml=app.P79OvertimeMonthlyMatrix.html(actualModel);assert(/font-weight:700">8<\/td>/.test(actualHtml));assert(!actualHtml.includes('普通傷病假'));
app.P79OvertimeApplication.zip=files=>files;
const xlsx=app.P79OvertimeMonthlyMatrix.excel(actualModel),sheet=xlsx['xl/worksheets/sheet1.xml'];
assert(/r="N8"[^>]*><f>SUMIFS\([^<]*!\$E\$2:[^<]*<\/f><v>8<\/v>/.test(sheet));
assert(sheet.includes('SUMIFS(&#39;申報來源&#39;!$F$2:'));
console.log('PASS one-character sick leave and actual daily hours in screen, print and Excel; converted total retains its own formula');
(async()=>{
 let active=0,peak=0;const pending=[];
 const c={Date,Map,Set,Promise,Intl,AbortController,setTimeout,clearTimeout,encodeURIComponent,document:{getElementById:()=>({dataset:{p79MonthInitialized:'1'},value:'ALL'})},currentPort79SsoToken:()=> 'token',normalizeScheduleDateKey:x=>x,getAttendanceDateKey:x=>x,getActiveGasUrl:()=> 'https://example.invalid',p79WorkOvertimeMonths:new Map(),p79WorkOvertimeLoadLanes:[Promise.resolve(),Promise.resolve(),Promise.resolve()],p79WorkOvertimeLoadQueue:Promise.resolve(),p79WorkOvertimeNextLane:0,p79WorkOvertimeRenderTimer:null,p79OvertimeCalculationCache:null,lastAttendanceCloudRevision:'',p79WorkhoursIsEditing:()=>false,renderOvertimeStats(){},fetch:()=>{active++;peak=Math.max(peak,active);return new Promise(resolve=>pending.push(()=>{active--;resolve({json:async()=>({ok:true,schedules:[],leaveRecords:[]})});}));}};
 vm.createContext(c);vm.runInContext(fn('p79LoadWorkOvertimeMonths'),c);c.p79LoadWorkOvertimeMonths(Array.from({length:6},(_,i)=>({timeStr:'2026-'+String(i+1).padStart(2,'0')+'-01'})));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(active,3);
 for(let round=0;round<2;round++){pending.splice(0).forEach(f=>f());await new Promise(resolve=>setImmediate(resolve));}
 await c.p79WorkOvertimeLoadQueue;assert.equal(peak,3);assert.equal(c.p79WorkOvertimeMonths.size,6);assert([...c.p79WorkOvertimeMonths.values()].every(x=>x.ready&&!x.pending));clearTimeout(c.p79WorkOvertimeRenderTimer);
 console.log('PASS bounded three-month parallel reads and complete roster state');
})().catch(e=>{console.error(e);process.exitCode=1;});
