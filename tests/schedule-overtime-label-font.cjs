'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const style=html.split('<style id="p79-substitute-time-fit">')[1]?.split('</style>')[0]||'';
assert(style.includes('.p79-shift-select.p79-substitute-time{'),'short time style exists');
assert(style.includes('font-size:13px!important;'),'short time code at least 13px');
const long=style.split('.p79-shift-select.p79-substitute-time-long{')[1]?.split('}')[0]||'';
assert(long.includes('font-size:12px!important'),'long time code enlarged from 8px to 12px');
assert(long.includes('font-weight:900!important'),'long time code remains readable');
assert(html.includes('visibleSubstituteLabel.length>5?\' p79-substitute-time-long\''),
 'existing long overtime labels still receive correct class');
assert(html.includes('\u0024{combinedMarker}'),'red attendance marker preserved');
assert(html.includes('class="p79-day-cell')||html.includes('class="p79-day-cell')||
 html.includes('class="p79-day-cell border-r'),'daily cell markup preserved');
console.log('PASS: 12px long / 13px short overtime labels, unchanged cell and red status marker');
