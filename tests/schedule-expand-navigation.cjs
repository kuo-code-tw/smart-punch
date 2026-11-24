const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const block=(a,b)=>{const p=html.indexOf(a);assert(p>=0,a);const q=html.indexOf(b,p);assert(q>p,b);return html.slice(p,q)};
const stored=new Map(),key='port79_schedule_role_collapse_v2';
const storage={getItem:k=>stored.get(k)||null,setItem(k,v){stored.set(k,v)},removeItem:k=>stored.delete(k)};
let renders=0;
const context=()=>({activeRoleTab:'ALL',activeGroupFilter:'ALL',p79ScheduleHiddenJobTitles:new Set(),MAIN_ROLES:['領班','指揮手','AQC','ARMG','F/L'],window:{},
 sessionStorage:{setItem(){}},localStorage:storage,console,
 p79RefreshRoleTabColors(){},renderRoleScheduleView(){renders++},buildRoleTabsAndRender(){renders++}});
function load(){
 const c=context();vm.createContext(c);
 vm.runInContext(block('    const P79_ROLE_COLLAPSE_KEY','    // Frozen people pane'),c);
 vm.runInContext(block('    function p79ScheduleTitleKey(','    window.P79ScheduleTitleHidden='),c);
 vm.runInContext(block('    function switchRoleTab(','    function setGroupFilter('),c);
 return c;
}
let c=load();
assert.equal(c.isScheduleRoleRosterCollapsed('ALL'),false);
c.setScheduleRoleRosterCollapsed(true,'ALL');assert.equal(JSON.parse(stored.get(key)).ALL,true,'explicit collapse saved in browser');
c.switchRoleTab('ALL');assert.equal(c.isScheduleRoleRosterCollapsed('ALL'),false,'clicking active role reopens roster');
c.switchRoleTab('ALL');assert.equal(c.isScheduleRoleRosterCollapsed('ALL'),false,'repeated click never hides roster');
c.setScheduleRoleRosterCollapsed(true,'AQC');
c.switchRoleTab('AQC');assert.equal(c.isScheduleRoleRosterCollapsed('AQC'),false,'switching opens previously collapsed role');
c.setScheduleRoleRosterCollapsed(true,'F/L');c=load();assert.equal(c.isScheduleRoleRosterCollapsed('F/L'),true,'reopen loads per-role collapse state');
assert.equal(c.isScheduleRoleRosterCollapsed('AQC'),false,'each role persists independently');
c.switchRoleTab('F/L');assert.equal(c.isScheduleRoleRosterCollapsed('F/L'),false,'selecting a role opens it');
c.p79ScheduleHiddenJobTitles.add('AQC');const beforeHidden=renders;c.switchRoleTab('AQC');assert.equal(c.activeRoleTab,'F/L','hidden titles do not open');assert.equal(renders,beforeHidden,'denied title must not cause a render');
c.setScheduleRoleRosterCollapsed(true,'F/L');assert.equal(renders,beforeHidden+1,'explicit collapse renders once');
stored.set(key,'{invalid');c=load();assert.equal(c.isScheduleRoleRosterCollapsed('ALL'),false,'malformed browser preference safely ignored');
assert(renders>=8);
console.log('PASS explicit role collapse persists; clicking roles opens roster; hidden titles blocked and corrupt storage is safe');
