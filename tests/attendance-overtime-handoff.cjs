const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('assets/port79-special-overtime.js','utf8');
function setup(search,stored=''){
 const storage=new Map([['port79_attendance_overtime_request_v1',stored]]);
 const timers=[],docListeners={},winListeners={};
 const location={href:'https://kuo-code-tw.github.io/smart-punch/work-hours/'+search,pathname:'/smart-punch/work-hours/'};
 Object.defineProperty(location,'search',{get(){return new URL(location.href).search}});
 const history={state:null,replaceState(_state,_title,path){location.href=new URL(path,location.href).href}};
 const toasts=[];
 const doc={readyState:'complete',visibilityState:'visible',body:{dataset:{p79System:'workhours'}},getElementById:()=>null,addEventListener:(name,fn)=>{docListeners[name]=fn}};
 const ctx={URL,location,history,document:doc,localStorage:{getItem:()=> '[]'},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},MutationObserver:class{constructor(fn){this.fn=fn}observe(){}},clearTimeout:()=>{},setTimeout:fn=>{timers.push(fn);return timers.length},addEventListener:(name,fn)=>{winListeners[name]=fn},showToast:(message,type)=>toasts.push({message,type})};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,location,storage,timers,toasts};
}
(async()=>{
 const valid=setup('?attendanceOvertimeReport=1&empId=AP123&date=2026-10-23&name=%E7%8E%8B');
 const request=JSON.parse(valid.storage.get('port79_attendance_overtime_request_v1'));
 assert.equal(request.empId,'AP123');assert.equal(request.date,'2026-10-23');
 await valid.timers.shift()();
 assert.equal(new URL(valid.location.href).searchParams.has('attendanceOvertimeReport'),false,'one-time URL flag is removed after the request is handed off');
 const stale=setup('?attendanceOvertimeReport=1');
 assert.equal(new URL(stale.location.href).searchParams.has('attendanceOvertimeReport'),false,'invalid one-time URL is cleaned immediately');
 await stale.timers.shift()();
 assert.match(stale.toasts[0].message,/連結資料已失效/,'stale link has a clear one-time warning');
 console.log('PASS overtime declaration link recovery and one-time URL cleanup');
})().catch(error=>{console.error(error);process.exitCode=1});
