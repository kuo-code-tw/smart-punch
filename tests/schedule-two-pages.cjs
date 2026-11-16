'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const section=(id)=>{
 const m=html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'));
 assert(m,'Missing page controller: '+id);
 new vm.Script(m[1]);
 return m[1];
};
assert(html.includes('id="p79DailyPageLink"'),'Daily URL navigation exists');
assert(html.includes('id="p79MonthlyPageLink"'),'Monthly URL navigation exists');
assert(html.includes('id="todaySchedulePanel"'),'Original daily roster is reused');
assert(html.includes('id="app-main-container"'),'Original monthly editor is reused');
assert(html.includes('id="p79DailyMonthMismatchNotice"'),'Past-month notice exists');
for(const key of ['saveCurrentTabSchedule','manualCloudSyncSchedule','scheduleEditLockStatus','p79RosterScroll','flushSchedulePendingWrites'])
 assert(html.includes(key),'Original data and save safeguards remain: '+key);
const controller=section('p79-schedule-two-page-controller');
section('p79-schedule-two-page-initializer');
const link=()=>({attributes:{},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]}});
const daily=link(),monthly=link(),note={textContent:''};
const listeners={},clock={todayRender:0,monthRender:0,resizes:0,flushes:0},location={href:'https://example.test/smart-punch/schedule/?view=daily',search:'?view=daily',hash:''};
const history={pushState(_s,_t,url){set(url)},replaceState(_s,_t,url){set(url)}};
function set(value){const u=new URL(value,location.href);location.href=u.href;location.search=u.search;location.hash=u.hash;}
let allowSave=false,dirty=false;
const dom={
 documentElement:{dataset:{p79SchedulePage:'daily'}},
 getElementById(id){return ({p79DailyPageLink:daily,p79MonthlyPageLink:monthly,p79SchedulePageNotice:note})[id]||null},
 addEventListener(name,callback){listeners[name]=callback}
};
const ctx={
 URL,URLSearchParams,location,history,document:dom,
 window:{addEventListener(name,callback){listeners[name]=callback},dispatchEvent(){clock.resizes++}},
 Event:class{constructor(type){this.type=type}},
 requestAnimationFrame(fn){fn()},
 renderTodaySchedulePanel(){clock.todayRender++},
 renderRoleScheduleView(){clock.monthRender++},
 todayScheduleExpanded:false,
 get port79ScheduleDirty(){return dirty},
 flushSchedulePendingWrites:async()=>{clock.flushes++;return allowSave}
};
vm.createContext(ctx);vm.runInContext(controller,ctx);
(async()=>{
 listeners.DOMContentLoaded();
 assert.equal(daily.attributes['aria-current'],'page','Daily page is active by default');
 assert.equal(clock.todayRender,1,'Today panel is shown when entering daily');
 assert.equal(ctx.todayScheduleExpanded,true,'Daily personnel lists open by default');
 assert(await ctx.p79SelectSchedulePage('month'));
 assert.equal(dom.documentElement.dataset.p79SchedulePage,'month');
 assert.equal(monthly.attributes['aria-current'],'page');
 assert.equal(clock.monthRender,1,'Month grid is rerendered after becoming visible');
 assert.equal(location.search,'?view=month','Month has a distinct shareable URL');
 dirty=true;
 assert.equal(await ctx.p79SelectSchedulePage('daily'),false,'Unsaved monthly edits block unsafe page switch');
 assert.equal(dom.documentElement.dataset.p79SchedulePage,'month');
 assert.equal(clock.flushes,1);
 assert.equal(location.search,'?view=month');
 allowSave=true;
 assert(await ctx.p79SelectSchedulePage('daily'));
 assert.equal(clock.flushes,2,'Existing save logic completes before leaving monthly editor');
 assert.equal(dom.documentElement.dataset.p79SchedulePage,'daily');
 assert.equal(location.search,'?view=daily');
 assert.equal(clock.monthRender,1,'Daily navigation does not cause a second monthly editor render');
 dirty=false;
 assert(await ctx.p79SelectSchedulePage('month'));
 set('?view=daily');listeners.popstate();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(dom.documentElement.dataset.p79SchedulePage,'daily','Browser back navigates without reload or losing data');
 const scope=html.slice(html.indexOf('function applyScheduleAttendanceMonthScope()'),html.indexOf('\n    let todayScheduleExpanded',html.indexOf('function applyScheduleAttendanceMonthScope()')));
 assert(scope.includes('p79DailyMonthMismatchNotice')&&scope.includes('card.hidden=!visible'),'Daily past-month notice does not show stale personnel');
 console.log('PASS two-page URLs, active navigation, safe editor switch, original state reuse, browser back, and month warning');
})().catch(error=>{console.error(error);process.exitCode=1});
