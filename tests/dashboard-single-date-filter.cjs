const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){const start=html.indexOf('function '+name+'('),line=html.slice(start,html.indexOf('\n',start));return line.endsWith('}')?line:html.slice(start,html.indexOf('\n}',start)+2);}
const nodes=new Map(['dashboardStartDate','dashboardEndDate','filterMonth'].map(id=>[id,{value:''}]));let renders=0,syncs=0,toasts=0;
const c={document:{getElementById:id=>nodes.get(id)||null},records:[],summaryCurrentPage:3,renderAll:()=>renders++,toast:()=>toasts++,Port79CalendarRange:{syncAll:()=>syncs++}};vm.createContext(c);
for(const name of ['dashboardDateRange','normalizeIsoDateOnly','dateWithinDashboardRange','shipMasterMatchesDashboardRange','updateDashboardRangeState','applyDashboardDateRange','clearDashboardDateRange','clearDashboardFilter'])vm.runInContext(fn(name),c);
const start=nodes.get('dashboardStartDate'),end=nodes.get('dashboardEndDate'),month=nodes.get('filterMonth');
start.value=end.value='2026-10-16';month.value='2026-10';c.applyDashboardDateRange();assert.equal(month.value,'');assert.equal(c.summaryCurrentPage,1);assert.equal(renders,1);assert.equal(syncs,1);
assert(c.shipMasterMatchesDashboardRange({firstDate:'2026-10-15',lastDate:'2026-10-17'}));assert(!c.shipMasterMatchesDashboardRange({firstDate:'2026-10-17'}));assert(c.dateWithinDashboardRange('2026-10-16'));assert(!c.dateWithinDashboardRange('2026-10-15'));
end.value='2026-10-20';c.applyDashboardDateRange();assert(c.dateWithinDashboardRange('2026-10-20'));assert(!c.dateWithinDashboardRange('2026-10-21'));
start.value='2026-10-21';c.applyDashboardDateRange();assert.equal(toasts,1);assert.equal(renders,2);
c.clearDashboardFilter();assert.equal(start.value,'');assert.equal(end.value,'');assert.equal(c.dashboardDateRange().active,false);
assert.equal((html.match(/id="dashboardStartDate"/g)||[]).length,1);assert(html.includes('id="dashboardStartDate" type="hidden"'));assert(html.includes('id="dashboardEndDate" type="hidden"'));assert(html.indexOf('id="dashboardDateRangePicker"')>html.indexOf('id="filterMonth"'));assert(html.includes("hostId:'dashboardDateRangePicker',startId:'dashboardStartDate',endId:'dashboardEndDate'"));
assert(!fn('getPort79Year').includes('dashboardStartDate'));assert(fn('setPort79Year').includes('dashboardStartDate'));
console.log(JSON.stringify({passed:5,failed:0,scope:'Single calendar control, inclusive dates, overlap, month exclusion and clear reset'}));
