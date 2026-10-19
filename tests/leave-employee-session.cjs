const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('leave/index.html','utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0,name);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n}',a)+2);}
function setup(role='employee'){
 const data={port79_user_token:'employee-token',port79_admin_token:'stale-admin',port79_leave_emp_id:'AP1',port79_user_session:JSON.stringify({empId:'AP1',adminRole:role})};
 const c={URLSearchParams,Date,JSON,encodeURIComponent,console,location:{search:'?mode=employee'},adminSession:null,adminToken:'stale-admin',GAS_URL:'https://test.invalid/',sessionStorage:{getItem:k=>data[k]||null,setItem:(k,v)=>data[k]=v},jsonFetch:async()=>({ok:true,empId:'AP1',adminRole:'employee',punchOnly:true,userToken:'renewed'}),storedToken:()=>{throw Error('employee entry must not read admin credentials')}};
 vm.createContext(c);for(const name of ['p79LeaveEmployeeEntry','p79RenewEmployeeLeaveSession','leaveRequestToken','restoreAdmin'])vm.runInContext(fn(name),c);
 return {c,data};
}
(async()=>{
 let {c,data}=setup();assert.equal(c.leaveRequestToken(),'employee-token');assert.equal(await c.restoreAdmin(),false);assert.equal(c.adminToken,'');
 assert.equal(await c.p79RenewEmployeeLeaveSession(),true);assert.equal(data.port79_user_token,'renewed');assert.equal(data.port79_admin_token,'stale-admin','never rewrites management credentials');
 ({c,data}=setup('admin'));assert.equal(await c.p79RenewEmployeeLeaveSession(),false);
 ({c,data}=setup());c.jsonFetch=async()=>({ok:true,empId:'AP2',adminRole:'employee',punchOnly:true,userToken:'wrong'});assert.equal(await c.p79RenewEmployeeLeaveSession(),false);assert.equal(data.port79_user_token,'employee-token');
 ({c,data}=setup());c.jsonFetch=async()=>({ok:true,empId:'AP1',adminRole:'admin',punchOnly:false,userToken:'management'});assert.equal(await c.p79RenewEmployeeLeaveSession(),false);
 ({c,data}=setup());c.jsonFetch=async()=>{data.port79_leave_emp_id='AP2';return {ok:true,empId:'AP1',adminRole:'employee',punchOnly:true,userToken:'old-user'};};assert.equal(await c.p79RenewEmployeeLeaveSession(),false);
 console.log('PASS employee entry ignores stale admin credentials; renewal validates employee, punch-only grant and account races; no management renewal');
})().catch(e=>{console.error(e);process.exitCode=1});
