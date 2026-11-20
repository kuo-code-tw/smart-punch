'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {allowed}=require('./site-server.cjs');
const TREE_URL='https://api.github.com/repos/kuo-code-tw/smart-punch/git/trees/main?recursive=1';
const OFFICIAL='https://kuo-code-tw.github.io/smart-punch/';
const MAX_FILE=12*1024*1024,MAX_TOTAL=48*1024*1024,MAX_FILES=500;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function blobSha(content){const buf=Buffer.isBuffer(content)?content:Buffer.from(content);return crypto.createHash('sha1').update(Buffer.from('blob '+buf.length+'\0')).update(buf).digest('hex')}
function securePath(root,name){if(!allowed(name))throw Error('已拒絕更新不在公開網站清單內的檔案');const base=path.resolve(root),file=path.resolve(base,...name.split('/'));if(path.relative(base,file).startsWith('..'))throw Error('不安全的檔案路徑');return file}
async function httpBytes(url,{fetcher=fetch,max=MAX_FILE}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const response=await fetcher(url,{headers:{'User-Agent':'Port79-Windows-folder-updater','Accept':'application/octet-stream'},redirect:'follow',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status+' '+new URL(url).pathname);
 const n=Number(response.headers?.get?.('content-length')||0);if(n>max)throw Error('檔案過大，已取消更新');
 const ab=await response.arrayBuffer();const data=Buffer.from(ab);if(data.length>max)throw Error('檔案超過安全上限');return data;
 }finally{clearTimeout(timer)}
}
function readCurrent(root,name){try{return fs.readFileSync(securePath(root,name))}catch{return null}}
function listChanged(root,tree){
 if(!Array.isArray(tree?.tree)||tree.truncated===true)throw Error('遠端版本目錄不完整');
 const entries=tree.tree.filter(x=>x?.type==='blob'&&allowed(x.path)&&/^[0-9a-f]{40}$/.test(x.sha));
 if(entries.length>MAX_FILES)throw Error('待更新檔案清單超出安全限制');
 return entries.filter(e=>{const old=readCurrent(root,e.path);return !old||blobSha(old)!==e.sha});
}
function saveJsonAtomic(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(data,null,2),'utf8');fs.renameSync(temp,file)}
function checkStoredUpdates(root,dataDir){
 const pendingFile=path.join(dataDir,'updates','pending.json');if(!fs.existsSync(pendingFile))return {applied:0};
 const entries=JSON.parse(fs.readFileSync(pendingFile,'utf8'));
 if(!Array.isArray(entries)||entries.some(e=>!allowed(e.path)||!/^[0-9a-f]{40}$/.test(e.sha)))throw Error('更新清單無效，拒絕寫入');
 // Verify every staged artifact before touching a single deployed application file.
 for(const e of entries){const stage=securePath(path.join(dataDir,'updates','staged'),e.path);if(blobSha(fs.readFileSync(stage))!==e.sha)throw Error('更新檔案校驗失敗：'+e.path)}
 const backup=path.join(dataDir,'updates','rollback');const touched=[];
 try{
  for(const e of entries){
   const target=securePath(root,e.path),before=fs.existsSync(target)?fs.readFileSync(target):null;
   const beforeFile=securePath(backup,e.path);
   fs.mkdirSync(path.dirname(target),{recursive:true});
   if(before){fs.mkdirSync(path.dirname(beforeFile),{recursive:true});fs.writeFileSync(beforeFile,before)}
   const staged=fs.readFileSync(securePath(path.join(dataDir,'updates','staged'),e.path));
   const temp=target+'.port79-next';fs.writeFileSync(temp,staged);fs.renameSync(temp,target);touched.push({path:e.path,original:before});
  }
  fs.unlinkSync(pendingFile);
  return {applied:entries.length};
 }catch(error){
  for(const e of touched.reverse()){const target=securePath(root,e.path);if(e.original)fs.writeFileSync(target,e.original);else try{fs.rmSync(target)}catch{}}
  throw Error('更新失敗，已恢復原程式檔案：'+error.message);
 }
}
async function prepareUpdates(root,dataDir,report=()=>{},{fetcher=fetch}={}){
 const pending=path.join(dataDir,'updates','pending.json');if(fs.existsSync(pending))return {pending:true,changed:0};
 const tree=JSON.parse((await httpBytes(TREE_URL,{fetcher,max:512*1024})).toString('utf8'));
 const changed=listChanged(root,tree);
 if(!changed.length){report('程式已是目前正式版本');return {pending:false,changed:0}}
 const staged=path.join(dataDir,'updates','staged');fs.rmSync(staged,{recursive:true,force:true});
 let done=0,total=0;
 // Sequential verified downloads trade bandwidth for predictable low background impact.
 for(const e of changed){
  const url=OFFICIAL+e.path.split('/').map(encodeURIComponent).join('/')+'?port79desktop='+e.sha.slice(0,12);
  const bytes=await httpBytes(url,{fetcher});
  if(blobSha(bytes)!==e.sha)throw Error('正式網站檔案尚未完成部署，保留原版：'+e.path);
  total+=bytes.length;if(total>MAX_TOTAL)throw Error('更新資料超過上限；未修改現有程式');
  const target=securePath(staged,e.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
  report('下載更新檔案 '+(++done)+'／'+changed.length);
 }
 saveJsonAtomic(pending,changed.map(({path,sha})=>({path,sha})));
 report('已完成校驗；關閉並重新開啟程式後套用 '+changed.length+' 個程式檔案');
 return {pending:true,changed:changed.length};
}
module.exports={blobSha,securePath,listChanged,checkStoredUpdates,prepareUpdates,httpBytes};
