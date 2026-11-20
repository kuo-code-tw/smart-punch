'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const PORT=18779,BASE='/smart-punch/';
const PUBLIC_DIRS=new Set(['assets','attendance','schedule','leave','hr','work-hours','aqc-efficiency','history-data','settings','gate-dashboard','gate-import','yard-dashboard','data-cache','data-sources','previews']);
const ROOT_FILES=new Set(['index.html','port79-attendance-core.js']);
const TYPE={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.wasm':'application/wasm','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8','.csv':'text/csv; charset=utf-8','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.xls':'application/vnd.ms-excel'};
function allowed(name){
 if(typeof name!=='string'||!name||name.includes('\\')||name.includes('\0')||name.startsWith('/')||name.includes('//'))return false;
 const parts=name.split('/');if(parts.some(x=>x==='.'||x==='..'||x.startsWith('.')))return false;
 if(parts.length===1)return ROOT_FILES.has(name);
 return PUBLIC_DIRS.has(parts[0])&&parts.length>1&&!!TYPE[path.extname(name).toLowerCase()];
}
function route(url){
 let pathname;try{pathname=new URL(url,'http://127.0.0.1').pathname;pathname=decodeURIComponent(pathname)}catch{return null}
 if(pathname==='/')return {redirect:BASE};
 if(pathname==='/smart-punch')return {redirect:BASE};
 if(!pathname.startsWith(BASE))return null;
 let name=pathname.slice(BASE.length);
 if(!name||name.endsWith('/'))name+='index.html';
 return allowed(name)?name:null;
}
function createServer(root,logger=()=>{}){
 const server=http.createServer((req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
  const name=route(req.url||'/');
  if(name&&typeof name==='object'&&name.redirect){res.writeHead(302,{Location:name.redirect});res.end();return}
  if(!name){res.writeHead(404);res.end('Not found');return}
  const file=path.resolve(root,...name.split('/')),rel=path.relative(root,file);
  if(rel.startsWith('..')||path.isAbsolute(rel)){res.writeHead(403);res.end();return}
  fs.stat(file,(err,stat)=>{
   if(err||!stat.isFile()){res.writeHead(404);res.end('Missing static file');return}
   res.writeHead(200,{'Content-Type':TYPE[path.extname(name).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});
   if(req.method==='HEAD'){res.end();return}
   const stream=fs.createReadStream(file);stream.on('error',error=>{logger(error.message);res.destroy(error)});stream.pipe(res);
  });
 });
 return server;
}
module.exports={PORT,BASE,PUBLIC_DIRS,ROOT_FILES,TYPE,allowed,route,createServer};
