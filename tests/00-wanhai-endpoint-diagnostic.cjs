'use strict';
// Temporary public-site diagnostics only. Sends no credentials or POST requests.
// This file will be deleted after its diagnostic results are inspected.
const {URL}=require('url');
const origin='https://khhtml.wanhai.com';
async function get(path){
 const u=new URL(path,origin);
 if(u.origin!==origin)throw Error('not allowed origin');
 const c=new AbortController(), t=setTimeout(()=>c.abort(),12000);
 try{
  const r=await fetch(u,{signal:c.signal,redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; PORT79PublicDiagnostic/1.0)','Accept':'text/html,application/javascript,*/*'}});
  const text=(await r.text()).slice(0,2500000);
  console.log('[WH]',u.pathname,'status',r.status,'type',r.headers.get('content-type'),'size',text.length,'redirect',new URL(r.url).pathname);
  return {text,url:u,status:r.status};
 }catch(e){console.log('[WH]',u.pathname,'error',String(e.message).slice(0,120));return {text:'',url:u,status:0};}
 finally{clearTimeout(t)}
}
function findRelevant(path,body){
 const re=/(Eways_GetVesselSchedule|SailingScheduleList|Eways_.*?Schedule|\/(?:api|web|ajax)\/[^\s'"<>]{0,130})/gi;
 let results=[],m;while((m=re.exec(body))&&results.length<25){results.push(body.slice(Math.max(0,m.index-120),Math.min(body.length,m.index+160)).replace(/\s+/g,' ').slice(0,280))}
 if(results.length)console.log('[MATCHES]',path,JSON.stringify(results).slice(0,8000));
}
(async()=>{
 const paths=['/web/','/web/SailingScheduleList','/web/index.php','/web/index.html'];
 const discovered=[];
 for(const p of paths){
  const {text,url}=await get(p);
  findRelevant(p,text);
  const rg=/<script\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/ig;let m;
  while((m=rg.exec(text))){try{let u=new URL(m[1],url);if(u.origin===origin&&!discovered.includes(u.pathname))discovered.push(u.pathname)}catch{}}
 }
 console.log('[SCRIPT_PATHS]',JSON.stringify(discovered).slice(0,14000));
 for(const path of discovered.slice(0,24)){const r=await get(path);findRelevant(path,r.text)}
})().catch(e=>console.log('[DIAG_ERROR]',String(e)));
