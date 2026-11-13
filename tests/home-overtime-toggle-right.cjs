'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/port79-reference-dashboard.css','utf8');
const js=fs.readFileSync('assets/port79-monthly-dashboard.js','utf8');
const begin=html.indexOf('<div class="p79d-kpi p79-ot-hours-kpi">');
const end=html.indexOf('</div></div>',begin);
assert(begin>0&&end>begin,'home overtime KPI markup exists');
const card=html.slice(begin,begin+1050);
const number=card.indexOf('id="p79DashOvertimeHours"');
const buttons=card.indexOf('id="p79DashOvertimeMode"');
const note=card.indexOf('id="p79DashOvertimeUnreported"');
assert(number>0&&buttons>number&&note>buttons,'number, switch and unreported text are siblings in stable order');
assert(card.includes('data-overtime-mode="actual"')&&card.includes('data-overtime-mode="converted"'),'both view choices remain available');
const scope=css.slice(css.lastIndexOf('/* 2026-11-13: place actual / converted controls at the RIGHT'));
assert(scope.length>1000,'late, high-priority layout override exists');
assert(scope.includes('grid-template-areas:"label switch" "number switch" "note note"!important'),
 'actual and converted buttons are in a right-hand column spanning the label and number, not below');
assert(scope.includes('grid-area:number!important')&&scope.includes('grid-area:switch!important'));
assert(scope.includes('justify-self:end!important')&&scope.includes('grid-area:note!important'));
assert(scope.includes('flex-direction:row!important')&&scope.includes('flex-wrap:nowrap!important'));
assert(scope.includes('height:94px!important;min-height:94px!important'));
assert(!scope.includes('grid-template-areas:"label label" "number number"'),'switch cannot fall below the number');
assert(html.includes('layout=20261113-buttons-right-v2'),'browser must load the new stylesheet');
assert(js.includes("setOvertimeDisplayMode(mode)")&&js.includes("btn.dataset.overtimeMode===overtimeDisplayMode"),
 'display-only change leaves mode-toggle logic untouched');
console.log('PASS home overtime KPI layout: number on left, actual/converted controls on right, unreported summary below, existing mode logic intact');
