'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('assets/port79-hidden-job-titles.js','utf8');
const html=fs.readFileSync('leave/index.html','utf8');
new vm.Script(script);
const policy=require('../assets/port79-hidden-job-titles.js');
assert.equal(policy.key(' F / L '),'FL');
assert.deepEqual(policy.hiddenFromConfig({hrOrgOptionsV1:{jobTitles:['F/L','領班']},hrOrgOptionsV2:{hiddenJobTitles:[' F / L ','領班','領班']}}),['FL','領班']);
assert.throws(()=>policy.hiddenFromConfig({}),/正式人資職稱設定/);
assert(html.includes('port79-hidden-job-titles.js?v=20261117-hr-hidden-v1'));
assert(html.indexOf('port79-hidden-job-titles.js')<html.indexOf('port79-leave-reference-visual.js'));
assert(html.includes('filter(job=>verified&&visibility.isVisible(job))'),'original leave-review filter must honor hidden job list');
const requests=[];
global.fetch=async url=>{
 requests.push(url);
 return {ok:true,json:async()=>({ok:true,config:{
  hrOrgOptionsV1:{jobTitles:['F/L','領班','司機']},
  hrOrgOptionsV2:{hiddenJobTitles:['領班','F / L']}
 }})};
};
(async()=>{
 assert.equal(policy.ready(),false);
 assert.equal(policy.isHidden('司機'),true,'deny all until official policy verified');
 await policy.load({gasUrl:'https://example.com/exec',token:'authorized'});
 assert.equal(policy.ready(),true);
 assert.equal(policy.isHidden('領班'),true);
 assert.equal(policy.isHidden('F/L'),true,'normalized hidden title');
 assert.equal(policy.isHidden(' F / L '),true);
 assert.equal(policy.isVisible('司機'),true);
 assert.equal(policy.isVisible('領班'),false);
 assert.equal(requests.length,1);
 assert(requests[0].includes('action=hrGetOrgOptions'),'get the actual HR org V2 settings');
 global.fetch=async()=>({ok:true,json:async()=>({ok:false,error:'HR permission denied'})});
 await assert.rejects(policy.load({gasUrl:'https://example.com/exec',token:'authorized',force:true}),/permission denied/);
 assert.equal(policy.ready(),false);
 assert.equal(policy.isVisible('司機'),false,'on failure never silently restore all choices');
 console.log('PASS official HR V2 hidden titles enforce leave job/name menus, fail closed without permission or fresh data');
})().catch(e=>{console.error(e);process.exitCode=1});
