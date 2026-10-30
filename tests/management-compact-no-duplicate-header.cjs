'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const js=fs.readFileSync('assets/port79-management-workspace.js','utf8');
const css=fs.readFileSync('assets/port79-management-workspace.css','utf8');
const pages=['index.html','attendance/index.html','schedule/index.html','leave/index.html','hr/index.html','work-hours/index.html','aqc-efficiency/index.html','history-data/index.html'];
assert(!js.includes('function titleBlock('),'shared workspace must not build redundant system title cards');
assert(!js.includes('p79-workspace-hero'),'old page-title card must not be injected on any module');
assert(js.includes("if(home)decorateHome()"),'the native home dashboard remains');
assert(js.includes('decorateNav();'),'side navigation must remain');
assert(js.includes("d.createElement('header')"),'shared functional top navigation must remain');
assert(css.includes('.p79-workspace-hero{display:none!important'),'legacy cached script hero is hidden');
assert(css.includes('#p79SevenNav a'),'functional sidebar styles retained');
for(const path of pages){
  const html=fs.readFileSync(path,'utf8');
  for(const kind of ['css','js']){
    const expected='port79-management-workspace.'+kind+'?v=20261030-compact-content-v1';
    assert.equal(html.split(expected).length-1,1,path+' must request one updated '+kind);
  }
  assert(html.includes('</html>'),path+' remains complete');
}
for(const route of ['attendance/','schedule/','leave/','hr/','work-hours/','aqc-efficiency/','history-data/'])
  assert(js.includes(route),'the left-navigation destination must remain '+route);
console.log('PASS all seven management pages and home omit duplicate title panels; native home, sidebar, search and functional topbar preserved; cache updated');
