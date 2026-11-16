'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('schedule/index.html','utf8');
const js=fs.readFileSync('assets/port79-schedule-two-line-toolbar.js','utf8');
const css=fs.readFileSync('assets/port79-schedule-two-line-toolbar.css','utf8');
new vm.Script(js);
assert(html.includes('port79-schedule-two-line-toolbar.css?v='));
assert(html.includes('port79-schedule-two-line-toolbar.js?v='));
assert.equal((html.match(/port79-schedule-two-line-toolbar\.js\?v=/g)||[]).length,1);
assert.equal((html.match(/port79-schedule-two-line-toolbar\.css\?v=/g)||[]).length,1);
assert.equal(css.split('{').length,css.split('}').length,'CSS braces balanced');
for(const value of ['p79ScheduleQuickBar','scheduleRangeControl','p79QuickMonthHost',
 'main-role-tabs-container','p79ReferenceEditorHost','scheduleEditLockStatus',
 'scheduleActiveEditorBanner','schedule-legend-row','p79ScheduleDataSource',
 'p79PullOfficialHolidays','p79TyphoonDayButton','saveCurrentTabSchedule',
 'manualRefreshSchedule','data-schedule-edit'])
 assert(html.includes(value),'original live control preserved: '+value);
for(const marker of [/fetch\s*\(/,/localStorage/,/sessionStorage/,/innerHTML\s*=/,
 /remove\s*\(/,/replaceChildren\s*\(/,/onclick\s*=/,
 /saveCurrentTabSchedule\s*\(/,/manualRefreshSchedule\s*\(/,
 /leaveRecords/,/monthlyScheduleData/,/monthlyScheduleMeta/])
 assert(!marker.test(js),'presentation must never call/write business state: '+marker);

class Node{
 constructor(id='',tagName='DIV'){
  this.id=id;this.tagName=tagName;this.parentElement=null;this.children=[];
  this.dataset={};this.attributes={};this._classes=new Set();
  this.classList={add:(x)=>this._classes.add(x),contains:(x)=>this._classes.has(x)};
 }
 appendChild(child){
  if(child.parentElement){
   const arr=child.parentElement.children;
   arr.splice(arr.indexOf(child),1);
  }
  child.parentElement=this;this.children.push(child);return child;
 }
 append(...nodes){nodes.forEach(n=>this.appendChild(n));}
 setAttribute(k,v){this.attributes[k]=v;}
 querySelector(selector){
  if(selector!=='.p79-quick-actions')throw Error('unexpected query '+selector);
  return this.children.find(x=>x.id==='original-actions')||null;
 }
 querySelectorAll(selector){
  if(selector!==':scope > details')throw Error('unexpected query '+selector);
  return this.children.filter(x=>x.tagName==='DETAILS');
 }
 closest(selector){
  if(selector!=='#schedule-control-shell > div')throw Error('unexpected selector '+selector);
  let x=this;
  while(x){if(x.tagName==='DIV'&&x.parentElement?.id==='schedule-control-shell')return x;x=x.parentElement;}
  return null;
 }
 insertAdjacentElement(position,el){
  assert.equal(position,'afterend');
  const arr=this.parentElement.children;
  if(el.parentElement)el.parentElement.children.splice(el.parentElement.children.indexOf(el),1);
  el.parentElement=this.parentElement;
  arr.splice(arr.indexOf(this)+1,0,el);
 }
}
const nodes=new Map(),make=(id,tag='DIV')=>{
 const x=new Node(id,tag);if(id)nodes.set(id,x);return x;
};
const shell=make('schedule-control-shell'),
 header=make('original-header','HEADER'),quick=make('p79ScheduleQuickBar','SECTION'),
 source=make('p79ScheduleDataSource'),editor=make('p79ReferenceEditorHost'),
 lock=make('scheduleEditLockStatus'),banner=make('scheduleActiveEditorBanner'),
 legendWrap=make('legacy-legend-wrap'),legend=make('schedule-legend-row'),
 badge=make('overall-summary-badge'),tabsWrap=make('legacy-tabs-wrap'),
 roles=make('main-role-tabs-container'),month=make('p79QuickMonthHost'),
 actions=make('original-actions'),more=make('original-more','DETAILS'),
 legendMenu=make('original-legend','DETAILS');
shell.append(header);shell.append(quick);shell.append(editor);
shell.append(legendWrap);shell.append(tabsWrap);
quick.append(month);quick.append(actions);quick.append(source);
actions.append(more);actions.append(legendMenu);
editor.append(lock);editor.append(banner);
legendWrap.append(legend);legend.append(badge);
tabsWrap.append(roles);
const original=Object.fromEntries([...nodes.entries()].map(([id,x])=>[id,x]));
const doc={readyState:'complete',
 getElementById:id=>{
  const walk=n=>n.id===id?n:n.children.map(walk).find(Boolean)||null;
  return walk(shell);
 },
 createElement:tag=>new Node('',tag.toUpperCase()),
 addEventListener(){throw Error('DOMContentLoaded already passed');}
};
vm.runInNewContext(js,{document:doc});
const row=shell.children.find(x=>x.id==='p79ScheduleCompactSecondRow');
assert(row,'real second row inserted');
assert.equal(shell.children[1],quick,'month row remains first');
assert.equal(shell.children[2],row,'filter + status row is second');
const [filter,status]=row.children;
assert.equal(filter.id,'p79ScheduleCompactFilter');
assert.equal(status.id,'p79ScheduleCompactStatus');
assert.equal(roles.parentElement,filter,'real role buttons moved, not copied');
assert.equal(editor.parentElement,status,'real editor action moves, not cloned');
assert.equal(legend.parentElement,status,'original summary kept');
assert.equal(source.parentElement,status,'cloud source moves into status strip');
assert.equal(lock.parentElement,editor,'lock status remains in its original host');
assert.equal(banner.parentElement,editor,'real edit-lock actions remain with editor host');
assert.equal(month.parentElement,quick,'real month input stays live');
assert.equal(actions.parentElement,quick,'real action controls stay live');
const dropdowns=quick.children.find(x=>x.id==='p79ScheduleCompactDropdowns');
assert(dropdowns,'dropdowns remain outside the scroll-clipped action strip');
assert.equal(more.parentElement,dropdowns,'original More menu and handlers preserved');
assert.equal(legendMenu.parentElement,dropdowns,'original Legend remains openable');
assert.equal(legendWrap.attributes['data-p79-compact-vacated'],'true');
assert.equal(tabsWrap.attributes['data-p79-compact-vacated'],'true');
for(const [id,originalNode] of Object.entries(original))assert.equal(nodes.get(id),originalNode,'no replacement of original '+id);
const count=shell.children.length;
vm.runInNewContext(js,{document:doc});
assert.equal(shell.children.length,count,'double-init does not clone toolbars');
assert(css.includes('flex-wrap:nowrap!important'),'toolbar buttons do not form extra lines');
assert(css.includes('overflow-x:auto!important'),'narrow screens can scroll to ALL controls');
assert(css.includes('#scheduleActiveEditorBanner .schedule-editor-title'),
 'primary edit-lock status remains visible');
console.log('PASS real month row + real role/status row; original selectors, edit buttons, cloud source, locks and business data untouched');
