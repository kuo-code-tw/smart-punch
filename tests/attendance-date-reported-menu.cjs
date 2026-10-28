'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const page=fs.readFileSync('attendance/index.html','utf8');
const menuCode=fs.readFileSync('assets/port79-attendance-date-overtime-menu.js','utf8');
const exportCode=fs.readFileSync('assets/port79-attendance-overtime-export.js','utf8');
new vm.Script(menuCode);new vm.Script(exportCode);
assert(page.includes('日期按右鍵可查看「已申報」或匯出加班明細'));
assert(page.includes('port79-attendance-date-overtime-menu.js?v=20261028-current-active-reviewed-v2'));
assert(menuCode.includes("reported.textContent='✅ 已申報｜查看當日正式紀錄'"));
assert(menuCode.includes('P79AttendanceOvertimeExport.openReported(date)'));
assert(exportCode.includes('openReported:date=>open(date,true,true)'));
assert(exportCode.includes("d.querySelector('#p79OtExportSave').style.display=viewOnly?'none':''"));
assert(exportCode.includes("setStatus(viewOnly?'雲端正式有效申報 '"));
assert(exportCode.includes("viewOnly?Promise.resolve({ok:false}):api('getOvertimeExportAudit'"),'view mode avoids unrelated export audit GET');
assert(!menuCode.includes('saveOvertimeReportDirect'),'right-click menu cannot save declarations');
const date='2026-10-28',id=x=>String(x||'').trim().toUpperCase();
const start=exportCode.indexOf('function sheetRows('),end=exportCode.indexOf('async function api(',start);
assert(start>0&&end>start);
const c={Map,Set,Array,String};c.id=id;vm.createContext(c);vm.runInContext(exportCode.slice(start,end),c);
const record=(empId,meta)=>({empId,schedule:{__meta:{[date]:meta}}});
const schedules=[
 record('E1',{overtimeReport:{id:'REPORT-1',code:'休08-16',declaredHours:8},
  overtimeReports:[{id:'REPORT-1',code:'休08-16',declaredHours:8},{id:'REPORT-CANCEL',code:'休16-24'}],
  overtimeRevocations:[{confirmed:true,reportId:'REPORT-CANCEL',at:date,actor:'管理員'}]}),
 record('E2',{overtimeReport:{id:'REPORT-2',code:'休16-24'},overtimeAmendments:[{confirmed:true,at:date,actor:'管理員'}]}),
 record('E3',{overtimeReport:{id:'HIDDEN',code:'休08-16'},overtimeExcluded:true}),
 record('E4',{overtimeReport:{id:'REPORT-NO-AUDIT'},overtimeRevocations:[{confirmed:false,reportId:'REPORT-NO-AUDIT'}]})
];
const original=JSON.stringify(schedules);
const rows=c.sheetRows({employees:[{empId:'E1',name:'第一人'},{empId:'E2',name:'第二人'}],schedules},date);
assert.deepEqual(Array.from(rows.map(r=>r.reportId)).sort(),['REPORT-1','REPORT-2','REPORT-NO-AUDIT']);
assert.equal(rows.find(r=>r.empId==='E1').employeeName,'第一人');
assert.equal(JSON.stringify(schedules),original,'query cannot mutate original cloud data');
const reportSelected=[],menuNodes=[],documentListeners={};
function element(tag){
 const e={tag,style:{},children:[],listeners:{},attributes:{},offsetWidth:250,offsetHeight:155,isConnected:true,
  addEventListener(ev,cb){this.listeners[ev]=cb},
  setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]},
  append(...items){this.children.push(...items)},appendChild(item){this.children.push(item)},
  remove(){this.isConnected=false},
  closest(selector){if(selector==='#p79AttendanceDateOvertimeMenu'&&this.closestMenu)return true;return null}
 };
 return e;
}
const d={body:{appendChild:node=>menuNodes.push(node)},createElement:element,addEventListener:(k,cb,capture)=>{(documentListeners[k]??=[]).push(cb)}};
const w={addEventListener(){},P79AttendanceOvertimeExport:{openReported:date=>reportSelected.push(date)}};
const ctx={document:d,window:w,innerWidth:1200,innerHeight:800,location:{href:'https://example.invalid/attendance/'},URL,MutationObserver:class{},setTimeout:()=>1,alert:()=>assert.fail('export module should exist')};vm.createContext(ctx);vm.runInContext(menuCode,ctx);
const btn={getAttribute:k=>k==='data-p79-attendance-date'?date:null};
btn.closest=sel=>sel==='#p79AttendanceDateStrip [data-p79-attendance-date]'?btn:null;
let prevented=false,stopped=false;
documentListeners.contextmenu[0]({target:btn,clientX:230,clientY:60,preventDefault:()=>prevented=true,stopPropagation:()=>stopped=true});
assert(prevented&&stopped);
const menu=menuNodes.at(-1),reported=menu.children.find(x=>x.textContent?.includes('已申報')),print=menu.children.find(x=>x.textContent?.includes('列印'));
assert(reported&&print,'both reported and export actions retained');
reported.listeners.click();
assert.deepEqual(reportSelected,[date],'right click picks intended date and only opens official view');
assert.equal(menu.isConnected,false,'context menu closes on selection');
console.log('PASS attendance right-click 已申報: official effective reports only, revoked/excluded omitted, readonly view, existing print retained, date selection, no mutation');
