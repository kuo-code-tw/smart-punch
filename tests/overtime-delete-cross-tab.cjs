const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const asset=fs.readFileSync('assets/port79-special-overtime.js','utf8');
const workhours=fs.readFileSync('work-hours/index.html','utf8');
const attendance=fs.readFileSync('attendance/index.html','utf8');
assert(workhours.startsWith('<!DOCTYPE html>'),'remove accidental output-truncation banner from app page');
const verification=workhours.indexOf("if(remaining?.overtimeReport||remaining?.overtime)throw Error('雲端仍存在此筆加班");
const broadcast=workhours.indexOf("localStorage.setItem('p79_schedule_overtime_changed_v1'");
assert(verification>=0&&broadcast>verification,'broadcast only after the server confirms deletion');
assert(attendance.includes("window.addEventListener('p79:schedule-overtime-changed'"),'attendance listens for schedule updates');
assert(attendance.includes('p79AttendanceOvertimeMonths.delete(key);')&&attendance.includes('p79LoadAttendanceOvertimeMonth(key);'),'attendance invalidates and reloads cached schedule data');
const listeners={},dispatched=[];
const doc={readyState:'complete',visibilityState:'visible',body:{dataset:{p79System:'attendance'}},addEventListener(){}};
class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail}}
const ctx={document:doc,location:{pathname:'/smart-punch/attendance/'},addEventListener:(type,fn)=>{listeners[type]=fn},dispatchEvent:event=>dispatched.push(event),CustomEvent,localStorage:{getItem:()=>null}};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(asset,ctx);
listeners.storage({key:'p79_schedule_overtime_changed_v1',newValue:JSON.stringify({month:'2026-10',empId:'468',date:'2026-10-23'})});
assert.equal(dispatched[0]?.type,'p79:schedule-overtime-changed');
assert.equal(dispatched[0]?.detail?.month,'2026-10');
console.log('PASS deleted overtime schedule invalidates attendance cache across tabs');
