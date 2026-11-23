'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const bridgeSource=fs.readFileSync('assets/port79-home-audit-inline-editor.js','utf8');
const guestSource=fs.readFileSync('assets/port79-attendance-inline-guest.js','utf8');
const TYPE='p79-attendance-inline-v2',KEY='port79_attendance_audit_handoff_v1';
const ORIGIN='https://example.test';
const record={date:'2026-11-20',shift:'早',empId:'E1',attNo:'001',name:'測試甲',
 clockInEvents:[{id:'EXACT-R1',timeStr:'2026/11/20 07:36:00'}],clockOutEvents:[]};
async function scenario(cloudResult){
 const messages=[],statuses=[],parentEvents={},guestEvents={},storage={},timeouts=[];
 let guestRoot,interval,handOffCount=0,writeCount=0,synced=0,modalVisible=false;
 const frameWin={postMessage(data,target){
  if(guestEvents.message)guestEvents.message({data,origin:ORIGIN,source:guestRoot.parent});
 }};
 const frame={contentWindow:frameWin,hidden:false,starting:true,ariaHidden:true,
  classList:{remove(name){if(name==='p79-early-inline-starting')frame.starting=false;}},
  removeAttribute(name){if(name==='src')this.src='';if(name==='aria-hidden')this.ariaHidden=false;}};
 const loading={hidden:false,textContent:''},headline={textContent:''},closeBtn={addEventListener(){}};
 const host={parentNode:null,innerHTML:'',id:'',setAttribute(){},
  querySelector(sel){return sel==='iframe'?frame:sel==='.p79-early-inline-loading'?loading:
   sel==='.p79-early-inline-head span'?headline:closeBtn;}};
 const dialog={open:true,appendChild(el){el.parentNode=this;},removeChild(el){el.parentNode=null;}};
 const parentRoot={
  location:{href:ORIGIN+'/smart-punch/',origin:ORIGIN},
  crypto:{getRandomValues(bytes){bytes.fill(7);return bytes;}},
  document:{getElementById:id=>id==='p79DashEarlyPunchDialog'?dialog:null,
   createElement:tag=>{assert.equal(tag,'section');return host;}},
  addEventListener(name,fn){parentEvents[name]=fn;},removeEventListener(name){delete parentEvents[name];},
  setTimeout(fn){timeouts.push(fn);return timeouts.length;},clearTimeout(){}
 };
 vm.runInNewContext(bridgeSource,{window:parentRoot,URL,Date,Uint8Array,Promise,console});
 const api=parentRoot.P79HomeAuditInlineEditor;
 assert(api.open({url:ORIGIN+'/smart-punch/attendance/?v=1#port79sso=sso',
  row:record,side:'OUT',onStatus:msg=>statuses.push(msg),onSynced:async()=>{synced++;}}));
 const childUrl=new URL(frame.src),nonce=childUrl.searchParams.get('p79InlineNonce');
 assert.equal(childUrl.pathname,'/smart-punch/attendance/');
 assert.equal(childUrl.searchParams.get('homeInline'),'1');
 assert.match(nonce,/^[a-f0-9]{32}$/);
 assert.equal(frame.hidden,false,'Keep child WebView2 frame live during handshake');
 assert.equal(frame.starting,true,'Only a 1px offscreen child loads, not the full page');
 assert.match(host.innerHTML,/class="p79-early-inline-starting"/);
 assert.equal(api.isWriting(),false);
 // Bogus origin/nonce must never receive the row identity or SSO token.
 const bad=()=>parentEvents.message({source:frameWin,origin:'https://evil.example',
  data:{type:TYPE,action:'ready',nonce}});
 bad();
 assert.equal(handOffCount,0);
 const parentProxy={postMessage(data,target){
  assert.equal(target,ORIGIN);
  messages.push(data);
  if(parentEvents.message)parentEvents.message({source:frameWin,origin:ORIGIN,data});
 }};
 const editModal={classList:{contains(cls){return cls==='hidden'&&!modalVisible;}}};
 const addModal={classList:{contains(){return true;}}};
 guestRoot={
  location:{href:frame.src,origin:ORIGIN},parent:parentProxy,
  document:{createElement:()=>({id:'',textContent:''}),head:{appendChild(){}},
   getElementById:id=>id==='editRecordModal'?editModal:id==='addRecordModal'?addModal:null},
  sessionStorage:{getItem:key=>storage[key]||null,setItem:(key,value)=>{storage[key]=value;},
   removeItem:key=>{delete storage[key];}},
  P79AttendanceAuditHandoffStart(){handOffCount++;modalVisible=true;},
  postToCloud(){writeCount++;return Promise.resolve(cloudResult);},
  addEventListener(name,fn){guestEvents[name]=fn;},
  setInterval(fn){interval=fn;return 1;},clearInterval(){}
 };
 // Guest immediately sends 'ready', receives the exact row over the
 // verified parent message channel, then starts ORIGINAL attendance handoff.
 vm.runInNewContext(guestSource,{window:guestRoot,URL,Date,Promise,console});
 assert.equal(handOffCount,1);
 assert.equal(JSON.parse(storage[KEY]).clockInEvents[0].id,'EXACT-R1');
 assert(!messages.some(x=>x.action==='saved'),'No optimistic success');
 assert(interval);
 interval();
 assert.equal(frame.starting,false,'Expand the original form only after it opens');
 assert.equal(frame.ariaHidden,false);
 assert.equal(loading.hidden,true);
 assert(messages.some(x=>x.action==='opened'));
 const result=await guestRoot.postToCloud({action:'addRecord',record:{empId:'E1'}});
 assert.equal(result.ok,cloudResult.ok);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(writeCount,1,'No second cloud writer created');
 assert(messages.some(x=>x.action==='writing'));
 return {synced,messages,statuses,host,api,frame,storage};
}
(async()=>{
 const success=await scenario({ok:true,localOnly:false});
 assert.equal(success.synced,1,'Official verified save triggers audit refresh exactly once');
 assert.equal(success.host.parentNode,null,'Return to original pending-duty list only after verified refresh');
 assert(success.messages.some(x=>x.action==='saved'));
 const fail=await scenario({ok:false,error:'雲端拒絕更新'});
 assert.equal(fail.synced,0,'Rejected cloud write must NEVER claim synchronization');
 assert(fail.messages.some(x=>x.action==='error'));
 assert(fail.statuses.some(s=>s.includes('雲端拒絕更新')));
 assert(fail.host.parentNode!==null,'Keep original form visible after failed save');
 console.log('PASS WebView2-safe in-place attendance: exact employee ID through same-origin nonce channel, original modal, successful sync, denied mutation, no wrong navigation');
})().catch(e=>{console.error(e);process.exitCode=1;});
