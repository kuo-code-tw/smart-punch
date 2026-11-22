'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-punch-missing-notice.js','utf8');
const html=fs.readFileSync('attendance/index.html','utf8');
const ctx={window:{},Date,Number,Set,String,Array};
vm.createContext(ctx);
vm.runInContext(source,ctx);
const api=ctx.window.P79MissingPunchNotice;
assert.equal(typeof api.showFromOfficial,'function');
const now=Date.parse('2026-11-22T07:42:00+08:00');
const original={id:'IN19',status:'上班簽到',timeStr:'2026/11/19 15:41'};
const oldOut={id:'OUT20',status:'下班簽退',timeStr:'2026/11/20 15:42'};
const fresh={id:'IN22',status:'上班簽到',timeStr:'2026/11/22 07:41'};
const time=r=>Date.parse(String(r.timeStr).replaceAll('/','-').replace(' ','T')+'+08:00');
const display=r=>String(r);
const row=({clockIn=null,clockOut=null}={})=>({clockIn,clockOut});
const store=new Map();
const storage={getItem:key=>store.get(key)||null,setItem:(key,val)=>store.set(key,val)};
function element(tag) {
  const e={tag,children:[],dataset:{},attrs:{},listeners:{},parent:null,className:'',textContent:'',
    appendChild(child){this.children.push(child);child.parent=this;return child;},
    setAttribute(k,v){this.attrs[k]=v;},
    addEventListener(k,fn){this.listeners[k]=fn;},
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
  };
  return e;
}
function makeDocument(){
 const body=element('body');
 const visit=(node,id)=>node.id===id?node:node.children.map(child=>visit(child,id)).find(Boolean)||null;
 return {body,createElement:element,getElementById:id=>visit(body,id)};
}
const doc=makeDocument();
function params(overrides={}){return {empId:'FIXTURE-E1',month:'2026-11',rows:[row({clockIn:original})],
  confirmedIds:['IN19'],nowMs:now,parseTime:time,formatTime:display,doc,storage,...overrides};}
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('old verified IN without OUT shows exact historical check-in and missing card type',()=>{
  const x=api.showFromOfficial(params());
  assert.equal(x.shown,true);
  assert.equal(x.items.length,1);
  assert.equal(x.items[0].timeText,'2026/11/19 15:41');
  assert.equal(x.items[0].missingType,'下班簽退');
  const modal=doc.getElementById('p79MissingPunchNoticeDialog');
  assert(modal);
  const allText=JSON.stringify(modal, (k,v)=>k==='parent'?undefined:v);
  assert(allText.includes('請通知人資或管理員'));
  assert(allText.includes('我知道了，繼續打卡'));
});
test('pending same-day shift is not mislabeled as missed',()=>{
  const items=api.collectMissingPunches({rows:[row({clockIn:fresh})],confirmedIds:['IN22'],nowMs:now,
    parseTime:time,formatTime:display});
  assert.equal(items.length,0);
});
test('single orphan OUT shows missing clock IN; paired shifts never alert',()=>{
  const items=api.collectMissingPunches({rows:[row({clockOut:oldOut}),row({clockIn:original,clockOut:oldOut})],
    confirmedIds:['IN19','OUT20'],nowMs:now,parseTime:time,formatTime:display});
  assert.equal(items.length,1);
  assert.equal(items[0].missingType,'上班簽到');
});
test('unconfirmed local or other-employee records are never displayed',()=>{
  const items=api.collectMissingPunches({rows:[row({clockIn:{...original,id:'OTHER'}})],
    confirmedIds:['IN19'],nowMs:now,parseTime:time,formatTime:display});
  assert.equal(items.length,0);
});
test('cloud recheck cannot cause popup spam and acknowledgment dismisses it',()=>{
  assert.equal(api.showFromOfficial(params()).shown,false);
  const modal=doc.getElementById('p79MissingPunchNoticeDialog');
  const button=modal.children[0].children.at(-1);
  button.listeners.click();
  assert.equal(doc.getElementById('p79MissingPunchNoticeDialog'),null);
  assert.equal(api.showFromOfficial(params()).shown,false);
});
test('next day reminds again if unresolved, resolved official record clears alert',()=>{
  assert.equal(api.showFromOfficial(params({nowMs:now+86400000})).shown,true);
  const complete=row({clockIn:original,clockOut:oldOut});
  const result=api.showFromOfficial(params({rows:[complete],confirmedIds:['IN19','OUT20'],nowMs:now+86400000}));
  assert.equal(result.items.length,0);
  assert.equal(doc.getElementById('p79MissingPunchNoticeDialog'),null);
});
test('identity changes replace old dialog without displaying another employee records',()=>{
  assert.equal(api.showFromOfficial(params({nowMs:now+172800000})).shown,true);
  const other=api.showFromOfficial(params({empId:'FIXTURE-E2',rows:[row({clockIn:{...original,id:'E2-IN'}})],
    confirmedIds:['E2-IN'],nowMs:now+172800000}));
  assert.equal(other.shown,true);
  assert.equal(doc.getElementById('p79MissingPunchNoticeDialog').dataset.employee,'FIXTURE-E2');
});
test('read errors/invalid month never fabricate an alert',()=>{
  const x=api.showFromOfficial(params({month:'invalid'}));
  assert.equal(x.shown,false);
  assert.equal(api.collectMissingPunches({rows:[row({clockIn:original})],confirmedIds:['IN19'],
    nowMs:now,parseTime:()=>NaN,formatTime:display}).length,0);
});
test('notice is only called after successful cloud-confirmed read; no write actions',()=>{
  const entry=html.indexOf('window.P79MissingPunchNotice.showFromOfficial({');
  const read=html.lastIndexOf("throw new Error(data?.error||'正式主表未回傳有效刷卡紀錄');",entry);
  const month=html.lastIndexOf('p79MobileOfficial.rows=matched;',entry);
  assert(entry>0&&read>0&&month>read);
  assert.match(html,/src="\.\.\/assets\/port79-punch-missing-notice\.js/);
  assert(html.includes('window.p79PunchInProgress!==true && window.P79MissingPunchNotice'),
    'historical alert must not interrupt an active punch attempt');
  assert(!source.includes('performCloudRequest'));
  assert(!source.includes('fetch('));
});
console.log(JSON.stringify({passed,failed:0,scope:'Node UI fixture only; no GAS, punch, or production write'}));
