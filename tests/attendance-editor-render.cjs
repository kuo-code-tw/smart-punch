const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const hidden={editRecordModal:false,addRecordModal:true},timers=[];let renders=0;
const c={document:{getElementById:id=>({classList:{contains:()=>hidden[id]}})},setTimeout:fn=>{timers.push(fn);return timers.length},p79RenderOnlyVisibleAttendanceView:()=>renders++};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('assets/port79-attendance-editor-render.js','utf8'),c);
for(let i=0;i<50;i++)assert(c.p79DeferAttendanceTableRender());assert.equal(timers.length,1);assert.equal(renders,0);timers.shift()();assert.equal(timers.length,1);assert.equal(renders,0);
hidden.editRecordModal=true;hidden.addRecordModal=false;timers.shift()();assert.equal(renders,0);assert.equal(timers.length,1);
hidden.addRecordModal=true;timers.shift()();assert.equal(renders,1);assert.equal(timers.length,0);assert.equal(c.p79DeferAttendanceTableRender(),false);
hidden.editRecordModal=false;assert(c.p79DeferAttendanceTableRender());hidden.editRecordModal=true;timers.shift()();assert.equal(renders,2);
const html=fs.readFileSync('attendance/index.html','utf8');for(const name of ['p79RenderOnlyVisibleAttendanceView','renderAdminRecordsTable','renderAdminLiveTable']){const start=html.indexOf('function '+name+'()');assert(html.slice(start,start+220).includes('p79DeferAttendanceTableRender()'))}
for(const id of ['editRecordModal','addRecordModal'])assert(!html.match(new RegExp('id="'+id+'"[^>]+'))[0].includes('backdrop-blur'));
const helper=html.indexOf('src="../assets/port79-attendance-editor-render.js');assert(helper>=0&&helper<html.indexOf('id="p79-attendance-v5-clean-core"'));
console.log('PASS editor render guard coalesces 50 background redraws, waits across modal changes, refreshes once on close and never blocks closed-modal rendering; modal backdrop blur removed');
