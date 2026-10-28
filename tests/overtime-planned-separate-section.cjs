'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
function extract(name){
 const start=html.indexOf('function '+name+'('),end=html.indexOf('\n        }',start);
 assert(start>=0&&end>start,'function present: '+name);
 return html.slice(start,end+10);
}
assert(html.includes('id="p79OvertimePlannedSection"'),'a separate, visible planned section exists');
assert(html.includes('id="p79OvertimePlannedBody"'),'planned section gets its own table');
assert(html.includes('id="p79OvertimePlannedCount"'),'planned count displayed independently');
assert(html.includes('id="overtimeTableBody"'),'main confirmed overtime table remains');
assert(html.includes('rows:confirmedPageRows, plannedRows:plannedPageRows'),'source splits confirmed and planned once');
assert(html.includes('p79RenderOvertimePlannedRows(p79OvertimeCalculationCache?.plannedRows||[],month,dept,jobTitle,employeeId)'),'render planned section with filters, not source filter');
assert(html.includes("const allOvertimeRows = buildOvertimeStatisticsRows().filter(row=>!p79WorkOvertimeIsUnconfirmedPlan(row))"),'official rows stay unplanned');
const element={innerHTML:'',textContent:''},nodes={
 p79OvertimePlannedBody:{...element},p79OvertimePlannedCount:{...element},p79OvertimePlannedPagination:{...element}};
const ctx={console,Number,String,Array,Set,Map,Math,Date,
 Intl:{DateTimeFormat:function(){return{format:()=> '2026-10-28'}}},
 p79OvertimeCalculationCache:null,p79WorkOvertimeMonths:new Map(),p79MonthlyRestDraftsByMonth:new Map(),
 p79OvertimePlannedDisplayedRows:[],records:[],currentEmp:{empId:'ADMIN'},
 canPerformAdminAction:()=>true,
 formatEditableAttendanceTimeCell:(rec,type,can)=>can?'編輯'+(type==='IN'?'上班':'下班')+'時間 '+rec.timeStr:rec.timeStr,
 document:{getElementById:x=>nodes[x]||null},
 escapeHtml:s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])),
 p79OvertimePlannedPage:1};
vm.createContext(ctx);
for(const name of ['p79WorkOvertimeIsUnconfirmedPlan','p79OvertimePlannedVisibleRows','p79OvertimePendingReason','p79OvertimePendingPunchCell','p79RenderOvertimePlannedRows'])vm.runInContext(extract(name),ctx);
const report={id:'P123',planned:true,code:'休24-08',declaredHours:8};
const planned={empId:'A',name:'測試甲',dateKey:'2026-10-28',monthKey:'2026-10',dept:'第一事業處',jobTitle:'ARMG',overtimeReport:report,planned:true};
const official={empId:'B',name:'測試乙',dateKey:'2026-10-28',monthKey:'2026-10',dept:'第一事業處',jobTitle:'F/L',overtimeReport:{id:'R123',planned:false,code:'休08-16',declaredHours:8}};
const another={empId:'C',name:'測試丙',dateKey:'2026-10-30',monthKey:'2026-10',dept:'第二事業處',jobTitle:'ARMG',overtimeReport:{id:'P124',planned:true,code:'休16-24',declaredHours:8}};
const rows=[planned,official,another];
const visible=(month='ALL',dept='ALL',title='ALL',emp='ALL')=>Array.from(ctx.p79OvertimePlannedVisibleRows(rows,month,dept,title,emp),x=>x.empId);
assert.deepEqual(visible(),['A','C'],'only planned records belong to planned section');
assert.deepEqual(visible('2026-10','第一事業處','ARMG'),['A'],'filters apply to the planned section');
assert.deepEqual(visible('2026-11'),[],'a different month has no planned entries');
assert.deepEqual(visible('2026-10','ALL','ALL','C'),['C'],'employee filtering works');
assert.deepEqual(visible('2026-10','ALL','F/L'),[],'confirmed F/L report does not leak into planned');
ctx.p79RenderOvertimePlannedRows(rows,'2026-10','ALL','ALL','ALL');
assert(nodes.p79OvertimePlannedBody.innerHTML.includes('測試甲')&&nodes.p79OvertimePlannedBody.innerHTML.includes('測試丙'));
assert(!nodes.p79OvertimePlannedBody.innerHTML.includes('測試乙'));
assert(nodes.p79OvertimePlannedBody.innerHTML.includes('休24-08'),'planned period remains visible');
assert(nodes.p79OvertimePlannedBody.innerHTML.includes('無打卡'),'past/date-today planned record clearly shows missing punches');
assert(nodes.p79OvertimePlannedBody.innerHTML.includes('補登上班')&&nodes.p79OvertimePlannedBody.innerHTML.includes('補登下班'),'missing punches have explicit add actions');
assert(!nodes.p79OvertimePlannedBody.innerHTML.includes('核對申報</button>'),'rows without completed punches must not have confirmation actions');
assert(nodes.p79OvertimePlannedCount.textContent.includes('2 筆'),'only the planned count appears');
ctx.p79MonthlyRestDraftsByMonth.set('2026-10',[
 {empId:'D',name:'測試丁',dateKey:'2026-10-29',monthKey:'2026-10',rosterDate:'2026-10-29',dept:'第一事業處',jobTitle:'ARMG',planned:true,p79RestDraft:true,overtimeReport:{code:'國08-16',planned:true,declaredHours:8}},
 {empId:'E',name:'過去不應補',dateKey:'2026-10-25',monthKey:'2026-10',rosterDate:'2026-10-25',dept:'第一事業處',jobTitle:'ARMG',planned:true,p79RestDraft:true,overtimeReport:{code:'國08-16',planned:true,declaredHours:8}}
]);
ctx.p79RenderOvertimePlannedRows(rows,'2026-10','ALL','ALL','ALL');
assert(nodes.p79OvertimePlannedBody.innerHTML.includes('測試丁')&&nodes.p79OvertimePlannedBody.innerHTML.includes('尚未申報'),'new suggestions appear in the separate section');
assert(!nodes.p79OvertimePlannedBody.innerHTML.includes('過去不應補'),'past Oct 25 proposals never appear when today is Oct 28');
assert(nodes.p79OvertimePlannedCount.textContent.includes('3 筆'),'actual saved plans and new future suggestions are combined');
const punched={...planned,reportVerified:true,
 clockIn:{timeStr:'2026/10/28 08:00:00',id:'IN1'},
 clockOut:{timeStr:'2026/10/28 16:00:00',id:'OUT1'}};
ctx.p79RenderOvertimePlannedRows([punched,official,another],'2026-10','ALL','ALL','ALL');
assert(nodes.p79OvertimePlannedBody.innerHTML.includes('核對申報</button>'),'complete punch + original cloud ID shows review button');
assert.equal(ctx.p79OvertimePlannedDisplayedRows[0].empId,'A','button index maps to same visible row');
assert(!nodes.p79OvertimePlannedBody.innerHTML.includes('確認完成'),'render does not falsely mark confirmed before saving');
assert(nodes.p79OvertimePlannedBody.innerHTML.includes('待核對'),'complete punch shows exact required review');
ctx.records=[punched.clockIn,punched.clockOut].map(p=>({...p,empId:'A'}));
ctx.p79RenderOvertimePlannedRows([punched,official,another],'2026-10','ALL','ALL','ALL');
assert(nodes.p79OvertimePlannedBody.innerHTML.includes('修改上班打卡時間')&&nodes.p79OvertimePlannedBody.innerHTML.includes('修改下班打卡時間'),'both actual times open the shared attendance editor directly');
ctx.p79RenderOvertimePlannedRows(rows,'2026-10','ALL','ALL','B');
assert(nodes.p79OvertimePlannedBody.innerHTML.includes('沒有預排'),'empty state remains clear');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
console.log('PASS planned overtime appears in its own page section, uses same filters, retains report details, never leaks into confirmed totals or rows, scripts parse');
