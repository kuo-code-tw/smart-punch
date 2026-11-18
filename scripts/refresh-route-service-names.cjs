'use strict';
// Scheduled, public-source-only refresh. Never touches private vessel/HR/WORKING REPORT data.
const fs=require('node:fs');
const path=require('node:path');
const OUTPUT=path.join(__dirname,'../data-sources/route-service-names.json');
const SOURCE='https://www.tpct.com.tw/global-coverage/';
const ATLAS='https://atlas.flexport.com/service/code%3AWHLC%3A';
const CHECK_LIMIT=70;
const lexicon=Object.freeze({
 'ASIA':'亞洲','EAST ASIA':'東亞','NORTHEAST ASIA':'東北亞','SOUTH EAST ASIA':'東南亞',
 'SOUTHEAST ASIA':'東南亞','S.E.A':'東南亞','SEA':'東南亞',
 'JAPAN':'日本','JAPAN KANTO':'日本關東','JAPAN KANSAI':'日本關西',
 'KANTO':'關東','KANSAI':'關西','KOREA':'韓國','SOUTH KOREA':'韓國',
 'TAIWAN':'台灣','TW':'台灣','TWN':'台灣','CHINA':'中國大陸',
 'NORTH CHINA':'華北','SOUTH CHINA':'華南','PRC':'中國大陸',
 'PHILIPPINES':'菲律賓','L U Z O N':'呂宋','LUZON':'呂宋',
 'VIETNAM':'越南','HAIPHONG':'海防','HAI PHONG':'海防',
 'THAILAND':'泰國','INDONESIA':'印尼','MALAYSIA':'馬來西亞',
 'SINGAPORE':'新加坡','HONG KONG':'香港','HONGKONG':'香港',
 'XIAMEN':'廈門','FUZHOU':'福州','PORT KLANG':'巴生港',
 'MANILA':'馬尼拉','MYANMAR':'緬甸','CAMBODIA':'柬埔寨',
 'INDIA':'印度','PAKISTAN':'巴基斯坦','COLOMBO':'可倫坡',
 'OKINAWA':'沖繩','BUSAN':'釜山','MINDANAO':'民答那峨',
 'STRAITS':'海峽','AMERICA':'美洲','SOUTH AMERICA':'南美洲',
 'WEST COAST':'西岸','EAST COAST':'東岸','PACIFIC':'太平洋',
 'NORTH PACIFIC':'北太平洋','CENTRAL AMERICA':'中美洲'
});
function normalizeCode(value){
 const c=String(value||'').trim().toUpperCase();
 return /^[A-Z0-9]{2,6}$/.test(c)?c:'';
}
function decodeHtml(value){return String(value||'').replace(/&amp;/gi,'&').replace(/&nbsp;/gi,' ').replace(/&quot;/gi,'"').replace(/&#39;/g,"'").replace(/&#x([0-9a-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16))).replace(/&#([0-9]+);/gi,(_,v)=>String.fromCodePoint(Number(v)));}
function discoverCodes(text){
 const html=decodeHtml(text).replace(/<[^>]+>/g,' ');
 const results=new Set();
 const pattern=/航線代碼\s*[:：]\s*([A-Z0-9]{2,6})(?![A-Z0-9])(?:\s*\([NS]\))?/gi;
 for(const m of html.matchAll(pattern)){
  const code=normalizeCode(m[1]);if(code)results.add(code);
 }
 return [...results];
}
function englishService(html,code){
 const c=normalizeCode(code);if(!c)return '';
 const text=decodeHtml(html).replace(/\\u003c/gi,'<').replace(/\\u003e/gi,'>');
 // Accept only an exact WHLC service code, never another carrier's homonymous code.
 if(!new RegExp('WHLC(?:%3A|:|&#58;)'+c+'\\b','i').test(text))return '';
 const patterns=[
  new RegExp('WHLC\\s+'+c+'\\s+Service\\s+-\\s+([^<\\r\\n]{3,100})(?:<|$)','i'),
  new RegExp('WHLC(?:%3A|:)'+c+'\\s*\\(([^)]{3,100})\\)\\s+is\\s+Wan Hai','i')
 ];
 for(const re of patterns){
  const match=text.match(re);
  if(!match)continue;
  const name=match[1].replace(/\s+/g,' ').trim().replace(/\s*\|\s*Flexport.*$/i,'');
  if(name.length>=3&&name.length<=90&&/^[A-Za-z0-9 .,/()'&–—-]+$/.test(name))return name;
 }
 return '';
}
function translateEnglish(name){
 const text=String(name||'').toUpperCase().replace(/[‐‑–—]/g,'-')
  .replace(/\bSERVICE(?:S)?\b.*$/,'').replace(/\bEXPRESS\b/g,'').trim()
  .replace(/[\s-]+$/,'');
 if(!text)return '';
 const parts=text.split(/\s*[-/]\s*/).map(x=>x.trim().replace(/\s+/g,' ')).filter(Boolean);
 if(!parts.length||parts.length>6)return '';
 const translated=[];
 for(const part of parts){
  const zh=lexicon[part];if(!zh)return '';
  translated.push(zh);
 }
 return translated.join('－')+'航線';
}
async function request(url,timeoutMs=10000){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{
  const response=await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'Port79-route-directory-sync/1.0 (public metadata lookup)','Accept':'text/html'}});
  if(!response.ok)throw Error('HTTP '+response.status);
  return await response.text();
 }finally{clearTimeout(timer)}
}
async function refresh({read=request,file=OUTPUT}={}){
 const original=JSON.parse(fs.readFileSync(file,'utf8'));
 const routes=original.routes||{},unresolved=original.unresolved||{};
 let discovered=[];
 try{discovered=discoverCodes(await read(SOURCE))}catch(e){console.warn('Public carrier directory unavailable:',e.message)}
 const codes=[...new Set([...discovered,...Object.keys(unresolved)])]
  .map(normalizeCode).filter(Boolean).filter(code=>!routes[code]).slice(0,CHECK_LIMIT);
 let updated=0,observed=0;
 // Sequential and bounded; the public metadata provider is not our private data API.
 for(const code of codes){
  let english='';
  try{english=englishService(await read(ATLAS+code),code)}catch(e){console.warn('Metadata lookup '+code+': '+e.message)}
  if(!english)continue;
  observed++;
  const zh=translateEnglish(english);
  if(zh){
   routes[code]={zh,english,source:ATLAS+code};
   delete unresolved[code];updated++;
  }else if(!unresolved[code]||unresolved[code].english!==english){
   unresolved[code]={english,source:ATLAS+code};updated++;
  }
 }
 if(updated){
  const next={schema_version:1,updated_at:new Date().toISOString().slice(0,10),
    routes:Object.fromEntries(Object.entries(routes).sort(([a],[b])=>a.localeCompare(b))),
    unresolved:Object.fromEntries(Object.entries(unresolved).sort(([a],[b])=>a.localeCompare(b)))};
  fs.writeFileSync(file,JSON.stringify(next,null,2)+'\n');
 }
 console.log(JSON.stringify({discovered:discovered.length,checked:codes.length,observed,updated}));
 return {discovered,checked:codes.length,observed,updated};
}
if(require.main===module)refresh().catch(e=>{console.error(e);process.exitCode=1});
module.exports={discoverCodes,englishService,translateEnglish,refresh};
