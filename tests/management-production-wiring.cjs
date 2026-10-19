const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
assert.equal(read('assets/port79-management-link.js'),read('integration-test/management-link.js'));
assert.equal(read('assets/port79-data-cache.js'),read('integration-test/data-cache.js'));
for(const system of ['hr','attendance','leave','schedule','work-hours','aqc-efficiency','history-data']){
 const html=read(system+'/index.html');
 assert(html.includes('<head><script>window.P79ManagementOptimizationMode=true;</script>'),system+' opt-in');
 assert.equal((html.match(/assets\/port79-management-link\.js\?v=(?:20261017\.official1|20261019-group-explicit)/g)||[]).length,1,system+' one bridge');
 assert(html.includes('/smart-punch/assets/port79-data-cache.js?v=20261018-full-refresh'),system+' versioned cache');
 assert(!html.includes('window.P79ManagementTestMode=true'),system+' production transport');
 assert(!html.includes('stage-navigation.js'),system+' production navigation');
 for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(script[1].trim())new vm.Script(script[1],{filename:system});
}
console.log('PASS seven production opt-ins, transport and navigation boundaries, inline syntax and byte-identical acceptance assets');
