const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('schedule/index.html','utf8');
function fn(name,indent=''){let a=html.indexOf('function '+name+'(');assert(a>=0,name);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n'+indent+'}',a)+indent.length+2)}
const picker={value:'2026-10',disabled:false},status={textContent:''},pending=[];let syncs=0,flushes=0;
const c={Date,document:{getElementById:id=>id==='month-picker'?picker:status},window:{Port79CalendarRange:{syncAll(){syncs++}}},p79QuickMonthBusy:false,port79ScheduleDirty:false,scheduleSaveTimer:null,personnelSaveTimer:null,port79ScheduleWriteInFlight:null,scheduleTaipeiTodayKey:()=> '2026-10-18',flushSchedulePendingWrites:async()=>{flushes++;return false},onScheduleMonthPickerChange:()=>new Promise(r=>pending.push(r))};vm.createContext(c);vm.runInContext(fn('p79QuickScheduleMonth'),c);
(async()=>{
const a=c.p79QuickScheduleMonth(1);assert.equal(picker.value,'2026-11');assert.equal(picker.disabled,false);assert.equal(c.p79QuickMonthBusy,false);const b=c.p79QuickScheduleMonth(1);assert.equal(picker.value,'2026-12');assert.equal(pending.length,2);assert.equal(flushes,0);assert.equal(syncs,2);pending.splice(0).forEach(r=>r());await Promise.all([a,b]);
c.port79ScheduleDirty=true;await c.p79QuickScheduleMonth(1);assert.equal(picker.value,'2026-12');assert.equal(flushes,1);assert.equal(c.p79QuickMonthBusy,false);
c.port79ScheduleDirty=false;const back=c.p79QuickScheduleMonth(0);assert.equal(picker.value,'2026-10');pending.shift()();await back;
assert(html.includes("onShift:step=>p79QuickScheduleMonth(step)"));const load=fn('loadCloudData','    ');assert(load.includes('p79ScheduleCloudReadController=controller'));assert(fn('onScheduleMonthPickerChange','    ').includes('p79ScheduleCloudReadController?.abort()'));
// Shared month control delegates only when the caller opts in, and external sync updates its label.
const src=fs.readFileSync('assets/port79-calendar-range.js','utf8');let shifted=0;const controls={'.p79-mprev':{},'.p79-mnext':{},'.p79-umnav-label':{textContent:''}},input={dataset:{},value:'2026-10',classList:{add(){}},parentElement:{insertBefore(){}},addEventListener(){}};
const ctx={Date,document:{getElementById:()=>input,createElement:()=>({querySelector:s=>controls[s]})},instances:[],pad:n=>String(n).padStart(2,'0'),emit(){}};vm.createContext(ctx);const start=src.indexOf('function mountMonth(');vm.runInContext(src.slice(start,src.indexOf('\n}',start)+2),ctx);ctx.mountMonth({inputId:'month-picker',onShift:n=>shifted+=n});controls['.p79-mnext'].onclick();assert.equal(shifted,1);assert.equal(input.value,'2026-10');input.value='2026-11';ctx.instances[0].sync();assert(controls['.p79-umnav-label'].textContent.includes('11 月'));
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);new vm.Script(src);
console.log('PASS rapid month navigation without read lock, dirty-write protection, month label sync, shared arrows delegation, cancellation wiring and parse');
})().catch(e=>{console.error(e);process.exitCode=1});
