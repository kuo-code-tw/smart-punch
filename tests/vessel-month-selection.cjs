const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n}',a)+2)}
const c={};vm.createContext(c);vm.runInContext(fn('dashboardSelectableMonths'),c);
let passed=0;function test(name,f){f();passed++;console.log('PASS '+name)}
test('empty local data exposes September and all twelve months',()=>{const m=c.dashboardSelectableMonths('2026',[]);assert.equal(m.length,12);assert(m.includes('2026-09'));assert.equal(m[0],'2026-12')});
test('October-only cache still exposes September',()=>assert(c.dashboardSelectableMonths('2026',['2026-10']).includes('2026-09')));
test('wrong-year and invalid cached months are excluded',()=>assert.equal(c.dashboardSelectableMonths('2026',['2025-09','2026-00','2026-13','junk']).length,12));
test('duplicate loaded months do not duplicate options',()=>assert.equal(c.dashboardSelectableMonths('2026',['2026-09','2026-09']).length,12));
test('invalid year yields no misleading options',()=>assert.equal(c.dashboardSelectableMonths('junk',[]).length,0));
test('dropdown actually uses independent calendar options',()=>assert(fn('populateSelects').includes('dashboardSelectableMonths(getPort79Year(),availableMonthsFromRecords())')));
(async()=>{
 const elements={filterMonth:{value:'2026-09'},dashboardStartDate:{value:'2026-10-01'},dashboardEndDate:{value:'2026-10-31'}},reads=[];
 Object.assign(c,{document:{getElementById:id=>elements[id]},summaryCurrentPage:4,updateDashboardRangeState(){},getPort79Year:()=> '2026',renderAll(){},loadEfficiencyCloudScope:async(p,show)=>reads.push({p,show})});
 vm.runInContext(fn('onDashboardMonthChange'),c);await c.onDashboardMonthChange();assert.equal(reads[0].p.month,'2026-09');assert(reads[0].show);assert.equal(elements.dashboardStartDate.value,'');assert.equal(c.summaryCurrentPage,1);passed++;console.log('PASS selecting September requests its cloud data and clears stale date range');
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);passed++;console.log(JSON.stringify({passed,failed:0,scope:'Node calendar and cloud-request regression; no real cloud-data verification'}));
})().catch(e=>{console.error(e);process.exitCode=1});
