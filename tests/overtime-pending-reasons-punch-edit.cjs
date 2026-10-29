'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');
function extract(name){
 const a=html.indexOf('function '+name+'('),b=html.indexOf('\n        }',a);
 assert(a>=0&&b>a,'Expected function '+name);return html.slice(a,b+10);
}
const c={console,Number,String,Array,Date,Map,Set,
 records:[],currentEmp:{empId:'ADMIN'},canPerformAdminAction:()=>true,
 encodeURIComponent,
 formatEditableAttendanceTimeCell:(record,type,canEdit)=>canEdit?'EDIT_'+type+'_'+record.timeStr:record.timeStr,
 getAttendanceRecordType:r=>String(r.status||'').includes('上班')?'IN':'OUT',
 p79DirectAttendanceTimestamp:r=>Date.parse(String(r.timeStr||'').replaceAll('/','-').replace(' ','T').replace(/^(.*:\\d\\d)$/, '$1:00')+'+08:00')};
vm.createContext(c);
vm.runInContext(extract('p79FindPlannedAttendanceEditRecord'),c);
vm.runInContext(extract('p79OvertimePendingReason'),c);
vm.runInContext(extract('p79OvertimePendingPunchCell'),c);
const now='2026-10-28',base={empId:'E1',dateKey:'2026-10-28',overtimeReport:{planned:true,id:'P123'},reportVerified:true};
const IN={id:'IN123',empId:'E1',status:'上班簽到',timeStr:'2026/10/28 08:05:00'},OUT={id:'OUT123',empId:'E1',status:'下班簽退',timeStr:'2026/10/28 16:02:00'};
const reason=row=>c.p79OvertimePendingReason(row,now);
assert.equal(reason({...base,p79RestDraft:true}).code,'unsent','an unsent future suggestion must not be called an abnormal punch');
assert.equal(reason({...base,dateKey:'2026-10-29'}).code,'scheduled','future saved preplan has ID but no work evidence');
assert.equal(reason(base).code,'both-missing','past or today with no punches requires attendance verification');
assert.equal(reason({...base,clockOut:OUT}).code,'in-missing');
assert.equal(reason({...base,clockIn:IN}).code,'not-out-yet','on current date single punch is not presumed abnormal');
assert.equal(reason({...base,dateKey:'2026-10-27',clockIn:IN}).code,'out-missing','yesterday has missing clock-out');
assert.equal(reason({...base,clockIn:IN,clockOut:OUT,attendanceIssue:'原始區間異常'}).code,'abnormal');
assert.equal(reason({...base,clockIn:IN,clockOut:OUT}).code,'review','both punches + verified saved planned report awaits explicit confirmation');
assert.equal(reason({...base,clockIn:IN,clockOut:OUT,overtimeReport:{planned:true}}).code,'unsent','full punch without saved report is not an approved filing');
assert.equal(reason({...base,clockIn:IN,clockOut:OUT,reportVerified:false}).code,'report-issue','unknown ID is a cloud report issue');
const punch=(row,type)=>c.p79OvertimePendingPunchCell(row,type,now);
assert.match(punch(base,'IN'),/補登上班/,'past missing IN should offer attendance creation');
assert.match(punch(base,'OUT'),/補登下班/,'past missing OUT should offer attendance creation');
assert.match(punch(base,'IN'),/p79OpenPlannedMissingPunchEditor/,'missing punch stays in the planned dialog while using the established manual card add form');
assert(!punch({...base,dateKey:'2026-10-29'},'IN').includes('補登'),'future planning must never create imaginary attendance');
c.records=[IN,OUT];
assert.match(punch({...base,clockIn:IN},'IN'),/EDIT_IN/,'existing unique IN is editable');
assert.match(punch({...base,clockOut:OUT},'OUT'),/EDIT_OUT/,'existing unique OUT is editable');
c.records=[IN,{...IN}];
assert.doesNotMatch(punch({...base,clockIn:IN},'IN'),/EDIT_IN/,'ambiguous local duplicate IDs are not editable');
c.records=[IN,OUT];c.canPerformAdminAction=()=>false;
assert.doesNotMatch(punch({...base,clockIn:IN},'IN'),/EDIT_IN/,'no edit permission');
assert.doesNotMatch(punch(base,'IN'),/p79OpenPlannedMissingPunchEditor/,'no punch add permission');
assert(html.includes('上班時間（實際打卡）')&&html.includes('下班時間（實際打卡）'),'clearly labeled actual timestamps');
assert(html.includes('p79OvertimePendingPunchCell(row,\'IN\',todayKey,index)')&&html.includes('p79OvertimePendingPunchCell(row,\'OUT\',todayKey,index)'),'both time columns reference the visible row index for safe editing');
assert(html.includes('p79OvertimePendingReason(row,todayKey)'),'cause displayed per row');
for(const tag of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(tag[1].trim())new vm.Script(tag[1]);
console.log('PASS precise pending causes, no fake future punches, correction via existing edit/add workflows and permission checks');
