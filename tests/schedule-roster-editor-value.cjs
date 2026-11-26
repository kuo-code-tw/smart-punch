'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('schedule/index.html','utf8');
const start=html.indexOf('    function p79ApplyRosterEditorValue(');
const end=html.indexOf('    function applyScheduleAccessUi(',start);
assert(start>=0&&end>start);
const ctx={};vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
const apply=ctx.p79ApplyRosterEditorValue;
function cell(roster,visible){return {dataset:{p79RosterValue:roster},value:visible,options:['早','中','晚','休','例','國','__display__','__overtime__'].map(value=>({value,disabled:value==='__display__'}))};}
for(const [roster,visible] of [['中','休'],['休','__display__'],['晚','__overtime__'],['中','早']]){
 const el=cell(roster,visible);apply(el,false);assert.equal(el.value,visible);
 apply(el,true);assert.equal(el.value,roster);el.value='早';apply(el,true);assert.equal(el.value,'早','heartbeat does not reset pending selection');
 apply(el,false);assert.equal(el.value,visible);
}
const pending=cell('待排班','__display__');apply(pending,true);assert.equal(pending.value,'__display__');
const edited=cell('中','休');apply(edited,true);assert.equal(edited.value,'中','after a redraw, saved middle shift remains selected even when evidence displays rest');
assert(html.includes('data-p79-roster-value='));
assert(html.includes('if(!personnelChange)p79ApplyRosterEditorValue(el,editable)'));
assert(html.includes('原排${scheduleEscapeHtml(editorRosterValue)}｜${scheduleEscapeHtml(selected.visibleCode)}'));
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
console.log('PASS separate stored roster edit selection, rest/attendance/overtime display, redraw, lock mode, and heartbeat');
