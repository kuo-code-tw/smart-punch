const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('assets/port79-missing-punch-login-preview.js','utf8');
const context={window:{},document:{readyState:'loading',addEventListener(){}},Date,URL,Map,Set,Promise,setTimeout:fn=>fn()};vm.createContext(context);vm.runInContext(source,context);const api=context.window.P79MissingPunchSearch;
const day='2026-10-20',now=Date.parse('2026-10-21T09:00:00+08:00');
const row=(emp,label,clockIn='',clockOut='',date=day)=>[date,'1',emp,'員工'+emp,'測試部門','AQC',label,clockIn,clockOut,'',''];
const input=day+' 08:00:00',output=day+' 16:00:00';
const daily=[[],row('A','早',input,output),row('B','早','',output),row('C','早',input),row('D','早'),row('E','休'),row('F','年'),row('G','國'),row('H','晚','2026/10/21 00:05:00','2026/10/21 08:05:00'),row('I','休16-24')];
const logs=[{id:'L1',empId:'B',role:'employee',action:'LOGIN',timeStr:'2026/10/20 07:50:00'},{id:'L2',empId:'C',action:'LOGOUT',timeStr:'2026-10-20 16:15:00'},{id:'L3',empId:'D',role:'admin',action:'LOGIN',timeStr:input},{id:'L4',empId:'OTHER',action:'LOGIN',timeStr:input}];
const before=JSON.stringify(daily),rows=api.missingRows(daily,logs,day,day,now);assert.deepEqual(Array.from(rows,r=>r.empId),['B','C','D','I']);assert.deepEqual(Array.from(rows,r=>r.kind),['IN','OUT','BOTH','BOTH']);assert.equal(rows[0].logs.length,1);assert.equal(rows[1].logs.length,1);assert.equal(rows[2].logs.length,0);assert.equal(JSON.stringify(daily),before,'no source mutation');
assert.equal(api.filterRows(rows,'員工b','').length,1);assert.equal(api.filterRows(rows,'','BOTH').length,2);assert.equal(api.filterRows(rows,'aqc','IN').length,1);
assert.equal(api.timestamp('2026/10/20 08:00'),api.timestamp('2026-10-20 08:00:00'));assert(Number.isNaN(api.timestamp('2026-10-20')));
const overnight=api.shiftWindow(day,'晚');assert.equal(overnight.end,Date.parse('2026-10-21T08:00:00+08:00'));
assert.equal(api.missingRows([[],row('N','晚','2026/10/21 00:03:00')],[],day,day,Date.parse('2026-10-21T06:00:00+08:00')).length,0,'active overnight shift is not missing OUT');
assert.equal(api.missingRows([[],row('N','晚')],[],day,day,Date.parse('2026-10-21T06:00:00+08:00')).length,0,'active no-card shift is not a completed-day gap');
assert.equal(api.missingRows([[],row('N','晚','2026/10/21 00:03:00')],[],day,day,now)[0].kind,'OUT');
assert.equal(api.missingRows([[],row('X','','2026/10/21 08:00:00','', '2026-10-21')],[],day,'2026-10-21',now).length,0,'unknown current shift cannot be called missed OUT');
assert.equal(api.missingRows([[],row('X','早','','','2026-10-22')],[],day,'2026-10-22',now).length,0,'future no-card date excluded');
assert.equal(api.candidates([{empId:'N',action:'LOGIN',timeStr:'2026/10/21 00:01'},{empId:'N',action:'LOGOUT',timeStr:'2026/10/21 08:03'},{empId:'N',action:'LOGIN',timeStr:'2026/10/20 08:00'}],'N',day,'晚').length,2);
assert.equal(api.dateRange('2026-09-30','2026-10-01').length,2);assert.throws(()=>api.dateRange('2026-02-30','2026-03-01'));assert.throws(()=>api.dateRange('2026-09-01','2026-10-02'),/31天/);
function setup(){let token='T';const reads=[];Object.assign(context,{hasAuthoritativeAdminSession:()=>true,isVerifiedSuperAdminSession:()=>true,getAttendanceEmployeeMasterToken:()=>token,getActiveGasUrl:()=> 'https://fixture.invalid/exec',getAdminAttendanceEmployees:()=>[{empId:'B'}],canCurrentAdminViewDataRow:r=>r.empId==='B',p79ReadAttendanceExportScope:async m=>{reads.push('attendance:'+m);return{source:[{empId:'B'},{empId:'OTHER'}]}},p79ReadAttendanceExportSource:async(a,m)=>{reads.push(a+':'+m);return{schedules:[]}},p79BuildScheduleAttendanceExport:(m,p,s)=>{assert.equal(s.length,1);return{dailyRows:[[],row('B','早','',output)]}},fetchGasJsonWithRetry:async url=>{assert.equal(new URL(url).searchParams.get('token'),'T');return{ok:true,sessionLogs:logs}}});return{reads,token:t=>token=t};}
(async()=>{let t=setup();let result=await api.load(day,day);assert.equal(result.rows.length,1);assert.equal(result.logsAvailable,true);assert.equal(t.reads.length,2);t.token('OTHER');assert.throws(()=>result.assertCurrent(),/登入身分/);
 t=setup();context.fetchGasJsonWithRetry=async()=>{throw Error('offline')};result=await api.load(day,day);assert.equal(result.logsAvailable,false);assert.equal(result.rows.length,1,'unavailable logs do not invent a complete punch or hide missing records');
 // A one-day search must not ask the export scope to load an unrelated month.
 t=setup();let scopeOptions,rosterOptions;
 context.p79ReadAttendanceExportScope=async(month,opts)=>{scopeOptions={month,...opts};return{source:[{empId:'B'}]};};
 context.p79ReadAttendanceExportSource=async(action,month,opts)=>{rosterOptions={action,month,...opts};return{schedules:[]};};
 result=await api.load(day,day);
 assert.equal(scopeOptions.start,day);assert.equal(scopeOptions.end,day);
 assert.equal(scopeOptions.preferCache,false);
 assert.equal(rosterOptions.preferCache,false,'fresh official roster is mandatory');
 // A temporary 'not fully loaded' reply retries exactly once without inventing empty results.
 t=setup();let retries=0;
 context.p79ReadAttendanceExportScope=async()=>{retries++;if(retries===1)throw Error('畫面資料尚未完整載入，請重新讀取後再操作');return{source:[{empId:'B'}]};};
 result=await api.load(day,day);assert.equal(result.rows.length,1);assert.equal(retries,2);
 // A persistent readiness error reports the exact failed source and does not claim no gaps.
 t=setup();retries=0;
 context.p79ReadAttendanceExportScope=async()=>{retries++;throw Error('畫面資料尚未完整載入，請重新讀取後再操作');};
 await assert.rejects(api.load(day,day),/正式考勤讀取未完成：畫面資料尚未完整載入/);
 assert.equal(retries,2,'bounded one retry only');
 // A roster error must identify roster, not attendance, for operator triage.
 t=setup();context.p79ReadAttendanceExportSource=async()=>{throw Error('排班資料未就緒');};
 await assert.rejects(api.load(day,day),/正式排班讀取未完成：排班資料未就緒/);
 // Empty staff identity must be considered incomplete, never '0 missing punches'.
 t=setup();context.getAdminAttendanceEmployees=()=>[];
 await assert.rejects(api.load(day,day),/員工主檔尚未完成載入/);

 t=setup();context.p79ReadAttendanceExportScope=async()=>{throw Error('incomplete attendance')};await assert.rejects(api.load(day,day),/incomplete attendance/);
 t=setup();context.fetchGasJsonWithRetry=async()=>{t.token('OTHER');return{ok:true,sessionLogs:logs}};await assert.rejects(api.load(day,day),/登入身分/);
 t=setup();context.hasAuthoritativeAdminSession=()=>false;await assert.rejects(api.load(day,day),/管理帳號/);assert.equal(t.reads.length,0);
 console.log('PASS missing-punch search: IN/OUT/both, complete/rest/leave/future exclusions, active and overnight shifts, candidate identity/admin/time bounds, partial filters, valid ranges, fresh scoped reads, read failures, session changes and no source writes');
})().catch(e=>{console.error(e);process.exit(1)});
