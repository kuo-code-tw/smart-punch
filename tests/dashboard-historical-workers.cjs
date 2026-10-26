const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert(start>=0,name);const end=html.indexOf('\n}',start);assert(end>=0,name);return html.slice(start,end+2);}
const current=[{empId:'EMP-A',name:'現職甲'},{empId:'EMP-B',name:'現職乙'}];
const mk=(id,name,qty,date='2026-10-26',extra={})=>({id:'ROW-'+id+'-'+date,empId:id,name,workingNo:'5260176',number:'8002',source:'working-report',workDate:date,startTime:'03:30',endTime:'04:00',disc:qty,load:0,hatches:0,timeHours:0.5,...extra});
const history=mk('NAME:孫逸樺','孫逸樺',9,'2026-10-14');
const rows=[mk('EMP-A','現職甲',40),mk('EMP-B','現職乙',51),history,mk('EMP-A','現職甲(AQC)',3,'2026-10-25'),mk('NAME:孫逸樺','孫逸樺',20,'2026-09-25'),mk('OTHER-X','歷史乙',4,'2025-10-25')];
const nodes={filterMonth:{value:'2026-10'}};
const ctx={
  Map,Set,Array,Number,String,
  document:{getElementById:id=>nodes[id]||null},
  getPort79Year:()=> '2026',
  dashboardDateRange:()=>({active:false}),
  dateWithinDashboardRange:d=>d>='2026-10-01'&&d<='2026-10-31',
  people:()=>current,
  shipMasters:[],
  applyShipManualOverrides:s=>s,
  normalizePersonName:s=>String(s||'').replace(/[（(]\s*AQC\s*[)）]/ig,'').replace(/\s+/g,''),
  canonicalOperationalRecords:rs=>rs,
  personGroupId:()=> 'A',
  effectiveHours:r=>r.timeHours,
  recordMoveValues:r=>({disc:r.disc,load:r.load}),
  num:v=>Number(v)||0,
  round:(v,p=2)=>Number(Number(v).toFixed(p)),
  records:rows
};
vm.createContext(ctx);for(const name of ['shipCompletionMonth','shipCompletionIndex','recordCompletionMonth','recordIsCurrentShipDetail','summaryRows'])vm.runInContext(fn(name),ctx);
let actual=ctx.summaryRows();
const get=name=>actual.find(x=>x.name===name);
assert.equal(actual.length,3,'Two current staff and one former staff have October work');
assert.equal(actual.reduce((n,x)=>n+x.containers,0),103,'Historical nine moves must be included exactly once');
assert.equal(get('孫逸樺').containers,9);
assert.equal(get('孫逸樺').totalHours,0.5);
assert.equal(get('孫逸樺').historical,true);
assert.equal(get('孫逸樺').groupId,'','Former workers must not get active roster group assignments');
assert.equal(get('現職甲').containers,43,'The same current staff ID with an AQC name suffix must be merged');
assert.equal(ctx.people().length,2,'Active roster must not be modified');
assert(html.includes("document.getElementById('kpiPeople').textContent=people().length;"),'Current staff KPI must stay separate');
const noMutation=JSON.stringify(rows);
actual=ctx.summaryRows();
assert.equal(JSON.stringify(rows),noMutation,'Read-only stats must never mutate source records');
assert.equal(actual.reduce((n,x)=>n+x.containers,0),103,'Rerender must not re-add former staff moves');
nodes.filterMonth.value='2026-09';
actual=ctx.summaryRows();
assert.equal(actual.length,1);
assert.equal(actual[0].name,'孫逸樺');
assert.equal(actual[0].containers,20);
nodes.filterMonth.value='2026-10';
ctx.records=[...rows,mk('EMP-A','現職甲',5,'2026-10-23',{empId:'NAME:現職甲'})];
assert.equal(ctx.summaryRows().find(x=>x.name==='現職甲').containers,48,'Pseudo-ID for present person must resolve by name');
nodes.filterMonth.value='';
assert.equal(ctx.summaryRows().reduce((n,x)=>n+x.containers,0),128,'Yearly record totals include former staff without prior-year leakage');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
console.log(JSON.stringify({passed:12,failed:0,scope:'Former AQC employee nine moves, current headcount isolation, de-dup identity matching, month/year scopes and no writes'}));
