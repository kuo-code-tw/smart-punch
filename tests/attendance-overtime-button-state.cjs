const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('attendance/index.html', 'utf8');
function extract(name) {
    const start=html.indexOf('        function '+name+'('),end=html.indexOf('\n        }',start);
    assert(start>0&&end>start,name+' must exist');
    return html.slice(start,end+10);
}
const date = '2026-10-23';
const other = '2026-10-24';
let specialDays = [];
const loaded = [];
const context = {
    Map, Set, String,
    p79AttendanceOvertimeMonths: new Map(),
    attendanceRowDateIso: row => row.dateKey,
    p79AttendanceOvertimeDate: row => row.accountingDateKey || row.dateKey,
    getAttendanceTimestamp: record => record.at,
    getAttendanceEmployeeMasterToken: () => 'TOKEN',
    p79LoadAttendanceOvertimeMonth: month => loaded.push(month),
    window: {P79SpecialOvertime: {forShift: () => specialDays.map(day => ({date: day}))}}
};
vm.createContext(context);
for(const name of ['p79AttendanceSpecialParts','p79AttendanceLoadViewMonth','p79AttendanceRosterRows','p79AttendanceOvertimeSubmissionState']) vm.runInContext(extract(name),context);
const row = {empId: 'OTHER-ID', dateKey: date, clockIn: {id: 'IN', at: 1}, clockOut: {id: 'OUT', at: 2}};
const employee = {empId: 'E1'};
const active = id => ({overtimeReport: {id, code: '颱08-12'}});
function setMonth(month, meta, ready = true) {
    context.p79AttendanceOvertimeMonths.set(month, {
        token: 'TOKEN', ready, rows: [{empId: 'E1', schedule: {__meta: meta}}]
    });
}
function status() {return context.p79AttendanceOvertimeSubmissionState(row, employee);}
assert.equal(status(), 'pending', 'unknown data must not permit another declaration');
setMonth('2026-10', {});
assert.equal(status(), 'none', 'no declaration allows action');
setMonth('2026-10', {[date]: {restQuotaOvertime: true, overtime: true, overtimeStart: '08:00'}});
assert.equal(status(), 'none', 'calculated and legacy overtime is not a declaration');
setMonth('2026-10', {[date]: active('A')});
assert.equal(status(), 'reported', 'persisted report hides action even for a 0-hour calculated row');
setMonth('2026-10', {[date]: {...active('A'), overtimeExcluded: true}});
assert.equal(status(), 'none', 'excluded report is not active');
setMonth('2026-10', {[date]: {...active('A'), overtimeRevocations: [{confirmed:true, reportId:'A'}]}});
assert.equal(status(), 'none', 'confirmed deletion restores action');
setMonth('2026-10', {[date]: {...active('A'), overtimeRevocations: [{confirmed:false, reportId:'A'}]}});
assert.equal(status(), 'reported', 'unconfirmed deletion does not restore action');
setMonth('2026-10', {[date]: {overtimeReports: [{id:'A'}, {id:'B'}], overtimeRevocations: [{confirmed:true,reportId:'A'}]}});
assert.equal(status(), 'reported', 'one of multiple declarations remains');
setMonth('2026-10', {[date]: {overtimeReports: [{id:'A'}, {id:'B'}], overtimeRevocations: [{confirmed:true,reportId:'A'},{confirmed:true,reportId:'B'}]}});
assert.equal(status(), 'none', 'last confirmed deletion restores action');
specialDays = [other];
setMonth('2026-10', {[date]: {overtimeReport: {id:'A'}, overtimeRevocations: [{confirmed:true,reportId:'A'}]}, [other]: active('B')});
assert.equal(status(), 'reported', 'second special-day declaration still hides action');
setMonth('2026-10', {[date]: {overtimeReport: {id:'A'}, overtimeRevocations: [{confirmed:true,reportId:'A'}]}, [other]: {}});
assert.equal(status(), 'none', 'both special-day declarations deleted');
specialDays = ['2026-11-01'];
setMonth('2026-10', {});
assert.equal(status(), 'pending', 'cross-month declaration requires both months to load');
setMonth('2026-11', {'2026-11-01': active('NEXT')});
assert.equal(status(), 'reported', 'cross-month report hides action');
setMonth('2026-11', {'2026-11-01': {}});
assert.equal(status(), 'none', 'cross-month deletion restores action');
setMonth('2026-11', {'2026-11-01': active('NEXT')}, false);
assert.equal(status(), 'pending', 'stale month data cannot authorize reporting');
specialDays = [];
setMonth('2026-10', {[date]: active('A')});
assert.equal(context.p79AttendanceOvertimeSubmissionState(row, {empId:'E2'}), 'none', 'other worker report does not hide this worker action');
assert(html.includes("const overtimeSubmissionState = p79AttendanceOvertimeSubmissionState(row, reportEmployee, overtimeView);"));
assert(html.includes("overtimeSubmissionState === 'none' ? `<button"), 'reported rows have no submit button markup');
assert(html.includes("if (p79AttendanceOvertimeSubmissionState(row, employee) !== 'none')"), 'stale click must be rejected');
assert(loaded.includes('2026-11'), 'cross-month request is loaded');
console.log('PASS submission button hidden for active declarations, restored only after deletions, including multiple/cross-month reports');
