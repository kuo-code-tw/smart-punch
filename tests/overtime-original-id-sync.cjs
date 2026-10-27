const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const files=['assets/port79-overtime-report.js','assets/port79-overtime-shift-match.js','assets/port79-overtime-period-sync.js'];
const date='2026-10-27',base=Date.parse(date+'T00:00:00+08:00'),at=(h,m=0)=>base+(h*60+m)*60000;
const old={id:'OT-450',category:'休',code:'休16-24',typeName:'休息日加班',declaredHours:8,convertedHours:12.7,overtimeStart:'16',overtimeEnd:'24',createdBy:'MANAGER',createdAt:'2026-10-26T00:00:00Z',note:'高雄港',planned:true};
let revision=1,postCount=0,getCount=0;const ledger={...old};
const mock={console,Date,Map,Set,Promise,JSON,Math,Number,String,Array,Intl,AbortController,setTimeout,clearTimeout,CustomEvent:class{constructor(type,opt){this.type=type;this.detail=opt.detail}}};
mock.window=mock;mock.localStorage={setItem(){}};
mock.dispatchEvent=()=>{};
mock.fetch=async (url,request={})=>{
 const body=request.method==='POST'?JSON.parse(request.body):null;
 if(body){
  postCount++;
  assert.equal(body.action,'saveOvertimeReportDirect');
  assert.equal(body.id,old.id,'must preserve original report identity');
  assert.equal(body.replaceReportId,old.id,'must update the same report, never add a second report');
  assert.equal(body.expectedRevision,revision,'concurrent cloud writes must be guarded');
  assert.equal(body.planned,false,'complete punches are not a future planned shift');
  assert.equal(body.attendanceInId,'IN450');assert.equal(body.attendanceOutId,'OUT450');
  assert.equal(body.code,'休08-16');assert.equal(body.category,'休');
  ledger.code=body.code;ledger.overtimeStart='08';ledger.overtimeEnd='16';ledger.planned=false;
  revision++;
  return {ok:true,json:async()=>({ok:true,id:old.id,directOvertimeSaved:true,report:{...ledger},revision})};
 }
 assert(url.includes('action=getOvertimeReportContext'));
 getCount++;
 return {ok:true,json:async()=>({ok:true,revision,schedules:[{empId:'450',schedule:{[date]:'休',__meta:{[date]:{reportOriginalShift:'中',overtimeReport:{...ledger},note:'高雄港'}}}}],records:[]})};
};
vm.createContext(mock);for(const file of files)vm.runInContext(fs.readFileSync(file,'utf8'),mock);
const rules=mock.P79Overtime.defaults();
const review=mock.P79OvertimeShiftMatch.resolve({date,rules,report:old,roster:{[date]:'休',__meta:{[date]:{reportOriginalShift:'中'}}},start:at(7,41),end:at(15,48),attendanceIssue:false});
assert.equal(review.state,'completed');assert.equal(review.confirmed,true);assert.equal(review.code,'休08-16');
const input={date,empId:'450',report:old,review,rules,inId:'IN450',outId:'OUT450',token:'token',url:'https://example.invalid'};
(async()=>{
 assert.equal(mock.P79OvertimePeriodSync.plan({...input,review:{...review,confirmed:false}}),null,'one punch or unverified pair cannot amend cloud');
 assert.equal(mock.P79OvertimePeriodSync.plan({...input,report:{...old,approvedBy:'BOSS'}}),null,'legacy endpoint cannot erase approval history');
 assert.equal(mock.P79OvertimePeriodSync.plan({...input,report:{...old,declaredHours:4}}),null,'hours must not be changed');
 assert.equal(mock.P79OvertimePeriodSync.plan({...input,outId:''}),null,'both recorded punch identities are required');
 const first=await mock.P79OvertimePeriodSync.sync(input);
 assert.equal(first.ok,true,JSON.stringify(first));
 assert.equal(postCount,1,'one update, no new report');
 assert.equal(ledger.id,old.id);assert.equal(ledger.declaredHours,8);assert.equal(ledger.convertedHours,12.7);
 assert.equal(ledger.createdBy,old.createdBy);assert.equal(ledger.createdAt,old.createdAt);
 await mock.P79OvertimePeriodSync.sync(input);
 assert.equal(postCount,1,'repeated rendering never duplicates a write');
 assert(getCount>=2,'cloud reread must verify persisted report');
 const attendance=fs.readFileSync('attendance/index.html','utf8'),work=fs.readFileSync('work-hours/index.html','utf8');
 for(const html of [attendance,work]){
  assert(html.includes('port79-overtime-period-sync.js?v='),'every relevant screen loads shared sync');
  assert(html.includes('P79OvertimePeriodSync.sync('),'every relevant screen invokes sync for confirmed punch');
 }
 assert(attendance.includes('暫估／未簽退'));
 assert(work.includes('p79QueueConfirmedRosterRecheck('));
 console.log('PASS same-ID overtime correction, cloud revision/readback, no duplicate, no partial-punch write, no approval loss, attendance/workhours linkage');
})().catch(e=>{console.error(e);process.exitCode=1});
