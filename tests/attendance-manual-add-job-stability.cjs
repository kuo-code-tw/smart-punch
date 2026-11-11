const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../attendance/index.html'), 'utf8');
const modalStart = html.indexOf('<!-- 彈出式新增補打卡 Modal -->');
const rowEnd = html.indexOf('📅 點選日期', modalStart);
assert(modalStart >= 0 && rowEnd > modalStart, 'manual punch modal is present');
const modalHeader = html.slice(modalStart, rowEnd);
assert.match(modalHeader, /id="p79AddJobEmployeeRow"/);
assert(modalHeader.indexOf('id="addModalJobSelect"') < modalHeader.indexOf('id="addModalEmpSelect"'), 'job must be on the left');
assert.doesNotMatch(modalHeader, /addModalDeptSelect|選擇部門/, 'department picker removed from manual punch');

const initStart = html.indexOf('        function initDropdowns() {');
const initEnd = html.indexOf('            const today = new Date();', initStart);
assert(initStart >= 0 && initEnd > initStart);
const initPreface = html.slice(initStart, initEnd);
assert.doesNotMatch(initPreface, /addModalDeptSelect|onAddModalDeptChange/, 'background refresh must never reset modal job / employee selection');

function fn(name) {
    const start = html.indexOf('        function ' + name + '(');
    assert(start >= 0, name + ' is present');
    const lineEnd = html.indexOf('\n', start);
    const firstLine = html.slice(start, lineEnd);
    if (firstLine.endsWith('}')) return firstLine;
    const close = html.indexOf('\n        }', start);
    assert(close > start, name + ' can be extracted');
    return html.slice(start, close + 10);
}
function makeSelect() {
    const select = { options: [], _value: '', get value() { return this._value; }, set value(x) {
        this._value = this.options.some(opt => opt.value === String(x)) ? String(x) : '';
    }};
    Object.defineProperty(select, 'innerHTML', {
        set(htmlText) {
            this.html = String(htmlText);
            this.options = [...this.html.matchAll(/<option value="([^"]*)">/g)].map(m => ({ value: m[1] }));
            this._value = this.options[0]?.value || '';
        },
        get() { return this.html || ''; }
    });
    return select;
}
const employees = [
    { empId: 'AN1150002', name: '黃信興', dept: '第二事業處', jobTitle: '指揮手' },
    { empId: 'AP0790007', name: '吳顯文', dept: '第二事業部', jobTitle: '指揮手' },
    { empId: 'AP1110001', name: '測試員', dept: '第二事業部', jobTitle: '司機' }
];
const nodes = {
    addModalJobSelect: makeSelect(),
    addModalEmpSelect: makeSelect(),
    addRecordModal: { dataset: {} }
};
const context = {
    document: { getElementById: id => nodes[id] || null },
    getAdminAttendanceEmployees: () => employees,
    attendanceEmployeeOptionValue: e => e?.empId || '',
    attendanceEmployeeDisplayLabel: e => e.name + ' (' + e.empId + ')',
    findAttendanceEmployeeByOptionValue: id => employees.find(e => e.empId === id) || null,
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
    showToast: () => {},
    p79AddStrokeSorter: new Intl.Collator('zh-Hant-TW-u-co-stroke', { numeric: true }),
    Intl, String
};
vm.createContext(context);
for (const name of [
    'p79AddJob', 'p79AddEmployeesSorted', 'p79AddRefreshEmployeeOptions',
    'p79AddRefreshJobs', 'p79AddModalJobChanged',
    'p79AddModalEmployeeChanged', 'initAddModalDropdownsFast'
]) vm.runInContext(fn(name), context);
context.initAddModalDropdownsFast();
nodes.addModalJobSelect.value = '指揮手';
context.p79AddModalJobChanged();
assert.equal(nodes.addModalJobSelect.value, '指揮手');
assert.deepEqual(nodes.addModalEmpSelect.options.map(opt => opt.value), ['AP0790007', 'AN1150002'].sort((a,b) => employees.find(x=>x.empId===a).name.localeCompare(employees.find(x=>x.empId===b).name,'zh-Hant-TW-u-co-stroke')), 'same job contains all departments');
nodes.addModalEmpSelect.value = 'AN1150002';
context.p79AddModalEmployeeChanged();
context.p79AddRefreshJobs();
context.p79AddRefreshEmployeeOptions();
assert.equal(nodes.addModalJobSelect.value, '指揮手', 'background style refresh should preserve chosen title');
assert.equal(nodes.addModalEmpSelect.value, 'AN1150002', 'refresh should preserve chosen employee');
context.initAddModalDropdownsFast(employees[1]);
assert.equal(nodes.addModalJobSelect.value, '指揮手', 'row-based manual add chooses original employee job');
assert.equal(nodes.addModalEmpSelect.value, 'AP0790007', 'row-based manual add chooses correct employee');
nodes.addRecordModal.dataset.p79LockedEmployeeKey = 'AP0790007';
nodes.addModalJobSelect.value = '司機';
context.p79AddModalJobChanged();
assert.equal(nodes.addModalEmpSelect.value, 'AP0790007', 'locked pairing preserves employee even if job is inconsistent');
console.log('PASS manual punch: left job / right employee, no department, cross-department jobs, stable selections, row identity protection');
