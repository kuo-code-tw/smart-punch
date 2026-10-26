const fs=require('fs'),assert=require('assert/strict'),path=require('path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
assert(!fs.existsSync(path.join(root,'assets/port79-data-cache.js')));
assert(!fs.existsSync(path.join(root,'integration-test/data-cache.js')));
const systems=['hr','attendance','leave','schedule','work-hours','aqc-efficiency','history-data'];
for(const sys of systems){
 for(const prefix of ['', 'integration-test/']){
  const html=read(prefix+sys+'/index.html');
  assert(!/port79-data-cache\.js|integration-test\/data-cache\.js|Port79DataCache|showStartupPreview|p79StartupCacheStatus/.test(html),prefix+sys+' uses no deprecated shared cache');
 }
}
const home=read('index.html'),top=read('assets/port79-seven-top.js'),history=read('assets/port79-history-read.js');
assert(!/port79-data-cache\.js|Port79DataCache/.test(home));
assert(!/資料快取中心|Port79DataCache|p79ComputerSync|data-cache/.test(top));
assert(!/Port79DataCache/.test(history));
console.log('PASS no obsolete seven-system startup cache, menu, or shared module on production and staging pages');
