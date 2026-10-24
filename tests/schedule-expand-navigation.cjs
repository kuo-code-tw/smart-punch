const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const block=(a,b)=>{const p=html.indexOf(a);assert(p>=0,a);const q=html.indexOf(b,p);assert(q>p,b);return html.slice(p,q)};
const stored=new Map(),key='port79_schedule_role_collapse_v2';
const storage={getItem:k=>stored.get(k)||null,setItem(k,v){stored.set(k,v)},removeItem:k=>stored.delete(k)};
let renders=0;
const context=()=>({activeRoleTab:'ALL',activeGroupFilter:'ALL',MAIN_ROLES:['領班','指揮手','AQC','ARMG','F/L'],window:{},
 sessionStorage:{setItem(){}},localStorage:storage,console,
 p79RefreshRoleTabColors(){},renderRoleScheduleView(){renders++},buildRoleTabsAndRender(){renders++}});
function load(){
 const c=context();vm.createContext(c);
 vm.runInContext(block('    const P79_ROLE_COLLAPSE_KEY','    // Frozen people pane'),c);
 vm.runInContext(block('    function switchRoleTab(','    function setGroupFilter('),c);
 return c;
}
let c=load();
assert.equal(c.isScheduleRoleRosterCollapsed('ALL'),false);
c.switchRoleTab('ALL');assert.equal(c.isScheduleRoleRosterCollapsed('ALL'),true,'first repeat click collapses active tab');
assert.equal(JSON.parse(stored.get(key)).ALL,true,'collapse saved in browser');
c.switchRoleTab('ALL');assert.equal(c.isScheduleRoleRosterCollapsed('ALL'),false,'second repeat click expands');
c.setScheduleRoleRosterCollapsed(true,'AQC');
c.switchRoleTab('AQC');assert.equal(c.isScheduleRoleRosterCollapsed('AQC'),true,'switching preserves previously collapsed role');
c.switchRoleTab('AQC');assert.equal(c.isScheduleRoleRosterCollapsed('AQC'),false,'clicking collapsed role expands');
c.setScheduleRoleRosterCollapsed(true,'F/L');
c=load();assert.equal(c.isScheduleRoleRosterCollapsed('F/L'),true,'reopen loads per-role collapse state');
assert.equal(c.isScheduleRoleRosterCollapsed('AQC'),false,'each role persists independently');
c.switchRoleTab('F/L');assert.equal(c.isScheduleRoleRosterCollapsed('F/L'),true,'reopening a role honors saved collapse');
c.switchRoleTab('F/L');assert.equal(c.isScheduleRoleRosterCollapsed('F/L'),false,'same role toggles after reopen');
stored.set(key,'{invalid');c=load();assert.equal(c.isScheduleRoleRosterCollapsed('ALL'),false,'malformed browser preference safely ignored');
assert(renders>=8);
console.log('PASS repeated role clicks toggle collapse, per-role localStorage persists across reopen, switching does not reset state and corrupt storage is safe');
