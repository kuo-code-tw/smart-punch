'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/login-progress.js'),'utf8');
test('no private database download before real admin or superadmin login',async()=>{
 let interval=null,timer=null,downloads=0,role='employee',logged=false;
 const scope={getItem(k){
  if(k==='port79_user_session')return role?JSON.stringify({empId:'U1',adminRole:role,punchOnly:false}):null;
  if(k==='port79_user_token')return logged?'VERIFIED-TOKEN':'';
  return null;
 }};
 const systems={classList:{contains:()=>logged}};
 const document={body:{append(){}},createElement(tag){return {tag,style:{},children:[],setAttribute(){},append(e){this.children.push(e)},querySelector(sel){return sel==='.p79-desktop-label'?this.children[0]:sel==='.p79-desktop-detail'?this.children[1]:this.children[2]},addEventListener(){},textContent:''}},getElementById(id){return id==='systems'?systems:null}};
 const window={Port79DataCache:{downloadAll:async callback=>{downloads++;const ss=['attendance','workhours','leave','schedule','efficiency','hr','history'];ss.forEach((s,i)=>callback(s,i,7,'done',null));return ss.map(system=>({system,ok:true}))}},addEventListener(){}};
 const ctx={window,document,sessionStorage:scope,localStorage:{getItem(){return null},setItem(){}},navigator:{onLine:true},setInterval(f){interval=f;return 1},setTimeout(f){timer=f;return 2},clearInterval(){},Date,console};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 assert.equal(downloads,0,'Startup must not download');
 await timer();await interval();assert.equal(downloads,0,'No token: no cloud download');
 role='admin';await interval();assert.equal(downloads,0,'Admin role alone is not a login');
 logged=true;await interval();await new Promise(r=>setImmediate(r));assert.equal(downloads,1,'Authenticated admin starts one download pass');
 await interval();await new Promise(r=>setImmediate(r));assert.equal(downloads,1,'No duplicate download');
});
test('punch-only and employee sessions do not trigger background download',async()=>{
 assert.match(source,/admin','superadmin/);
 assert.match(source,/s\.punchOnly===true/);
 assert.match(source,/getElementById\('systems'\).*classList\.contains\('show'\)/);
 assert.match(source,/api\.downloadAll/);
});
