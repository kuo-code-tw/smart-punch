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
assert(html.includes('layout=20261113-equal-attendance-kpi-v4'),'browser must load the latest equal-height stylesheet');
assert(scope.includes('width:auto!important;min-width:0!important;max-width:100%!important'),
 'KPI inner body must shrink after subtracting the left icon width');
assert(scope.includes('flex:1 1 0%!important')&&!scope.includes('width:100%!important;min-width:205px!important;flex:1 0 auto!important'),
 'old nonshrinking 100%-width flex item caused the buttons to overflow into next KPI');
assert(scope.includes('grid-template-columns:minmax(0,1fr) max-content!important'),
 'grid adapts its left column to the available space');
assert(scope.includes('box-sizing:border-box!important')&&scope.includes('overflow-x:auto!important'),
 'card clips extreme narrow content rather than painting over adjacent cards');
assert(scope.includes('@media (max-width:1250px)')&&scope.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'),
 'tablet and laptop sizes must allot two columns for attendance KPIs');
assert(scope.includes('@media (max-width:700px)')&&scope.includes('grid-column:1/-1!important'),
 'mobile overtime KPI spans both columns so the switch remains visible');
assert(js.includes("setOvertimeDisplayMode(mode)")&&js.includes("btn.dataset.overtimeMode===overtimeDisplayMode"),
 'display-only change leaves mode-toggle logic untouched');
const equalHeight=css.slice(css.lastIndexOf('/* 2026-11-13: all FOUR attendance overview cards'));
assert(equalHeight.includes('grid-auto-rows:94px!important'),'attendance grid uses a uniform 94px row height');
assert(equalHeight.includes('.p79d-attendance .p79d-kpis>.p79d-kpi{'),'all four cards, including the last alert button, share the same height rule');
assert(equalHeight.includes('height:94px!important;min-height:94px!important;max-height:94px!important'),
 'all cards have exactly the same 94px height, not 76px versus 94px');
assert(equalHeight.includes('box-sizing:border-box!important')&&equalHeight.includes('align-self:stretch!important'),
 'same outer height includes padding and border and keeps top/bottom aligned');
assert(html.includes('layout=20261113-equal-attendance-kpi-v4'),'new stylesheet version reaches browser');
assert(html.includes('class="p79d-kpi p79d-early-alert"'),'fourth alert card receives the same shared KPI rule');
console.log('PASS home overtime KPI layout: number on left, actual/converted controls on right, unreported summary below, existing mode logic intact');
