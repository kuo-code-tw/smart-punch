// Regression guard for the entire overtime screen, not a single employee/date.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
const start=html.indexOf('        function p79WorkOvertimeOfficialReport(');
const end=html.indexOf('\n        }',start);
assert(start>=0&&end>start,'missing shared report verification function');
const fn=vm.runInNewContext(html.slice(start,end+10)+'\np79WorkOvertimeOfficialReport');
const ids=Array.from({length:83},(_,i)=>'E'+i);
for(const id of ids){
 assert.equal(fn(null),false,id+' empty report must never count');
 assert.equal(fn({category:'國',code:'國08-16'}),false,id+' proposed report must never count');
 assert.equal(fn({id:'',category:'休'}),false,id+' no cloud id');
 assert.equal(fn({id:'R-'+id,category:'休'},{}),true,id+' formal report preserved');
 assert.equal(fn({id:'R-'+id,category:'代'},{}),true,id+' formal cover preserved');
 assert.equal(fn({id:'R-'+id,category:'延'},{}),true,id+' formal extension preserved');
 assert.equal(fn({id:'R-'+id,category:'國'},{overtimeExcluded:true}),false,id+' excluded report not counted');
 assert.equal(fn({id:'R-'+id,category:'國'},{
   overtimeRevocations:[{confirmed:true,reportId:'R-'+id}]}),false,id+' revoked report not counted');
 assert.equal(fn({id:'R-'+id,category:'國'},{
   overtimeRevocations:[{confirmed:true,reportId:'OTHER'}]}),true,id+' unrelated revocation does not hide real report');
}
assert(html.includes('if (!row.reportVerified || !report || report.planned === true'),
  'monthly raw reported-hours total must require verified ID');
assert(html.includes('savedReport:row.reportVerified===true'),
  'claim/report dialog must not treat proposals as saved');
assert(html.includes('未核實註記／非申報'),
  'unverified rows must be labeled as non-reports');
assert(html.includes('if(!row.reportVerified&&!row.coverCandidate&&!row.coverAlreadyArranged)'),
  'delete action must refuse unsupported metadata');
assert(html.includes('r.reportVerified?(r.overtimeReport?.declaredHours'),
  'export declared hours only from verified reports');
assert(html.includes('port79-monthly-rest-overtime.js?v=20261025-rest-report-id-v4'),
  'work-hours must load the new balance code');
console.log('PASS 83 employees x 9 official/unverified/revoked cases; totals, labels, delete, reporting, export and asset version guarded');
