'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const css = fs.readFileSync('assets/port79-reference-dashboard.css','utf8');
const html = fs.readFileSync('index.html','utf8');
const sailing = fs.readFileSync('assets/port79-google-sheet-schedule.js','utf8');
const marker = 'PORT79 2026-11-02 — Public WAN HAI ship schedule dialog readability';
const begin = css.indexOf(marker);
assert(begin >= 0, 'public Wan Hai dialog contrast patch exists');
const patch = css.slice(begin);
const scope = '#p79PublicShipScheduleDialog';
assert(sailing.includes("dialog.id='p79PublicShipScheduleDialog'"), 'the patched ID is the actual public vessel dialog');
assert(sailing.includes("['英文船名','中文船名','靠泊碼頭','靠泊時間 ETB','離岸時間 ETD']"), 'four required columns remain');
assert(html.includes('port79-reference-dashboard.css?v=20261102-public-ship-contrast-v1'), 'fresh stylesheet URL busts cached CSS');
assert(!patch.includes('#p79Dashboard'), 'contrast patch is scoped to this one dialog, not dashboard-wide');
function rule(selector) {
  const start = patch.indexOf(selector + '{');
  assert(start >= 0, 'missing CSS selector: ' + selector);
  const contents = patch.slice(start + selector.length + 1, patch.indexOf('}',start));
  return contents;
}
function property(selector, key) {
  const body = rule(selector);
  const re = new RegExp('(?:^|[;\n])\\s*' + key + ':\\s*(#[0-9a-fA-F]{6})\\s*!important','i');
  const found = body.match(re);
  assert(found, 'missing high priority ' + key + ' for ' + selector);
  return found[1].toLowerCase();
}
function luminance(hex) {
  const rgb = [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(v=> v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4);
  return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
}
function contrast(a,b) {
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
const base = 'html body '+scope;
const dark = 'html[data-theme="dark"] body '+scope;
for (const prefix of [base,dark]) {
  const isDark = prefix === dark;
  const heading = property(prefix+' .p79-schedule-dialog-header h2','color');
  const bg = property(prefix,'background');
  assert(contrast(heading,bg)>=7, (isDark?'dark':'light')+' heading must satisfy AAA contrast');
  const tableBg = property(prefix+' .p79-schedule-table','background');
  const cellFg = property(prefix+' .p79-schedule-table td','color');
  const cellBg = property(prefix+' .p79-schedule-table td','background');
  const altBg = property(prefix+' .p79-schedule-table tbody tr:nth-child(even) td','background');
  const thFg = property(prefix+' .p79-schedule-table th','color');
  const thBg = property(prefix+' .p79-schedule-table th','background');
  assert(contrast(cellFg,cellBg)>=7, 'cell contrast must be AAA');
  assert(contrast(cellFg,altBg)>=7, 'alternating row contrast must be AAA');
  assert(contrast(thFg,thBg)>=7, 'header contrast must be AAA');
  assert(contrast(cellFg,tableBg)>=7, 'table background contrasts');
  assert(contrast(property(prefix+' .p79-schedule-dialog-header p,\n '+prefix+' .p79-schedule-dialog-disclaimer','color'),bg)>=4.5,'secondary text must be legible');
}
console.log('PASS public Wan Hai ship modal: dark/light AA+ and AAA table contrast, headings, captions, body rows and stylesheet cache refresh');
