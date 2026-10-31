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
  const text=(await r.text()).slice(0,14000000);
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
 const versionResponse=await get('/version.php');
 const version=versionResponse.text.trim();
 console.log('[WANHAI_VERSION]',JSON.stringify(version.slice(0,100)));
 if(/^[a-zA-Z0-9._-]{1,50}$/.test(version)){
  const endpoint='/api/'+version+'/CM/Eways_GetVesselSchedule';
  const controller=new AbortController(),stop=setTimeout(()=>controller.abort(),14000);
  try{
   const res=await fetch(new URL(endpoint,origin),{
    method:'POST',redirect:'follow',signal:controller.signal,
    headers:{'Content-Type':'application/json','Accept':'application/json,text/plain,*/*'},
    body:JSON.stringify({SearchTarget:'Home',page:1,limit:99,type:'page'})
   });
   const raw=(await res.text()).slice(0,320000);
   let data=null;try{data=JSON.parse(raw)}catch{}
   const arr=data?.DataList||data?.data?.DataList||data?.data||[];
   console.log('[LIVE_WANHAI_POST]',JSON.stringify({path:endpoint,status:res.status,contentType:res.headers.get('content-type'),isJson:!!data,okFlag:data?.status,rows:Array.isArray(arr)?arr.length:null,total:data?.count,first:Array.isArray(arr)?arr.slice(0,2).map(o=>({VesselEName:o.VesselEName,VesselName:o.VesselName,InVoyage:o.InVoyage,OutVoyage:o.OutVoyage,ETA:o.ETA,ETB:o.ETB,ETD:o.ETD,Berth:o.Berth})):null,preview:data?null:raw.slice(0,170)}));
  }catch(err){console.log('[LIVE_WANHAI_POST_ERR]',String(err?.message||err).slice(0,210))}
  finally{clearTimeout(stop)}
 }
 for(const path of discovered.slice(0,24)){
  const r=await get(path);findRelevant(path,r.text);
  if(path.includes('main-')){
   const source=r.text;
   for(const [label,re] of [
    ['HTTP_POST_IMPL',/httpPost\([^)]{1,80}\)\s*\{/g],
    ['HTTP_POST_URL',/httpPost\s*[:=]\s*function/g],
    ['API_SERVICE_CONFIG',/apiUrl|apiURL|baseUrl|BASE_URL|apiHost|apiEndpoint|\/api\/|CM\/Eways_GetVesselSchedule/g],
   ]){
    let m,count=0;
    while((m=re.exec(source))&&count++<15){
     const context=source.slice(Math.max(0,m.index-380),Math.min(source.length,m.index+520));
     console.log('[JS_LOC]',label,m.index,JSON.stringify(context.slice(0,900)));
    }
   }
  }
 }
})().catch(e=>console.log('[DIAG_ERROR]',String(e)));
