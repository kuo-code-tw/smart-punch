(function(g){
'use strict';
const KEY='p79_official_calendar_annotations_v1';
const SOURCES={
 '2026':'https://www.dgpa.gov.tw/FileConversion?filename=dgpa%2Ffiles%2F202506%2Fa52331bd-a189-466b-b0f0-cae3062bbf74.csv&name=115%E5%B9%B4%E4%B8%AD%E8%8F%AF%E6%B0%91%E5%9C%8B%E6%94%BF%E5%BA%9C%E8%A1%8C%E6%94%BF%E6%A9%9F%E9%97%9C%E8%BE%A6%E5%85%AC%E6%97%A5%E6%9B%86%E8%A1%A8.csv&nfix=',
 '2027':'https://www.dgpa.gov.tw/FileConversion?filename=dgpa%2Ffiles%2F202607%2Ff538b1ff-ba60-4c63-9477-10db8e6612d1.csv&name=116%E5%B9%B4%E4%B8%AD%E8%8F%AF%E6%B0%91%E5%9C%8B%E6%94%BF%E5%BA%9C%E8%A1%8C%E6%94%BF%E6%A9%9F%E9%97%8C%E8%BE%A6%E5%85%AC%E6%97%A5%E6%9B%86%E8%A1%A8_utf8bom.csv&nfix='
};
const DISASTER='https://kpd.kcg.gov.tw/Content_List.aspx?n=413120497DC2AD9C';
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(_){return {}}}
function write(v){localStorage.setItem(KEY,JSON.stringify(v))}
function csv(line){const out=[];let cur='',quote=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quote&&line[i+1]==='"'){cur+='"';i++}else quote=!quote;}else if(ch===','&&!quote){out.push(cur);cur=''}else cur+=ch;}out.push(cur);return out;}
function parseCsv(raw,year){const lines=String(raw).replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);const out={};for(const line of lines){const cols=csv(line);let date=String(cols[0]||'').replace(/\D/g,'');if(date.length!==8||!date.startsWith(year))continue;const k=date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8);const flag=String(cols[2]||'').trim();if(flag!=='2')continue;const note=String(cols.slice(3).join(',')||'').trim();if(note&&!/星期[六日]|週[六日]|例行休假/i.test(note))out[k]={kind:/補假/.test(note)?'補假':'官方放假',name:note.slice(0,70),source:'DGPA'};}return out;}
function paint(date){const entry=read().days?.[date];return entry||null;}
async function pull(month){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('月份格式錯誤');const year=month.slice(0,4),url=SOURCES[year];if(!url)throw Error('此年度尚未設定政府日曆來源，沒有修改現有標示');const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),15000);let raw;try{const r=await fetch(url,{cache:'no-store',signal:ctl.signal});if(!r.ok)throw Error('HTTP '+r.status);raw=await r.text()}catch(err){throw Error('官方日曆無法直接連線（可能是跨網域限制）：'+err.message+'。未覆寫既有資料。')}finally{clearTimeout(t)}
const rows=parseCsv(raw,year);if(Object.keys(rows).length<3)throw Error('官方 CSV 格式或內容無法驗證，未寫入任何資料');
const saved=read();const days={...(saved.days||{})};for(const day of Object.keys(days)){if(day.startsWith(month)&&days[day]?.source==='DGPA')delete days[day]}for(const [date,item]of Object.entries(rows)){if(date.startsWith(month))days[date]=item}
write({days,updatedAt:new Date().toISOString(),month,source:url});
return Object.values(days).filter(x=>x.source==='DGPA').length;
}
g.P79OfficialCalendar={get:paint,pull,source:month=>SOURCES[String(month).slice(0,4)]||'',disasterSource:DISASTER,last:()=>read().updatedAt||''};
})(window);