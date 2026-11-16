'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('assets/port79-schedule-two-line-toolbar.css','utf8');
const html=fs.readFileSync('schedule/index.html','utf8');
const js=fs.readFileSync('assets/port79-schedule-two-line-toolbar.js','utf8');
const marker='readability correction after direct desktop screenshot review';
const start=css.lastIndexOf(marker);
assert(start>0,'readability overrides must be after previous fixed-height styles');
const fix=css.slice(start);
assert(html.includes('port79-schedule-two-line-toolbar.css?v=20261116-readable-v2'),'updated cache-safe stylesheet used');
for(const id of ['p79ScheduleQuickBar','p79ScheduleCompactSecondRow',
 'p79ScheduleCompactFilter','main-role-tabs-container',
 'p79ScheduleCompactStatus','scheduleActiveEditorBanner','scheduleEditLockStatus',
 'p79ScheduleDataSource','p79ScheduleCompactDropdowns','month-picker']){
 assert(fix.includes('#'+id),'all live, unchanged toolbar groups have readable override: '+id);
}
for(const pattern of [/font-size:14px!important/,/font-size:16px!important/,
 /min-height:42px!important/,/flex-wrap:wrap!important/,
 /max-height:none!important/,/overflow:visible!important/,
 /grid-template-rows:none!important/,/white-space:normal!important/]){
 assert(pattern.test(fix),'readability setting present: '+pattern);
}
assert(!/font-size:(?:9|10|11)px!important/.test(fix),'no tiny 9–11px font sizes in final overrides');
assert(!/max-height:(?:3\d|4\d)px!important/.test(fix),'no forced tiny toolbar height in final overrides');
for(const businessWrite of ['saveCurrentTabSchedule(', 'manualRefreshSchedule(',
 'cloudPost(', 'localStorage.', 'sessionStorage.', 'innerHTML=', 'fetch(']){
 assert(!fix.includes(businessWrite),'only CSS, no business logic: '+businessWrite);
}
for(const marker of ['appendChild(roles)','status.appendChild(editor)',
 'status.appendChild(legend)','status.appendChild(source)',
 'popups.appendChild(details)']){
 assert(js.includes(marker),'existing live controls preserved: '+marker);
}
assert(html.includes('id="p79MonthlyPageLink"') && html.includes('排班表編輯'),
 'original page editor remains available');
console.log('PASS readable toolbar: 14–16px controls, natural wrapping, status untruncated, live DOM/edit locks retained');
