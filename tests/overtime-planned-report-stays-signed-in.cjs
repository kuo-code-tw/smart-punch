'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
const report=fs.readFileSync('assets/port79-overtime-report.js','utf8');
function extract(source,start,end,label){
 const from=source.indexOf(start),to=source.indexOf(end,from);
 assert(from>=0&&to>from,'actual source block exists: '+label);
 return source.slice(from,to);
}
const open=extract(html,'        function p79OpenManualOvertimePlan(){','        async function p79DeletePlannedOvertimeRow','manual plan button');
const core=extract(report,"function dialog(title,content,id='p79OvertimeDialog'){",'const inputStyle=','original shared report dialog');
assert(html.includes('onclick="p79OpenManualOvertimePlan()"'),'actual add-plan button uses same-page function');
assert(!open.includes('p79CloseOvertimePlannedDialog()'),'opening manual plan must not close list and jump to main page');
assert(!open.includes('location.')&&!open.includes('logout')&&!open.includes('sessionStorage'),'never modify login on plan open');
assert(html.includes('p79OvertimePlannedDialog'),'planned dialog still exists');
assert(html.includes('p79PlannedAttendanceModalIsOpen'),'planned close protection still exists');
assert(html.includes("querySelector?.('#p79OvertimeDialog[open]')"),'planned dialog cannot be closed while new plan form is active');
assert(report.includes("id==='p79OvertimeDialog'&&planned?.open?planned:document.body"),
  'new plan report mounts inside the open planned review, but the standalone form keeps body host');
assert(html.includes('port79-overtime-report.js?v=20261029-explicit-monthly-plan-date-v2'),
  'new auth-safe report module cache version is required in production');
const session=new Map([['port79_user_token','live-token'],['admin_session','{"empId":"ADMIN","role":"superadmin"}'],['aqc_admin_logged_in','1']]);
const document={
 body:{children:[],appendChild(el){this.children.push(el);el.parentNode=this;el.isConnected=true;return el;}},
 nodes:{},
 getElementById(id){if(id==='p79OvertimePlannedDialog')return this.nodes.planned;
   if(id==='p79PlanModeManual')return this.nodes.manual;
   if(id==='p79PlanModeAuto')return this.nodes.auto;
   return [...this.nodes.planned.children,...this.body.children].find(e=>e.id===id)||null;},
 createElement(tag){assert.equal(tag,'dialog');return{
  id:'',tagName:'DIALOG',isConnected:false,open:false,innerHTML:'',style:{},
  querySelector:()=>({onclick:null}),
  remove(){this.isConnected=false;const a=this.parentNode?.children;if(a){const i=a.indexOf(this);if(i>=0)a.splice(i,1)}},
  showModal(){this.open=true;},
  close(){this.open=false;}
 }}
};
document.nodes.planned={open:true,children:[],appendChild(el){this.children.push(el);el.parentNode=this;el.isConnected=true;return el}};
document.nodes.manual={checked:false};document.nodes.auto={checked:true};
const window={P79Overtime:{openReport(prefill){assert.equal(prefill.manualPlan,true);return ctx.dialog('新增預排','申報表單');}}};
const ctx={document,window,esc:x=>String(x),p79CanReportOvertime:()=>true,
 p79CloseOvertimePlannedDialog:()=>{throw Error('should not close planned review or navigate');},
 sessionStorage:{getItem:k=>session.get(k),removeItem(){throw Error('opening plan must not log out');}},
 location:{replace(){throw Error('opening plan must not navigate to logout URL');}},
 console};
vm.createContext(ctx);vm.runInContext(core,ctx);vm.runInContext(open,ctx);
const before=JSON.stringify([...session]);
const el=ctx.p79OpenManualOvertimePlan();
assert.equal(el.parentNode,document.nodes.planned,'same native top-layer review contains report modal');
assert.equal(document.nodes.planned.open,true,'parent review stays open');
assert.equal(el.open,true,'same report dialog shows');
assert.equal(document.nodes.manual.checked,true);assert.equal(document.nodes.auto.checked,false);
assert.equal(JSON.stringify([...session]),before,'all existing login/SSO keys preserved');
el.close();el.remove();
document.nodes.planned.open=false;
const direct=ctx.dialog('申報加班','其他正式申報');
assert.equal(direct.parentNode,document.body,'standalone filing stays in original body host');
console.log('PASS report stays in planned dialog; open/save/close preserves session, no logout redirect, all other reports use original host');
