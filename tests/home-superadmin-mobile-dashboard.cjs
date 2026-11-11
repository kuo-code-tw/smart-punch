'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('index.html','utf8');
const match=source.match(/function p79SyncAdminPhonePanels\(session\)\{[\s\S]*?\n\}/);
assert(match,'administrator mobile visibility function is available');
const fnSrc=match[0];
const fallback=source.match(/<style id="p79-admin-mobile-css-fallback-20261103">([\s\S]*?)<\/style>/)?.[1];
const primary=source.match(/<style id="p79-admin-phone-two-panels-20261103">([\s\S]*?)<\/style>/)?.[1];
const last=source.match(/<style id="p79-mobile-gate-quantities-20261107">([\s\S]*?)<\/style>/)?.[1];
assert(fallback&&primary&&last,'administrator mobile CSS overrides exist');
for(const css of [fallback,primary]){
 assert(css.includes('.p79d-ship-panels>:not(.p79d-ship-schedule)'),
  'only WAN HAI schedule is visible in the mobile ship panel');
 assert(!css.includes(':not(.p79d-ship-schedule):not(.p79d-gate-flip)'),
  'Gate is no longer a mobile exception');
}
assert(last.includes('display:none!important;visibility:hidden!important;'),
 'old mobile Gate force-visible override is removed');
assert(!last.includes('display:flex!important;visibility:visible!important;'),
 'Gate must never be forced visible on admin phones');
for(const selector of ['.p79d-ship-schedule','.p79r-current-shift-card'])
 assert(primary.includes(selector),'retain WAN HAI schedule and current shift '+selector);
function run(session,phone,selectedGate=false){
 const html={classes:new Set(),classList:{toggle(name,on){if(on)html.classes.add(name);else html.classes.delete(name)}}};
 function card(){
  const properties=new Map();
  return {dataset:{},hidden:false,attrs:{},style:{
   setProperty(key,val){properties.set(key,val)},removeProperty(key){properties.delete(key)}
  },setAttribute(name,value){this.attrs[name]=value},removeAttribute(name){delete this.attrs[name]}};
 }
 const trend=card(),gate=card();
 const tab={getAttribute:()=>selectedGate?'true':'false'};
 const gateCalls=[];
 const context={document:{documentElement:html,
  querySelector:selector=>selector.includes('.p79d-gate-flip')?gate:trend,
  getElementById:()=>tab
 },p79IsAdminPhoneDevice:()=>phone,
 window:{P79GateStatsHome:{switchTab(which){gateCalls.push(which)}}},
 currentSession:session};
 vm.runInNewContext(fnSrc+';p79SyncAdminPhonePanels(currentSession);',context);
 return {mode:html.classes.has('p79-admin-phone-two-panels'),trendHidden:trend.hidden,
  gateHidden:gate.hidden,gateCalls};
}
assert.deepEqual(run({adminRole:'admin',actualAdminRole:'admin'},true),{
 mode:true,trendHidden:true,gateHidden:true,gateCalls:[]});
assert.deepEqual(run({adminRole:'admin',actualAdminRole:'admin'},true,true),{
 mode:true,trendHidden:true,gateHidden:true,gateCalls:['operations']});
for(const session of [
 {adminRole:'superadmin',actualAdminRole:'superadmin'},
 {adminRole:'admin',actualAdminRole:'superadmin'},
 {adminRole:'admin',actualAdminRole:'admin',punchOnly:true},
 {adminRole:'employee'}
]) assert.deepEqual(run(session,true),{
 mode:false,trendHidden:false,gateHidden:false,gateCalls:[]});
assert.deepEqual(run({adminRole:'admin',actualAdminRole:'admin'},false),{
 mode:false,trendHidden:false,gateHidden:false,gateCalls:[]});
for(const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
 if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
}
console.log('PASS ordinary admin phone only WAN HAI + current shift, no Gate or trend; desktop/superadmin unaffected');
