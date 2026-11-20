'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {blobSha,listChanged,checkStoredUpdates,securePath,prepareUpdates}=require('../app/update-site.cjs');
function fixture(){const base=fs.mkdtempSync(path.join(os.tmpdir(),'port79-update-'));const root=path.join(base,'site'),data=path.join(base,'local-data');fs.mkdirSync(path.join(root,'assets'),{recursive:true});fs.mkdirSync(data);return {base,root,data,cleanup(){fs.rmSync(base,{recursive:true,force:true})}}}
test('Git blob SHA matches format and filters excluded folders',()=>{
 const buf=Buffer.from('hello');assert.equal(blobSha(buf),'b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0');
 const f=fixture();try{
  fs.writeFileSync(path.join(f.root,'index.html'),'original');
  const tree={tree:[{path:'index.html',type:'blob',sha:blobSha('new')},{path:'backend/secret.gs',type:'blob',sha:blobSha('ignored')}]};
  const diff=listChanged(f.root,tree);assert.equal(diff.length,1);assert.equal(diff[0].path,'index.html');
  assert.throws(()=>securePath(f.root,'../secret'));assert.throws(()=>securePath(f.root,'local-data/secret'));
 }finally{f.cleanup()}
});
test('verified staged site update changes code only, keeps local user data',()=>{
 const f=fixture();try{
  const name='assets/port79-example.js';fs.writeFileSync(path.join(f.root,name),'original');
  fs.writeFileSync(path.join(f.data,'keep.txt'),'DO NOT TOUCH');
  const stage=securePath(path.join(f.data,'updates','staged'),name);
  fs.mkdirSync(path.dirname(stage),{recursive:true});fs.writeFileSync(stage,'updated');
  fs.writeFileSync(path.join(f.data,'updates','pending.json'),JSON.stringify([{path:name,sha:blobSha('updated')}]));
  const result=checkStoredUpdates(f.root,f.data);
  assert.equal(result.applied,1);
  assert.equal(fs.readFileSync(path.join(f.root,name),'utf8'),'updated');
  assert.equal(fs.readFileSync(path.join(f.data,'keep.txt'),'utf8'),'DO NOT TOUCH');
 }finally{f.cleanup()}
});
test('tampered update rejected before any official file changes',()=>{
 const f=fixture();try{
  fs.writeFileSync(path.join(f.root,'index.html'),'untouched');
  const stage=securePath(path.join(f.data,'updates','staged'),'index.html');fs.mkdirSync(path.dirname(stage),{recursive:true});fs.writeFileSync(stage,'tampered');
  fs.writeFileSync(path.join(f.data,'updates','pending.json'),JSON.stringify([{path:'index.html',sha:blobSha('official')}]));
  assert.throws(()=>checkStoredUpdates(f.root,f.data),/校驗失敗/);
  assert.equal(fs.readFileSync(path.join(f.root,'index.html'),'utf8'),'untouched');
 }finally{f.cleanup()}
});
test('reject unpublished bytes from official site and preserve existing app code',async()=>{
 const f=fixture();try{
  fs.writeFileSync(path.join(f.root,'index.html'),'existing');
  const tree={truncated:false,tree:[{path:'index.html',type:'blob',sha:blobSha('new code')}]};
  const fetcher=async url=>({ok:true,status:200,headers:{get(){return'0'}},arrayBuffer:async()=>{
   return Uint8Array.from(Buffer.from(url.includes('api.github.com')?JSON.stringify(tree):'old published code')).buffer;
  }});
  await assert.rejects(()=>prepareUpdates(f.root,f.data,()=>{},{fetcher}),/尚未完成部署/);
  assert.equal(fs.readFileSync(path.join(f.root,'index.html'),'utf8'),'existing');
  assert.equal(fs.existsSync(path.join(f.data,'updates','pending.json')),false);
 }finally{f.cleanup()}
});
