const fs=require('node:fs');
const assert=require('node:assert/strict');
const js=fs.readFileSync('assets/port79-seven-top.js','utf8');
const css=fs.readFileSync('assets/port79-seven-top.css','utf8');
const workspaceCss=fs.readFileSync('assets/port79-management-workspace.css','utf8');
const systems=['attendance','workhours','leave','schedule','efficiency','hr','history'];
const menuSource=js.slice(js.indexOf('const MENU={'),js.indexOf('function scheduleLockMenuState()'));
const grouped=js.slice(js.indexOf('function buildMenu(sys){'),js.indexOf('function ensureStandardMenu(sys){'));
assert(menuSource.startsWith('const MENU={')&&grouped.startsWith('function buildMenu(sys){'));
const groupsSource=grouped.slice(grouped.indexOf(' const GROUPS=['),grouped.indexOf(' const items='));
const groupActionMatches=[...groupsSource.matchAll(/'([a-z][a-z-]+)'/g)].map(x=>x[1]);
const groupActions=new Set(groupActionMatches);
assert.equal(groupActions.size,groupActionMatches.length,'one action must have exactly one category');
for(const system of systems){
 const row=menuSource.match(new RegExp('(?:^|\\n)\\s*'+system+':\\[([^\\n]*)'));
 assert(row,'system missing: '+system);
 const ids=[...row[1].matchAll(/\['([^']+)'/g)].map(x=>x[1]);
 for(const id of ids)assert(groupActions.has(id),system+': action '+id+' is missing from menu groups');
}
for(const id of ['workflow','data-cache','global-theme','logout-system'])assert(groupActions.has(id));
for(const group of ['常用作業','統計與查詢','匯入與匯出','管理與設定','進階維護','顯示與協助','帳號']){
 assert(groupsSource.includes(group),'missing shared category '+group);
}
assert(grouped.includes('actionAllowed(sys,a)'),'permissions must still filter menu actions');
assert(grouped.includes('window.p79LogoutToSevenSystemHome()'),'logout must retain original handler');
assert(grouped.includes('runAction(sys,a)'),'existing actions must retain original handler');
assert(grouped.includes('menu.appendChild(accountInfo)'),'logged-in identity must remain');
assert(!grouped.includes("menu.classList.add('p79-hr-compact-menu')"),'HR should use same structure');
for(const selector of ['.p79-menu-sections','.p79-menu-items','data-group="maintenance"'])
 assert(css.includes(selector),'missing grouped menu style '+selector);
assert(workspaceCss.includes('Unified seven-system feature menu'),'workspace dropdown sizing missing');
for(const page of ['attendance','work-hours','leave','schedule','aqc-efficiency','hr','history-data']){
 const html=fs.readFileSync(page+'/index.html','utf8');
 const version=(html.match(/menu=20261112-clean-v1/g)||[]).length;
 assert.equal(version,3,page+' should refresh common JS/CSS plus workspace stylesheet');
}
console.log('PASS unified task-grouped menus across 7 systems; existing actions retained, permissions and handlers unchanged, all 7 pages cache-busted');
