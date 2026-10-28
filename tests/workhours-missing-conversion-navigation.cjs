'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('work-hours/index.html','utf8');
assert(source.includes('id="p79OvertimeMissingConversionPanel"'),'summary must have a visible missing-conversion list');
assert(source.includes('p79RenderOvertimeMissingConversion(rows,loadingWithoutRows);'),'summary list must refresh with filtered rows');
const begin=source.indexOf('        // 和「換算加班時數」統計使用相同的正式申報');
const end=source.indexOf('        function renderOvertimeStats() {',begin);
assert(begin>0&&end>begin);
const script=source.slice(begin,end);
new Function(script);
const target={empId:'AP1030037',name:'郭聰智',rosterDate:'2026-10-13',dateKey:'2026-10-13',reportVerified:true,
 overtimeReport:{id:'9f1b4ea7-cf1e-4df0-b2d8-097ed7d66bbc',category:'代',code:'代16-20',declaredHours:4,convertedHours:null,planned:false,status:'已核對出勤'}};
const other=Array.from({length:55},(_,i)=>({
 empId:'E'+i,name:'其他員工',rosterDate:'2026-10-'+String(1+(i%28)).padStart(2,'0'),reportVerified:true,
 overtimeReport:{id:'VALID'+i,declaredHours:8,convertedHours:12.7,code:'休08-16'}
}));
const duplicate={...target};
const declined={...target,reportVerified:false};
const planned={...target,overtimeReport:{...target.overtimeReport,planned:true}};
const rest={...target,overtimeReport:{...target.overtimeReport,attendanceState:'rest'}};
const invalid={...target,empId:'E91',overtimeReport:{...target.overtimeReport,id:'BAD',convertedHours:'abc'}};
const rows=[...other,target,duplicate,declined,planned,rest,invalid];
let output='',active=false,currentPage=1,renderCalls=0,scroll=false,focused=false;
const tr=Array.from({length:50},()=>({style:{},setAttribute(k,v){this[k]=v},scrollIntoView(){scroll=true},focus(){focused=true}}));
const panel={classList:{toggle(k,v){assert.equal(k,'hidden');active=!v}},set innerHTML(v){output=v},get innerHTML(){return output}};
const ctx={
 document:{getElementById(id){if(id==='p79OvertimeMissingConversionPanel')return panel;if(id==='overtimeTableBody')return {querySelectorAll(){return tr}}}},
 escapeHtml:v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
 alert:s=>{throw Error('Unexpected alert: '+s)},
 OVERTIME_PAGE_SIZE:50,
 renderOvertimeStats(){renderCalls++},
 p79WorkOvertimeFilteredRows:rows
};
const api=new Function('ctx',
 'let overtimeCurrentPage=1;const {document,escapeHtml,alert,OVERTIME_PAGE_SIZE,renderOvertimeStats,p79WorkOvertimeFilteredRows}=ctx;'+
 script+
 ';return {getPage:()=>overtimeCurrentPage,getItems:()=>p79OvertimePendingConversionRows,list:p79OvertimeMissingConversionRows,render:p79RenderOvertimeMissingConversion,jump:p79ShowOvertimeMissingConversion};')(ctx);
assert.equal(api.list(rows).length,2,'only one null and one invalid, no duplicate or planned items');
api.render(rows,false);
assert(active,'pending list should be visible');
assert(output.includes('郭聰智')&&output.includes('2026-10-13')&&output.includes('代16-20'));
assert(output.includes('換算時數未設定')&&output.includes('換算數值異常'));
assert(!output.includes('其他員工'));
api.jump(0);
assert.equal(api.getPage(),2,'jump to correct paginated page');
assert.equal(renderCalls,1);
assert.equal(tr[5].style.outline,'3px solid #f59e0b','highlight the exact matched row on page 2');
assert(scroll&&focused,'scroll and focus matched row');
api.render(other,false);
assert(!active,'hide panel when no conversion issue exists');
assert.equal(output,'');
console.log('PASS: pending conversion shows name/date/period, deduplicates, stays read-only and jumps to highlighted row');
