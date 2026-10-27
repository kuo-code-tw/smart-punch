const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const menu=fs.readFileSync('assets/port79-attendance-date-overtime-menu.js','utf8');
const form=fs.readFileSync('assets/port79-overtime-application.js','utf8');
new vm.Script(menu,{filename:'port79-attendance-date-overtime-menu.js'});
new vm.Script(form,{filename:'port79-overtime-application.js'});
assert(!menu.includes('location.assign('),'right-click report must not navigate away from attendance');
assert(menu.includes("url.searchParams.set('overtimeExportDate',date)"),'the existing report must receive the selected date');
assert(menu.includes("body > :not(#p79OvertimeApplication)"),'embedded report should hide the other system behind the report');
assert(form.includes('$'+'{previewCss}'+'$'+'{reportUsabilityCss}</style>'),'responsive form styling must be active');
assert(form.includes('grid-template-columns:repeat(4,minmax(0,1fr))'),'controls need an aligned desktop layout');
assert(form.includes('@media(max-width:540px)'),'controls need a narrow-screen layout');

const listeners={};
const body=[];
const location={href:'https://example.test/smart-punch/attendance/?unit=A',pathname:'/smart-punch/attendance/',assign(){throw Error('navigation forbidden')}};
let observer=null,iframe=null,host=null;
function element(tag){
 const o={tag,style:{},children:[],listeners:{},dataset:{},attributes:{},isConnected:true,
  addEventListener(type,fn){this.listeners[type]=fn;},
  append(...nodes){this.children.push(...nodes);for(const n of nodes)n.isConnected=true;},
  appendChild(node){this.append(node);return node;},
  remove(){this.isConnected=false;},
  close(){this.open=false;this.listeners.close?.();},
  showModal(){this.open=true;},
  setAttribute(key,value){this.attributes[key]=value;},
  getAttribute(key){return this.attributes[key];}
 };
 if(tag==='iframe')iframe=o;
 if(tag==='dialog')host=o;
 return o;
}
const document={body:{appendChild(o){body.push(o);return o;}},
 createElement:element,
 getElementById(id){const nodes=[...body];while(nodes.length){const x=nodes.shift();if(x.id===id&&x.isConnected)return x;nodes.push(...x.children);}return null;},
 addEventListener(name,fn){listeners[name]=fn;}
};
const context={document,window:{addEventListener(){}},URL,location,innerWidth:1400,innerHeight:800,
 MutationObserver:class{constructor(fn){this.fn=fn;observer=this;}observe(){}disconnect(){}},
 setTimeout(){}};
vm.runInNewContext(menu,context);
const button={getAttribute:()=> '2026-10-27'};
let prevented=false;
listeners.contextmenu({target:{closest:s=>s.includes('p79AttendanceDateStrip')?button:null},
 preventDefault(){prevented=true;},stopPropagation(){},clientX:50,clientY:60});
assert(prevented,'right-click should open the local menu');
const dateMenu=document.getElementById('p79AttendanceDateOvertimeMenu');
assert(dateMenu,'report menu is displayed');
dateMenu.children[1].listeners.click();
assert(host?.open,'report opens as a dialog on the attendance page');
assert.equal(location.href,'https://example.test/smart-punch/attendance/?unit=A','attendance URL/filters should not change');
assert.equal(new URL(iframe.src).searchParams.get('overtimeExportDate'),'2026-10-27');

let childReport=null;
const child={body:{},head:{appendChild(){}},createElement:element,getElementById(){return childReport;}};
iframe.contentDocument=child;
iframe.listeners.load();
assert(observer,'embedded report observer should be attached');
childReport={open:true};observer.fn();
assert.equal(iframe.style.visibility,'visible','the existing report becomes visible once opened');
childReport=null;observer.fn();
assert(!host.isConnected,'closing the report returns to the original attendance page');
assert.equal(location.href,'https://example.test/smart-punch/attendance/?unit=A');
console.log('PASS: overtime report opens in attendance, no navigation, responsive controls parse');
