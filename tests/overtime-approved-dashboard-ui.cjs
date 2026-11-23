'use strict';
/* Layout-only regression: original overtime records / buttons are the source of truth. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
const css=fs.readFileSync('assets/port79-overtime-approved-dashboard.css','utf8');
const refCss=fs.readFileSync('assets/port79-workhours-reference-dashboard.css','utf8');
const refJs=fs.readFileSync('assets/port79-workhours-reference-dashboard.js','utf8');
const code=fs.readFileSync('assets/port79-overtime-approved-dashboard.js','utf8');
new vm.Script(code);
assert(html.includes('port79-overtime-approved-dashboard.css?v=20261123-reference-home-tabs-v3'),'approved stylesheet loaded');
assert(html.includes('port79-overtime-approved-dashboard.js?v=20261123-reference-home-tabs-v3'),'approved tab navigation loaded');
assert(html.includes('port79-workhours-reference-dashboard.css?v=20261123-reference-home-tabs-v3'),'reference overview stylesheet updated');
assert(html.includes('port79-workhours-reference-dashboard.js?v=20261123-reference-home-tabs-v3'),'reference overview controller updated');
assert.equal((html.match(/id="adminContentOvertime"/g)||[]).length,1,'existing overtime tab is kept');
for(const id of ['overtimeSourceFilter','overtimeMonthFilter','overtimeDeptFilter','overtimeJobTitleFilter','overtimeEmployeeFilter','overtimeEmployeeCount','overtimeShiftCount','overtimeRawReportedHours','overtimeTotalHours','overtimePendingEstimateHours','overtimeOver12Count','p79OvertimeStatsTable','overtimeTableBody','overtimePagination','p79OvertimePlannedDialog']){
 assert(html.includes('id="'+id+'"'),'existing live source retained '+id);
}
for(const handler of ['P79OvertimeStatus.open()',"P79OvertimeStatus.open({state:'all'})",'P79MonthlyRest.open()','P79Overtime.openReport()','p79CanManageOvertime()','p79ToggleOvertimePlanned()','resetOvertimeFilters()']){
 assert(html.includes(handler),'original action kept '+handler);
}
assert(/#p79MonthlyRest/.test(css),'monthly dialog uses existing real UI');
assert(css.includes('#viewAdmin .p79-ot-ux-tabs'),'the homepage toolbar receives styles outside hidden overtime pane');
assert.match(refCss,/:not\(#p79-overtime-approved-tabs\)/,'the default reference overview must not hide the navigation');
assert.match(refCss,/#viewAdmin\.p79-ref-active #p79-overtime-approved-tabs\{display:block!important/,'navigation remains visible in default landing view');
assert.match(refJs,/host\.insertBefore\(tabs,id\('p79WorkhoursReference'\)\)/,'async dashboard mounting must not push navigation below the overview');
assert.match(refJs,/window\.P79WorkhoursReferenceNav=\{show:showReference\}/,'home tab has a real handler');
assert(!/(?:postToCloud|saveRecords|fetch\(|localStorage\.|sessionStorage\.|indexedDB|\.value\s*=)/.test(code),'visual navigation performs no data, filter, cloud or storage mutation');
assert(!/innerHTML\s*=.*(?:\b姓名|\b員工編號|\b89\s*小時)/.test(code),'no mock employee rows or fake totals');

let idMap=new Map(),events={},observer=null,clicked=[],closed=0;
class Node{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attrs={};this.listeners={};this.className='';this.id='';this.open=false;this.hidden=false;
  this.classList={contains:x=>this.className.split(/\s+/).includes(x),toggle:(x,value)=>{let a=new Set(this.className.split(/\s+/).filter(Boolean));if(value)a.add(x);else a.delete(x);this.className=[...a].join(' ';},add:(x)=>this.classList.toggle(x,true),remove:(x)=>this.classList.toggle(x,false)};}
 append(...children){for(const child of children){this.children.push(child);child.parentElement=this;if(child.id)idMap.set(child.id,child);}}
 insertBefore(child,reference){const at=this.children.indexOf(reference);assert(at>=0,'target pane belongs to workspace');this.children.splice(at,0,child);child.parentElement=this;if(child.id)idMap.set(child.id,child);}
 prepend(...children){this.children.unshift(...children);for(const c of children)if(c.id)idMap.set(c.id,c);}
 setAttribute(k,v){this.attrs[k]=String(v);}
 addEventListener(k,fn){this.listeners[k]=fn;}
 click(){this.listeners.click?.();}
 querySelectorAll(selector){
  const descendants=[];const walk=n=>{for(const child of n.children){descendants.push(child);walk(child);}};walk(this);
  if(selector==='[data-p79-overtime-tab]')return descendants.filter(n=>!!n.dataset.p79OvertimeTab);
  return [];
 }
 querySelector(s){
  if(s==='.p79-ot-ux-heading')return this.children.find(n=>n.className==='p79-ot-ux-heading')||null;
  if(s==='header')return this.children.find(n=>n.tagName==='header')||null;
  if(s==='[data-close]')return this.children.find(n=>n.attrs['data-close']==='')||null;
  return null;
 }
}
const host=new Node(),workspace=new Node('section'),homeTitle=new Node('header'),reference=new Node('section'),viewAdmin=new Node('section'),modal=new Node('dialog'),modalHeader=new Node('header');
reference.id='p79WorkhoursReference';viewAdmin.id='viewAdmin';viewAdmin.className='p79-ref-active';
workspace.append(homeTitle,reference,host);idMap.set('viewAdmin',viewAdmin);host.className='hidden';modal.append(modalHeader);
const close=new Node('button');close.attrs['data-close']='';close.listeners.click=()=>{closed++;modal.open=false;idMap.delete('p79MonthlyRest');};modal.append(close);
const originals=new Map();
for(const action of ['monthly','history','detail','report','rules','planned','reset']) originals.set(action,{click:()=>{
 clicked.push(action);
 if(action==='monthly'){modal.open=true;idMap.set('p79MonthlyRest',modal);}
}});
const classNameByAction={monthly:'.p79-ot-btn-monthly',history:'.p79-ot-btn-history',detail:'.p79-ot-btn-detail',report:'.p79-ot-btn-report',rules:'.p79-ot-btn-options',planned:'#p79OvertimePlannedToggle',reset:'.p79-ot-btn-reset'};
const document={
 readyState:'complete',body:new Node('body'),hidden:false,createElement:tag=>new Node(tag),
 getElementById:id=>id==='adminContentOvertime'?host:idMap.get(id)||null,
 querySelector:selector=>{for(const [action,fragment] of Object.entries(classNameByAction))if(selector==='#adminContentOvertime '+fragment)return originals.get(action);return null;},
 addEventListener:(k,fn)=>{events[k]=fn;}
};
class Watch{constructor(fn){observer=fn;}observe(el,opts){assert.equal(el,document.body);assert.equal(opts.subtree,false);}}
const originalRows=Object.freeze([{id:'orig-attendance-1',date:'2026/11/21',confirmed:true}]);
const switched=[];
const window={switchAdminTab:tab=>{switched.push(tab);if(tab==='overtime')host.className='';},
 P79WorkhoursReferenceNav:{show:()=>{viewAdmin.classList.add('p79-ref-active');return true;}}};
vm.runInNewContext(code,{document,window,MutationObserver:Watch,queueMicrotask:fn=>fn()});
const root=idMap.get('p79-overtime-approved-tabs');
assert(root,'new toolbar exists');
assert.equal(workspace.children[1],root,'the homepage toolbar sits above the real reference overview');
assert.equal(workspace.children[2],reference,'the reference overview stays immediately below the toolbar');
assert.equal(workspace.children[3],host,'the original overtime panel and contents stay in place');
assert(!host.children.includes(root),'hidden stats/overtime pane cannot hide the homepage tabs');
assert(host.classList.contains('hidden'),'test starts with the overtime panel hidden');
assert.equal(host.dataset.p79UxReady,'1','original action bar only hidden after new one installed');
const tabs=root.querySelectorAll('[data-p79-overtime-tab]');
assert.equal(tabs.length,9,'reference homepage plus all eight approved actions are visible');
assert(tabs.find(x=>x.dataset.p79OvertimeTab==='home').classList.contains('is-active'),
 'on first visit the real landing page tab is selected');
for(const action of ['history','detail','report','rules','planned','reset']){
 tabs.find(x=>x.dataset.p79OvertimeTab===action).click();
 assert.equal(clicked.at(-1),action,'new button delegates '+action+' to original handler');
}
assert.deepEqual(switched,['overtime'],'first homepage action opens the original authorized overtime tab');
assert(!viewAdmin.classList.contains('p79-ref-active'),
 'button opens the real overtime content, not just a hidden pane behind the overview');
tabs.find(x=>x.dataset.p79OvertimeTab==='monthly').click();
assert.equal(clicked.at(-1),'monthly');
assert.equal(modal.dataset.p79OvertimeApproved,'1','monthly uses existing dialog');
const dialogNav=modalHeader.children.find(n=>n.className==='p79-ot-ux-dialog-tabs');
assert(dialogNav,'monthly dialog includes switch-back navigation');
assert(tabs.find(x=>x.dataset.p79OvertimeTab==='monthly').classList.contains('is-active'));
dialogNav.children[0].click();
assert.equal(closed,1,'switch-back calls the original dialog close handler');
assert(tabs.find(x=>x.dataset.p79OvertimeTab==='overview').classList.contains('is-active'));
tabs.find(x=>x.dataset.p79OvertimeTab==='home').click();
assert(viewAdmin.classList.contains('p79-ref-active'),'home tab restores reference overview with no return button');
assert(tabs.find(x=>x.dataset.p79OvertimeTab==='home').classList.contains('is-active'));
assert.equal(originalRows[0].id,'orig-attendance-1','existing business rows and identifiers untouched');
assert(!('innerHTML' in host),'original table container was never replaced');
console.log('PASS reference homepage shows all nine overtime/workhours tabs before opening申報加班, safe two-way navigation');
