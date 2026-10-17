const fs=require('fs'),vm=require('vm'),assert=require('assert');
const files=['attendance/index.html','work-hours/index.html','schedule/index.html'];
function fn(source,name){let a=source.indexOf('function '+name+'(');assert(a>=0,name);if(source.slice(a-6,a)==='async ')a-=6;return source.slice(a,source.indexOf('\n        }',a)+10)}
for(const file of files.slice(0,2)){
 const s=fs.readFileSync(file,'utf8'),context={DEFAULT_DEPARTMENTS:['第二事業處'],employees:[{dept:'第二事業處'}],records:[{dept:'第二事業部'}],leaveRecords:[]};vm.createContext(context);for(const name of ['normalizeDepartments','migrateLegacyDepartments'])vm.runInContext(fn(s,name),context);
 assert.deepEqual(Array.from(context.normalizeDepartments(['第二事業處'])),['第二事業處']);assert.deepEqual(Array.from(context.normalizeDepartments(['自訂部門'])),['自訂部門']);context.migrateLegacyDepartments();assert.equal(context.employees[0].dept,'第二事業處');assert.equal(context.records[0].dept,'第二事業部');assert(!s.includes("'第二事業處': '第二事業部'"));assert(!s.includes("'第二事業處':'第二事業部'"));
}
const html=fs.readFileSync(files[0],'utf8');
function setup(){const nodes={btnSaveSystemSettings:{innerHTML:'儲存',disabled:false},cfgCompanyName:{value:'公司'},cfgLocationName:{value:'碼頭'},cfgLat:{value:'22.555526'},cfgLng:{value:'120.337733'},cfgRadius:{value:'100'},cfgGasUrl:{value:'https://example.invalid'},cfgAdminIds:{value:''}};let closed=0;
 const empty=()=>Array.from({length:5},()=>({name:'',lat:null,lng:null,radius:100}));
 const c={JSON,Number,String,TextEncoder,p79SystemSettingsSaveBusy:false,document:{getElementById:id=>nodes[id]},requireAdminAction:()=>true,canOpenAdminTab:t=>t==='records',switchAdminTab:()=>closed++,switchView:()=>closed++,showToast(){},p79SettingsSaveFeedback(){},sysConfig:{companyName:'公司',extraLocations:empty()},defaultConfig:{companyName:'公司'},getActiveGasUrl:()=> 'https://example.invalid',normalizeGasWebAppUrl:s=>s,isValidGasWebAppUrl:()=>true,normalizeExtraLocations:x=>x?.length?x:empty(),normalizeAdminIds:x=>x,saveConfig(){},applySysConfigUI(){},postToCloud:async()=>({ok:true})};vm.createContext(c);for(const name of ['closeSystemSettings','saveSystemSettings'])vm.runInContext(fn(html,name),c);return{c,nodes,closed:()=>closed};}
(async()=>{
 let q=setup();await q.c.saveSystemSettings();assert.equal(q.closed(),1);assert(!q.c.p79SystemSettingsSaveBusy);assert(!q.nodes.btnSaveSystemSettings.disabled);
 q=setup();q.c.postToCloud=async()=>({ok:false,error:'busy'});assert.equal((await q.c.saveSystemSettings()).ok,false);assert.equal(q.closed(),0);
 q=setup();q.c.postToCloud=async()=>({ok:true,localOnly:true});await q.c.saveSystemSettings();assert.equal(q.closed(),0);
 q=setup();q.c.postToCloud=async()=>({ok:true,config:{extraLocations:[{name:'different'}]}});await q.c.saveSystemSettings();assert.equal(q.closed(),0);
 q=setup();q.nodes.cfgLat.value='invalid';await q.c.saveSystemSettings();assert.equal(q.closed(),0);
 q=setup();let resolve;q.c.postToCloud=()=>new Promise(r=>resolve=r);const pending=q.c.saveSystemSettings();q.c.closeSystemSettings();assert.equal(q.closed(),0);resolve({ok:true});await pending;assert.equal(q.closed(),1);
 q=setup();q.c.closeSystemSettings();assert.equal(q.closed(),1);
 assert.equal((html.match(/onclick="closeSystemSettings\(\)"/g)||[]).length,2);
 const schedule=fs.readFileSync(files[2],'utf8'),quick=schedule.slice(schedule.indexOf('<section id="p79ScheduleQuickBar"'),schedule.indexOf('<!-- 圖片二：'));
 assert(quick.indexOf('>輪班規則</button>')<quick.indexOf('id="schedule-legend-left"'));assert(quick.includes('班別顏色：'));assert.equal((schedule.match(/id="schedule-legend-left"/g)||[]).length,1);assert(schedule.includes('grid-column:1/-1'));
 for(const file of files){const source=fs.readFileSync(file,'utf8');for(const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);}
 console.log('PASS HR department names survive normalization, legacy history preserved, close after confirmed save only, busy/failure stays open, two close buttons, legend placement and JS parse');
})().catch(e=>{console.error(e);process.exitCode=1});
