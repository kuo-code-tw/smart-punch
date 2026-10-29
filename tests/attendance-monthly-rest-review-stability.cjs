'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-attendance-overtime.js','utf8');
new vm.Script(source);
const date='2026-10-24',month='2026-10',store=new Map();
const rev={confirmed:true,reportId:'R1',actor:'主管',at:'2026-10-25',kind:'modified',reason:'時段核對'};
const report={id:'R1',code:'休08-16',category:'休',declaredHours:8,reportedAt:'2026-10-24T17:00',modifiedAt:'2026-10-25T09:00'};
function state({order=false,empty=false,edit=false,newReport=false}={}){
 const details={overtimeReport:order?{
   modifiedAt:edit?'2026-10-29T11:00':report.modifiedAt,
   reportedAt:report.reportedAt,declaredHours:report.declaredHours,
   category:report.category,code:report.code,id:report.id
  }:{...report,modifiedAt:edit?'2026-10-29T11:00':report.modifiedAt},
  overtimeAmendments:order?[{reason:rev.reason,kind:rev.kind,at:rev.at,actor:rev.actor,reportId:rev.reportId}]:[{...rev}]
 };
 const a={empId:'E1',schedule:{__meta:{[date]:details}}};
 const b={empId:'E2',schedule:{__meta:empty?{[date]:{restEvidence:'重新核算'}}:{}}};
 const c={empId:'E3',schedule:{__meta:{[date]:newReport?{overtimeReport:{id:'R3',code:'國08-16'}}:{shiftEvidence:'班表讀取'}}}};
 return {ready:true,token:'TOKEN',rows:order?[c,b,a]:[a,b,c],people:[{empId:'E1',name:'甲'},{empId:'E2',name:'乙'}]};
}
const months=new Map([[month,state()]]);
const styles={},button={dataset:{},style:{setProperty(k,v){styles[k]=v},removeProperty(k){delete styles[k]}},removeAttribute(){},setAttribute(){},getAttribute:()=>date};
const strip={querySelectorAll:()=>[button],querySelector:()=>null,appendChild(){}};
const ctx={document:{readyState:'complete',getElementById:id=>id==='p79AttendanceDateStrip'?strip:null,createElement:()=>({style:{}})},
 renderRecordsPagination(){},p79AttendanceOvertimeMonths:months,
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 addEventListener(){}};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
const api=ctx.P79AttendanceOvertimeDayStatus;
const color=()=>{api.decorateOvertimeDateStrip([date],date);return styles['background-color'];};
assert.equal(color(),'#fef3c7','amended initially needs review');
assert(api.markReviewed(date,true),'verified cloud amended report can be marked');
assert.equal(color(),'#dcfce7','reviewed becomes green');
const first=api.reviewFingerprint(date,months.get(month));
months.set(month,state({order:true,empty:true}));
assert.equal(api.reviewFingerprint(date,months.get(month)),first,'read-only reload and reorder cannot change review signature');
assert.equal(api.isReviewed(date),true,'approved review remains valid');
assert.equal(color(),'#dcfce7','reopening monthly rest must not turn green to yellow');
months.set(month,state({edit:true,order:true,empty:true}));
assert.notEqual(api.reviewFingerprint(date,months.get(month)),first,'actual modifiedAt changes revision');
assert.equal(api.isReviewed(date),false,'genuine edit invalidates prior review');
assert.equal(color(),'#fef3c7','new edit turns amended date yellow');
assert(api.markReviewed(date,true),'operator can recheck actual changed report');
assert.equal(color(),'#dcfce7');
months.set(month,state({edit:true,order:true,empty:true,newReport:true}));
assert.equal(api.isReviewed(date),false,'an additional actual filing invalidates review');
months.set(month,state());
assert(api.markReviewed(date,true));
const oldHash=(()=>{
 const rows=months.get(month).rows.map(row=>{
  const meta=row.schedule?.__meta?.[date];
  return meta?[String(row.empId||'').toUpperCase(),meta.overtimeReport||null,
   meta.overtimeReports||null,meta.overtimeAmendments||null,
   meta.overtimeRevisions||null,meta.overtimeRevocations||null,
   meta.overtimeExcluded===true]:null;
 }).filter(Boolean).sort((a,b)=>a[0].localeCompare(b[0]));
 const value=JSON.stringify(['TOKEN',rows]);
 let hash=2166136261;
 for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);
 return rows.length+'-'+(hash>>>0).toString(36);
})();
store.set('p79.attendance.date.reviewed.confirmed.v2',JSON.stringify({[date]:oldHash}));
assert(api.isReviewed(date),'existing reviewed mark migrates when old official snapshot exactly matches');
assert.equal(api.reviewFingerprint(date,months.get(month)),JSON.parse(store.get('p79.attendance.date.reviewed.confirmed.v2'))[date]);
console.log('PASS monthly-rest read-only snapshot preserves reviewed green dates; edits/new reports invalidate; legacy marks migrate safely');
