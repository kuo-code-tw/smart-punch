'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');
const a=html.indexOf('<style id="p79-overtime-planned-matched-font-20261028">');
const b=html.indexOf('</style>',a);
assert(a>=0&&b>a,'planned table scope exists');
const css=html.slice(a,b);
const rule=selector=>{
 const i=css.lastIndexOf(selector+'{');
 assert(i>=0,'missing CSS for '+selector);
 return css.slice(i,css.indexOf('}',i));
};
const row=rule('#adminContentOvertime #p79OvertimePlannedBody tr');
assert.match(row,/height:48px!important/,'all planned detail rows are 48px');
const td=rule('#adminContentOvertime #p79OvertimePlannedBody tr td');
for(const re of [/height:48px!important/,/font-size:13px!important/,/text-align:center!important/,
 /vertical-align:middle!important/,/padding:0 8px!important/,/white-space:nowrap!important/])
 assert.match(td,re,'every detail cell vertically/horizontally centered with readable type');
const th=rule('#adminContentOvertime #p79OvertimePlannedSection table thead th');
assert.match(th,/font-size:13px!important/);
assert.match(th,/text-align:center!important/);
assert.match(th,/vertical-align:middle!important/);
const action=rule('#adminContentOvertime #p79OvertimePlannedBody tr td.p79-planned-action-cell');
assert.match(action,/padding:0 6px!important/);
const buttons=css.slice(css.indexOf('#adminContentOvertime #p79OvertimePlannedBody .p79-planned-actions button,'));
assert.match(buttons,/height:26px!important/);
assert.match(buttons,/font-size:12px!important/);
assert.match(buttons,/white-space:nowrap!important/);
assert.match(css,/\.p79-planned-punch-entry\{[\s\S]*?flex-wrap:nowrap!important/,'missing-punch actions remain one line');
const period=rule('#adminContentOvertime #p79OvertimePlannedBody td:nth-child(5) .block');
assert.match(period,/display:inline!important/,'period correction note does not add second visual line');
const begin=html.indexOf('function p79RenderOvertimePlannedRows(');
const end=html.indexOf('\n        }',begin);
assert(begin>0&&end>begin);
const render=html.slice(begin,end+10);
for(const n of ['p79OvertimePendingPunchCell(row,\'IN\',todayKey,index)',
                'p79OvertimePendingPunchCell(row,\'OUT\',todayKey,index)',
                'p79OpenPlannedOvertimeReview(','p79DeletePlannedOvertimeRow('])
 assert(render.includes(n),'keep original action: '+n);
assert(!render.includes('p79-planned-reason'),'previously removed explanatory line stays removed');
for(const block of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
 if(block[1].trim())new vm.Script(block[1]);
}
console.log('PASS planned detail fixed 48px rows, centered 13px cells, 12px one-line buttons, inline period hint, original actions, all scripts parse');
