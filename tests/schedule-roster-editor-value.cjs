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
assert(html.includes("const previewDifference=showRosterDifference?'預排'+editorRosterValue+'｜'+selected.visibleCode:'';"));
assert(html.includes("const cellTitle = [previewDifference,"));
assert(html.includes("[previewDifference,'同日有加班與休假，點此查看']"));
const markerLine=html.split('\n').find(line=>line.includes('${showRosterDifference&&!combinedMarker?'));
assert(markerLine,'all roster differences must use a hover marker');
const renderMarker=vm.runInNewContext('(showRosterDifference,combinedMarker,cellTitle,scheduleEscapeHtml)=>`'+markerLine.trim()+'`');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
for(const label of ['預排中｜休','預排中｜休16-24','預排早｜晚']){
 const marker=renderMarker(true,'',label,esc);
 assert.match(marker,/p79-combined-dot/);
 assert(marker.includes('title="'+label+'"'));
 assert(marker.endsWith('>●</span>'));
}
assert.equal(renderMarker(false,'','',esc),'');
assert.equal(renderMarker(true,'existing-marker','預排中｜休16-24',esc),'','Never overlap an existing red marker');

for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
console.log('PASS separate stored roster edit selection, rest/attendance/overtime display, redraw, lock mode, and heartbeat');
