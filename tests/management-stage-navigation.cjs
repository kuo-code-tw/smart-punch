const fs = require('fs'), vm = require('vm'), assert = require('assert/strict'), path = require('path');
const systems = ['hr','attendance','leave','schedule','work-hours','aqc-efficiency','history-data'];
const listeners = {};
const source = fs.readFileSync(path.join(__dirname,'../integration-test/stage-navigation.js'),'utf8');
vm.runInNewContext(source,{URL,Set,location:{origin:'https://test.invalid',href:'https://test.invalid/smart-punch/integration-test/hr/'},document:{addEventListener(type,fn,capture){assert.equal(capture,true);listeners[type]=fn}}});
for (const type of ['click','auxclick']) {
  for (const system of systems) {
    for (const suffix of ['','index.html']) {
      const link = {href:`https://test.invalid/smart-punch/${system}/${suffix}?month=2026-10#view`};
      listeners[type]({target:{closest:()=>link}});
      assert.equal(link.href,`https://test.invalid/smart-punch/integration-test/${system}/?month=2026-10#view`);
    }
  }
  for (const href of ['https://external.invalid/smart-punch/hr/','https://test.invalid/smart-punch/','https://test.invalid/smart-punch/integration-test/hr/','https://test.invalid/smart-punch/assets/file.js']) {
    const link={href};listeners[type]({target:{closest:()=>link}});assert.equal(link.href,href);
  }
  listeners[type]({target:{closest:()=>null}});
}
for (const system of systems) {
  const html=fs.readFileSync(path.join(__dirname,'../integration-test',system,'index.html'),'utf8');
  assert(html.includes('/smart-punch/integration-test/data-cache.js?v=20261022-download-auth'));
  assert(html.includes('<head><script src="/smart-punch/integration-test/stage-navigation.js?v=20261017.2"></script>'));
}
assert.equal(fs.readFileSync(path.join(__dirname,'../integration-test/data-cache.js'),'utf8'),fs.readFileSync(path.join(__dirname,'../assets/port79-data-cache.js'),'utf8'));
console.log('PASS seven-system isolated navigation, modifier/middle-click paths, query/hash retention and external-link boundaries');
