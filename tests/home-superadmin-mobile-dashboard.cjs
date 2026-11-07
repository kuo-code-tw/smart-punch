'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('index.html','utf8');
const match=source.match(/function p79SyncAdminPhonePanels\(session\)\{[\s\S]*?\n\}/);
assert(match,'administrator mobile mode function is available');
const fnSrc=match[0];
const fallback=source.match(/<style id="p79-admin-mobile-css-fallback-20261103">([\s\S]*?)<\/style>/)?.[1];
assert(fallback,'last-resort mobile style exists');
const withoutComments=fallback.replace(/\/\*[\s\S]*?\*\//g,'');
const blocks=[...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
 .filter(m=>m[1].includes('body.p79-workspace'));
assert(blocks.length>=20,'mobile CSS selectors are present');
for(const block of blocks){
 for(const selector of block[1].split(',')){
  const trimmed=selector.trim();
  if(trimmed.includes('body.p79-workspace'))
   assert(trimmed.includes('html.p79-admin-phone-two-panels'),
    'superadministrator must not be hidden by bare mobile fallback selector: '+trimmed);
 }
}
function run(session,phone){
 const html={classes:new Set(),classList:{toggle(name,on){if(on)html.classes.add(name);else html.classes.delete(name)}}};
 function createCard(){
  return {dataset:{},hidden:false,style:{setProperty(){},removeProperty(){}},
   setAttribute(){},removeAttribute(){}};
 }
 const trend=createCard(),gate=createCard();
 const tab={getAttribute:()=> 'false'};
 let gateCalls=0;
 const context={document:{documentElement:html,
   querySelector:selector=>selector.includes('.p79d-gate-flip')?gate:trend,
   getElementById:()=>tab},
  p79IsAdminPhoneDevice:()=>phone,
  window:{P79GateStatsHome:{switchTab(which){if(which==='gate')gateCalls++;}}},
  currentSession:session};
 vm.runInNewContext(fnSrc+';p79SyncAdminPhonePanels(currentSession);',context);
 return {mode:html.classes.has('p79-admin-phone-two-panels'),trendHidden:trend.hidden,
  gateHidden:gate.hidden,gateCalls};
}
assert.deepEqual(run({adminRole:'admin',actualAdminRole:'admin'},true),{
 mode:true,trendHidden:true,gateHidden:false,gateCalls:1});
for(const session of [
 {adminRole:'superadmin',actualAdminRole:'superadmin'},
 {adminRole:'admin',actualAdminRole:'superadmin'},
 {adminRole:'admin',actualAdminRole:'admin',punchOnly:true},
 {adminRole:'employee'}
]){
 assert.deepEqual(run(session,true),{mode:false,trendHidden:false,gateHidden:false,gateCalls:0});
}
assert.deepEqual(run({adminRole:'admin',actualAdminRole:'admin'},false),{
 mode:false,trendHidden:false,gateHidden:false,gateCalls:0});
const phoneStyles=[...source.matchAll(/<style id="(p79-admin-phone-two-panels-20261103|p79-admin-mobile-css-fallback-20261103)">([\s\S]*?)<\/style>/g)];
assert.equal(phoneStyles.length,2,'both original mobile rules remain');
for(const [,id,css] of phoneStyles){
 assert(css.includes(':not(.p79d-ship-schedule):not(.p79d-gate-flip)'),
  id+' allows the Gate flip card');
 assert(!/\.p79d-ship-panels\s*>\s*\.p79d-ranking\s*\{\s*display:none!important/.test(css),
  id+' does not hide the ranking/Gate card');
}
assert(source.includes('id="p79-mobile-gate-quantities-20261107"'),'mobile Gate volume panel is explicitly sized');
for(const tag of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
 if(!/\bsrc=|application\/json|importmap/.test(tag[1]))new vm.Script(tag[2]);
}
console.log('PASS admin phone shows Gate quantities with WAN HAI and shift; superadmin and other sessions unaffected');
