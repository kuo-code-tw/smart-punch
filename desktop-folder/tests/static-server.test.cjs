'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {route,allowed,createServer,PORT,PUBLIC_DIRS}=require('../app/site-server.cjs');
function request(port,p,method='GET'){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:p,method},res=>{let data='';res.on('data',x=>data+=x);res.on('end',()=>resolve({status:res.statusCode,data,headers:res.headers}))});req.on('error',reject);req.end()})}
test('identical public module names and root paths',()=>{
 for(const name of ['assets','attendance','schedule','leave','hr','work-hours','aqc-efficiency','history-data','settings','gate-dashboard','gate-import','yard-dashboard','data-cache','data-sources'])assert(PUBLIC_DIRS.has(name),name);
 assert.equal(route('/smart-punch/attendance/'),'attendance/index.html');
 assert.equal(route('/smart-punch/'),'index.html');
 assert.equal(route('/smart-punch/settings/'),'settings/index.html');
 assert(allowed('assets/port79-data-cache.js'));
});
test('protect local data, backend source, dotfiles and traversal',()=>{
 for(const input of ['local-data/BrowserProfile','backend/private.gs','tests/sample.cjs','.github/workflows/x.yml','assets/../local-data/secret','assets\\evil','../index.html','data-cache/../../secrets'])assert.equal(allowed(input),false,input);
 assert.equal(route('/smart-punch/local-data/BrowserProfile/'),null,'private folder route should be blocked');
});
test('real local web server only exposes unchanged site and rejects writes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'port79-static-'));
 fs.mkdirSync(path.join(root,'attendance'));fs.writeFileSync(path.join(root,'index.html'),'<html>Original homepage</html>');fs.writeFileSync(path.join(root,'attendance','index.html'),'<html>Original attendance</html>');
 fs.mkdirSync(path.join(root,'local-data'));fs.writeFileSync(path.join(root,'local-data','secret.txt'),'SECRET');
 const server=createServer(root);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const port=server.address().port;
  assert.equal((await request(port,'/smart-punch/')).status,200);
  assert.match((await request(port,'/smart-punch/attendance/')).data,/Original attendance/);
  assert.equal((await request(port,'/smart-punch/local-data/secret.txt')).status,404);
  assert.equal((await request(port,'/smart-punch/backend/secrets.gs')).status,404);
  assert.equal((await request(port,'/smart-punch/../local-data/secret.txt')).status,404);
  assert.equal((await request(port,'/smart-punch/index.html','POST')).status,405);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true})}
});
