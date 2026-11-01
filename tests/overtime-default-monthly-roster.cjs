'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const src=fs.readFileSync('schedule/index.html','utf8');
const start=src.indexOf("        const originalShift=String(meta.reportOriginalShift??");
const end=src.indexOf("        await P79Overtime.openReport(",start);
assert(start>=0&&end>start,'overtime picker default code not found');
const snippet=src.slice(start,end);
const evaluate=(meta,shift,target='',autoLabel='')=>{
 const scope={meta,target,monthlyScheduleData:{E001:{'2026-10-31':shift}},
   worker:'E001',dayStr:'2026-10-31',p79SubstituteShiftLabel:()=>autoLabel};
 return vm.runInNewContext('(function(){'+snippet+' return {category,code,originalShift};})()',scope);
};
assert.equal(evaluate({},'早').category,'延','early shift should default to workday extension, not rest day');
assert.equal(evaluate({},'中').category,'延');
assert.equal(evaluate({},'晚').category,'延');
assert.equal(evaluate({},'休').category,'休');
assert.equal(evaluate({restCategory:'國'},'早').category,'國','verified holiday category must win');
assert.equal(evaluate({overtimeReport:{category:'休',code:'休08-16'}},'早').category,'休','existing report category must be preserved');
assert.equal(evaluate({},'早','','休08-16').code,'','stale rest-day code must not carry into extension type');
assert.equal(evaluate({},'早','LEAVE_EMP').category,'代','formal leave coverage must win');
assert.equal(evaluate({overtimeOriginalShift:'休',overtimeType:'rest'},'早').category,'休','explicit original rest-day must not be forced to extension');
const blocks=[...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
blocks.forEach(b=>new vm.Script(b));
console.log('PASS: original system defaults overtime category to formal roster, preserves previous reports and special/rest evidence, all inline scripts parse');
