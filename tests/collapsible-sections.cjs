const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const dashboard=html.slice(html.indexOf('<section id="view-dashboard"'),html.indexOf('<section id="view-groups"'));
assert(!dashboard.includes('data-collapse-key'));assert(!dashboard.includes('data-collapse-action'));
assert.equal((html.match(/data-collapse-key=/g)||[]).length,18);
const stored=new Map([['port79_efficiency_collapse_v1:a','closed']]),events={};
function panel(key){return {dataset:{collapseKey:key},open:true,addEventListener(type,fn){this[type]=fn;}};}
const a=panel('a'),b=panel('b'),c=panel('c');const view={id:'view-weekly',querySelectorAll:()=>[a,b]};
const context={document:{querySelectorAll:()=>[a,b,c],addEventListener:(type,fn)=>events[type]=fn,getElementById:id=>id==='view-weekly'?view:{id:'view-dashboard',querySelectorAll:()=>[c]}},localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/port79-collapsible-sections.js'),'utf8'),context);
assert.equal(a.open,false);assert.equal(b.open,true);a.open=true;a.toggle();assert.equal(stored.get('port79_efficiency_collapse_v1:a'),'open');
function click(view,action){events.click({target:{closest:()=>({dataset:{collapseView:view,collapseAction:action}})}});}
click('view-weekly','close');assert.equal(a.open,false);assert.equal(b.open,false);assert.equal(c.open,true);
click('view-weekly','open');assert.equal(a.open,true);assert.equal(b.open,true);
click('view-dashboard','close');assert.equal(c.open,true);
context.localStorage.getItem=()=>{throw Error('blocked');};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/port79-collapsible-sections.js'),'utf8'),context);
console.log(JSON.stringify({passed:6,failed:0,scope:'Dashboard exclusion, native panels, per-section bulk toggles and storage fallback'}));
