'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const css=fs.readFileSync('aqc-efficiency/route-management-dashboard.css','utf8');
const tabs=['dashboard','multi-rod','compare','terminal','personstats','weekly','dispatch','gate'];
const navBlock=html.slice(html.indexOf('<section id="efficiencyMainTabs"'),html.indexOf('</section>',html.indexOf('<section id="efficiencyMainTabs"')));
assert.equal((navBlock.match(/data-tab="/g)||[]).length,8,'original eight shared tabs remain');
for(const name of tabs){
 assert(navBlock.includes('data-tab="'+name+'"'),'original '+name+' tab in main tab bar');
 assert(navBlock.includes("switchTab('"+name+"',this)"),name+' keeps original click action');
}
assert(html.includes('id="efficiencySharedYear"'),'shared year picker preserved');
assert(html.includes('id="routeTopMonthFilter"'),'route-specific month picker preserved');
assert(html.includes('id="routeManagerSyncBtn"'),'route-specific vessel sync preserved');
assert(html.includes('id="routeManagerCompareNav"'),'route-specific comparison control preserved');
assert(html.includes('id="routeManagerExportBtn"'),'route-specific report export preserved');
assert(html.includes('class="p79-rm-profile"'),'route home shortcut preserved');
assert(!css.includes('body:has(#view-compare:not(.hidden)) #efficiencyMainTabs{display:none!important}'),'route no longer hides the main tabs');
assert(css.includes('body:has(#view-compare:not(.hidden)) #efficiencyMainTabs{'),'route-specific main menu visible');
assert(css.includes('display:flex!important;position:sticky!important;top:0!important'),'shared navigation sticky and aligned at top');
assert(css.includes('#view-compare .p79-rm-brand{display:none!important}'),'duplicate blue system brand removed');
assert(css.includes('#view-compare .p79-rm-topnav>button:nth-child(-n+3){display:none!important}'),'duplicate route, vessel and stats tabs removed');
assert(css.includes('#view-compare .p79-rm-topnav>button{'),'route comparison/export remain visible as compact actions');
assert(css.includes('#view-compare .p79-rm-top-actions{'),'month, sync and profile remain visible as utility actions');
assert(css.includes('@media(max-width:960px)'),'mobile layout keeps horizontal menu scrolling');
console.log('PASS route menu: restored original 8 colored tabs and preserved route-only controls');
