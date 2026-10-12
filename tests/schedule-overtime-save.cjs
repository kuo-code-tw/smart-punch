const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('schedule/index.html','utf8');
function extract(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0);let pos=source.indexOf('{',start),depth=1;for(let i=pos+1;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(start,i+1);}throw Error(name);}
const context={};vm.createContext(context);vm.runInContext(extract(html,'p79BuildScheduleOvertimeMeta'),context);
const build=context.p79BuildScheduleOvertimeMeta;
// Snapshot of the production V38 schedule validator: frontend payloads must satisfy it.
const backend="function p79ValidateScheduleOvertime_(row, month) {\n  const data = row.schedule || {};\n  const meta = data.__meta || {};\n  Object.keys(meta).forEach(function(date) {\n    const m = meta[date] || {};\n    if (!m.overtimeType) return; // legacy metadata remains compatible\n    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || date.substring(0,7) !== month ||\n        isNaN(new Date(date + 'T12:00:00').getTime())) throw new Error('加班日期不屬於選取月份：' + date);\n    if (['extended','rest'].indexOf(m.overtimeType) === -1) throw new Error('加班類型錯誤：' + row.empId);\n    const validTime = function(t){ return /^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(t || '')); };\n    if (!validTime(m.overtimeStart) || !validTime(m.overtimeEnd) || m.overtimeStart === m.overtimeEnd)\n      throw new Error('加班起迄時間有誤：' + row.empId + ' ' + date);\n    const shift = String(data[date] || '').trim();\n    if (m.overtimeType === 'extended' && ['早','中','晚'].indexOf(shift) === -1)\n      throw new Error('延時加班人員必須已有正常班別：' + row.empId + ' ' + date);\n    if (m.overtimeType === 'rest' && (['休','特','年','事','病','公','喪',''].indexOf(String(m.overtimeOriginalShift === undefined ? shift : m.overtimeOriginalShift)) === -1 || ['早','中','晚'].indexOf(shift) === -1))\n      throw new Error('休假加班人員當日已有正常班別：' + row.empId + ' ' + date);\n  });\n}";vm.runInContext(extract(backend,'p79ValidateScheduleOvertime_'),context);
function accepts(meta,shift){context.p79ValidateScheduleOvertime_({empId:'AN1140032',schedule:{'2026-10-22':shift,__meta:{'2026-10-22':meta}}},'2026-10');}
const rest=build({},'rest','休','中','16:00','00:00',{});accepts(rest,'中');assert.equal(rest.overtimeOriginalShift,'休');
const overnight=build({},'rest','休','晚','00:00','08:00',{});accepts(overnight,'晚');
const extended=build({},'extended','早','早','16:00','18:00',{});accepts(extended,'早');
for(const original of ['休','早']){const shift=original==='休'?'晚':'早';const meta=build({},'substitute',original,shift,'20:00','23:00',{forEmpId:'OTHER'});accepts(meta,shift);assert.equal(meta.type,'substitute');assert.equal(meta.forEmpId,'OTHER');}
const edited=build(rest,'rest','中','晚','00:00','08:00',{});accepts(edited,'晚');assert.equal(edited.overtimeOriginalShift,'休');
for(const [start,end] of [['','08:00'],['08:00',''],['8:00','16:00'],['24:00','08:00'],['08:00','08:00']])assert.throws(()=>build({},'rest','休','早',start,end,{}));
for(const shift of ['','休'])assert.throws(()=>build({},'rest','休',shift,'08:00','16:00',{}));
assert.throws(()=>build({},'rest','早','早','08:00','16:00',{}));assert.throws(()=>build({},'extended','休','早','08:00','16:00',{}));assert.throws(()=>build({},'extended','早','晚','08:00','16:00',{}));assert.throws(()=>build({},'rest','年','早','08:00','16:00',{}));
// Parse every inline script, including UI wiring.
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
console.log('PASS: rest, extended, substitute, overnight, edits and invalid inputs; generated metadata passes deployed backend validation; inline scripts parse');
