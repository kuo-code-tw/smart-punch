const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const old=fs.readFileSync('assets/port79-home-dashboard.js','utf8');
// A real monthly host must stop the legacy renderer before it subscribes or loads data.
vm.runInNewContext(old,{document:{getElementById:id=>id==='p79Dashboard'?{}:null,body:{dataset:{}}},window:{P79HomeAnalytics:{}}});
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
for(const id of ['p79Dashboard','p79DashMonth','p79DashRefresh','p79DashDonut'])assert.equal(ids.filter(x=>x===id).length,1,id+' must have exactly one owner');
const nav=fs.readFileSync('assets/port79-management-workspace.js','utf8');
assert(!nav.includes('p79HomeDashboard'),'integration nav must target the active monthly dashboard');
assert(nav.includes("if(home&&d.getElementById('p79Dashboard'))"),'logout remains accessible in the monthly management shell');
console.log('PASS monthly host prevents legacy rendering/read subscriptions; controls and navigation have one owner');
