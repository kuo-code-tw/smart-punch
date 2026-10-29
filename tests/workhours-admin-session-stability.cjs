'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
const start=html.indexOf('<script id="p79-workhours-permission-gate-v20261029-session-safe">');
assert(start>=0,'new independent work-hours gate installed');
const gate=html.slice(html.indexOf('>',start)+1,html.indexOf('</script>',start));
const from=html.indexOf('        function currentPort79SsoToken() {');
const to=html.indexOf('        function isGoogleQuotaError(',from);
assert(from>0&&to>from,'real token resolver exists');
const resolve=html.slice(from,to);
const base='https://script.google.com/macros/s/FAKE/exec';
function setup({role='admin',adminId='ADMIN-1',adminToken='manager-token',userToken='employee-token',cloud={ok:true,empId:'ADMIN-1',adminRole:'admin',systemPermissions:{workhours:'view'},finePermissions:{workhours:{'overtime.view':true}},dataScope:{workhours:'self'}},httpOk=true,networkError=false,originalLevel='view'}={}){
 const initial={aqc_admin_role:role,aqc_admin_id:adminId,aqc_admin_logged_in:'1',port79_admin_token:adminToken,port79_user_token:userToken,admin_session:JSON.stringify({empId:adminId,adminRole:role,systemPermissions:{workhours:originalLevel}})};
 const state=new Map(Object.entries(initial)),calls=[],warnings=[],toasts=[],hides=[];
 const storage={getItem:key=>state.get(key)??null,setItem:(key,value)=>state.set(key,String(value)),removeItem:key=>state.delete(key)};
 const document={getElementById:key=>['adminContentOvertime','adminContentStats'].includes(key)?{classList:{add:x=>hides.push([key,x])}}:null};
 const ctx={window:null,sessionStorage:storage,document,console:{warn:(...x)=>warnings.push(x),error:()=>{}},Date,URL,JSON,Promise,String,
  getActiveGasUrl:()=>base,showToast:(...args)=>toasts.push(args),
  currentEmp:{empId:adminId,adminRole:role,systemPermissions:{workhours:originalLevel}},
  location:{set href(v){throw Error('Must not navigate to '+v)},replace(){throw Error('Must not replace location')}},
  fetch:async(url)=>{calls.push(new URL(url));if(networkError)throw Error('Temporary outage');return {ok:httpOk,json:async()=>cloud};}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(gate,ctx);
 vm.runInContext(resolve,ctx);ctx.readPort79SsoTokenFromHash=()=>'';return{ctx,state,calls,warnings,toasts,hides};
}
(async()=>{
 let s=setup();
 assert.equal(s.ctx.currentPort79SsoToken(),'manager-token','manager token outranks leftover employee token');
 assert.equal(await s.ctx.p79CheckWorkHoursPermission(),true);
 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0].searchParams.get('token'),'manager-token','permission check verifies admin token');
 assert.equal(s.state.get('port79_admin_token'),'manager-token','successful check does not log out');
 assert.equal(s.state.get('p79_workhours_permission'),'view');
 assert.equal(JSON.parse(s.state.get('admin_session')).systemPermissions.workhours,'view');
 s=setup({cloud:{ok:true,empId:'EMPLOYEE-2',role:'employee',systemPermissions:{workhours:'none'}}});
 assert.equal(await s.ctx.p79CheckWorkHoursPermission(),true,'wrong-person response is not admin revocation');
 assert.equal(s.state.get('p79_workhours_permission'),undefined);
 assert.equal(s.state.get('port79_admin_token'),'manager-token');
 assert.equal(s.ctx.currentEmp.systemPermissions.workhours,'view','wrong employee response cannot overwrite permissions');
 s=setup({cloud:{ok:false,retryable:true,error:'雲端目前忙碌'}});
 assert.equal(await s.ctx.p79CheckWorkHoursPermission(),true,'retryable failure preserves existing login');
 assert.equal(s.state.get('port79_admin_token'),'manager-token');
 s=setup({cloud:{ok:true,empId:'ADMIN-1',adminRole:'admin',error:'partial'}});
 assert.equal(await s.ctx.p79CheckWorkHoursPermission(),true,'missing permission field is unconfirmed');
 assert.equal(s.state.get('p79_workhours_permission'),undefined);
 s=setup({networkError:true});
 assert.equal(await s.ctx.p79CheckWorkHoursPermission(),true,'network failure cannot redirect');
 assert.equal(s.state.get('admin_session')!==undefined,true);
 s=setup({cloud:{ok:true,empId:'ADMIN-1',adminRole:'admin',systemPermissions:{workhours:'none'}}});
 assert.equal(await s.ctx.p79CheckWorkHoursPermission(),false,'same-person explicit deny must block module');
 assert.equal(s.state.get('p79_workhours_permission'),'none');
 assert.equal(s.ctx.currentEmp.systemPermissions.workhours,'none');
 assert.equal(s.state.get('port79_admin_token'),'manager-token','denied module must not clear login');
 assert.equal(s.hides.length,2,'denied module hides overtime and stats');
 assert.match(s.toasts[0][0],/沒有.*權限/);
 s=setup({role:'superadmin',cloud:{ok:false}});
 assert.equal(await s.ctx.p79CheckWorkHoursPermission(),true);
 assert.equal(s.calls.length,0,'superadmin SSO remains authoritative');
 assert.equal(s.state.get('p79_workhours_permission'),'manage');
 s=setup({role:'employee',adminId:'',adminToken:'',userToken:'employee-only'});
 assert.equal(s.ctx.currentPort79SsoToken(),'employee-only','normal employee uses punch token');
 assert(!gate.includes("location.href='../'"),'no permission redirect remains');
 assert(html.includes("if(sessionStorage.getItem('p79_workhours_permission')==='none')return false;"),'server denial scopes results');
 assert(html.includes("if(sessionStorage.getItem('p79_workhours_permission')==='none'){"),'server denial prevents module reopening');
 console.log('PASS work-hours admin SSO stability: token precedence, transient cloud/cache rejection, identity mismatch, denied module without logout, superadmin and employee fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
