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

const markerLine=html.split('\n').find(line=>line.includes('${showRosterDifference?(noPunchRest?'));
assert(markerLine,'verified no-punch rest must use a hover marker');
const renderMarker=vm.runInNewContext('(showRosterDifference,noPunchRest,combinedMarker,cellTitle,editorRosterValue,selected,scheduleEscapeHtml)=>`'+markerLine.trim()+'`');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const marker=(diff,rest,existing='')=>renderMarker(diff,rest,existing,'整班無上下班卡，按休息計算；原排班：中','中',{visibleCode:'休'},esc);
assert.match(marker(true,true),/p79-combined-dot/);
assert.match(marker(true,true),/title="整班無上下班卡，按休息計算；原排班：中"/);
assert.doesNotMatch(marker(true,true),/原排中｜休/);
assert.match(marker(true,false),/原排中｜休/);
assert.equal(marker(false,true),'');
assert.equal(marker(true,true,'existing-marker'),'','Never overlap an existing red marker');

for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
console.log('PASS separate stored roster edit selection, rest/attendance/overtime display, redraw, lock mode, and heartbeat');
