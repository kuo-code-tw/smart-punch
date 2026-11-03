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
 const card={dataset:{},hidden:false,style:{setProperty(){},removeProperty(){}},
   setAttribute(){},removeAttribute(){}};
 const context={document:{documentElement:html,querySelector:()=>card},
  p79IsAdminPhoneDevice:()=>phone,window:{},currentSession:session};
 vm.runInNewContext(fnSrc+';p79SyncAdminPhonePanels(currentSession);',context);
 return {mode:html.classes.has('p79-admin-phone-two-panels'),hidden:card.hidden};
}
assert.deepEqual(run({adminRole:'admin',actualAdminRole:'admin'},true),{mode:true,hidden:true});
assert.deepEqual(run({adminRole:'superadmin',actualAdminRole:'superadmin'},true),{mode:false,hidden:false});
assert.deepEqual(run({adminRole:'admin',actualAdminRole:'superadmin'},true),{mode:false,hidden:false});
assert.deepEqual(run({adminRole:'admin',actualAdminRole:'admin',punchOnly:true},true),{mode:false,hidden:false});
assert.deepEqual(run({adminRole:'admin',actualAdminRole:'admin'},false),{mode:false,hidden:false});
assert.deepEqual(run({adminRole:'employee'},true),{mode:false,hidden:false});
for(const tag of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
 if(!/\bsrc=|application\/json|importmap/.test(tag[1]))new vm.Script(tag[2]);
}
console.log('PASS ordinary admin phone compact; superadmin phone full dashboard; CSS fallback restricted; logout/desktop/punch excluded');
