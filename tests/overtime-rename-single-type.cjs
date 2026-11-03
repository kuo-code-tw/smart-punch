'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const page=fs.readFileSync('leave/index.html','utf8');
const status=fs.readFileSync('assets/port79-overtime-status.js','utf8');
const application=fs.readFileSync('assets/port79-overtime-application.js','utf8');
const legacy=['延','代16-20',4,6.02,'08','16','16','20','after','平日延長加班'];
const renamed=['延','代16-20',4,7.1,'08','16','16','20','after','平日延時加班'];
const base=['延','代16-20',4,6.02,'08','16','16','20','after'];
const oldReport={id:'historical-1',category:'延',typeName:'平日延長加班',code:'代16-20',declaredHours:4,convertedHours:6.02};
const oldSnapshot=JSON.stringify(oldReport);
const cloud={
 overtimeConversionRowsV1:[base,legacy,renamed],
 overtimeReportTypesV1:[['平日延長加班','延'],['平日延時加班','延']],
 overtimeDeletedBuiltinTypesV1:['平日延長加班']
};
const win={p79OvertimeContext:{config:()=>cloud}};
vm.runInNewContext(source,{window:win,Date,Intl,Set,Map,TextEncoder});
const api=win.P79Overtime;
assert.equal(api.canonicalType('平日延長加班'),'平日延時加班');
assert.equal(api.canonicalType('平日延時加班'),'平日延時加班');
const rows=api.validate(cloud.overtimeConversionRowsV1);
assert.equal(rows.length,3,'different historical conversions must remain intact');
assert.equal(rows.filter(r=>r[9]==='平日延長加班').length,1,'keep legacy rule metadata');
assert.equal(rows.filter(r=>r[9]==='平日延時加班').length,1,'keep new rule metadata');
assert.equal(api.validate(rows).length,3,'legacy rule validation must be idempotent');
const types=api.typeOptions(cloud,rows);
assert.equal(types.filter(r=>r.name==='平日延時加班').length,1,'exactly one canonical menu option');
assert(!types.some(r=>r.name==='平日延長加班'),'remove legacy duplicate from menu');
assert.equal(api.report(legacy).typeName,'平日延時加班','new report uses canonical name');
assert.equal(JSON.stringify(oldReport),oldSnapshot,'old report is immutable');
assert(!api.typeOptions({...cloud,overtimeDeletedBuiltinTypesV1:['平日延時加班']},rows)
 .some(r=>r.name==='平日延時加班'),'explicit deletion of canonical builtin is still respected');
const begin=page.indexOf('function p79PopulateCreateOvertimeTypes(){');
const end=page.indexOf('async function openAdminCreateLeave()',begin);
assert(begin>=0&&end>begin,'leave type-picker function exists');
const picker=page.slice(begin,end);
const select={value:'平日延長加班',innerHTML:''};
vm.runInNewContext(picker+';p79PopulateCreateOvertimeTypes();',{
 $:()=>select,window:win,esc:x=>String(x).replace(/&/g,'&amp;'),Set
});
assert.equal(select.value,'平日延時加班','old chosen value maps to canonical option');
assert.equal((select.innerHTML.match(/value="平日延時加班"/g)||[]).length,1,'leave picker renders canonical option once');
assert(!select.innerHTML.includes('平日延長加班'),'old option never reappears as pending');
assert(status.includes("report.typeName==='平日延長加班'?'平日延時加班'"),'historical status uses canonical display label');
assert(application.includes("report.typeName==='平日延長加班'?'平日延時加班'"),'historical application display uses canonical label');
new vm.Script(source);
for(const script of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))
 if(!/\bsrc=|application\/json|importmap/.test(script[1]))new vm.Script(script[2]);
console.log('PASS single 平日延時加班 menu across leave and overtime, legacy rules preserved, status/export labels unified');
