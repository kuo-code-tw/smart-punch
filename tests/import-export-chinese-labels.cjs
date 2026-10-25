'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const requirements={
  'attendance/index.html':['匯入考勤','匯出考勤','匯出考勤比對'],
  'work-hours/index.html':['匯入考勤','匯出考勤','匯入請假可休天數','匯出請假清單'],
  'schedule/index.html':['匯入排班','匯出排班','匯出排班名冊'],
  'leave/index.html':['匯入請假可休天數','匯出請假可休天數'],
  'hr/index.html':['匯入人資名冊','匯出人資名冊'],
  'aqc-efficiency/index.html':['匯入船舶資料','匯出船舶資料','匯入船舶月報'],
  'history-data/index.html':['匯入考勤歷史核對','匯出考勤歷史']
};
for(const [path,expected] of Object.entries(requirements)){
  const html=fs.readFileSync(path,'utf8');
  for(const label of expected)assert(html.includes(label),path+' 缺少：'+label);
  const displayLabels=[...html.matchAll(/<(?:button|label|a)\b[^>]*>([\s\S]{0,450}?)<\/(?:button|label|a)>/gi)]
    .map(m=>m[1].replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim())
    .filter(x=>/匯入|匯出|excel/i.test(x));
  const english=displayLabels.filter(x=>/\bexcel\b/i.test(x));
  assert.deepEqual(english,[],path+' 的顯示文字仍有英文 Excel');
}
const menu=fs.readFileSync('assets/port79-seven-top.js','utf8');
for(const name of ['匯入考勤','匯出考勤','匯出加班','匯入請假可休天數','匯出請假可休天數','匯入排班','匯出排班','匯入船舶資料','匯入人資名冊','匯出人資名冊']){
  assert(menu.includes(name),'共用功能選單缺少：'+name);
}
const ui=fs.readFileSync('assets/port79-ui-trim.js','utf8');
assert(!ui.includes("el.textContent='匯入'"),'不得把匯入按鈕縮成單字且移除子節點');
assert(!ui.includes("el.textContent='匯出'"),'不得把匯出按鈕縮成單字且移除子節點');
console.log('PASS: 七大系統匯入匯出顯示中文模組名稱，保留原本輸入元件');
