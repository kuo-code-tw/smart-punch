'use strict';
// Regression: cloud settings and actual staff assignments must not look empty
// just because the HR roster loads before the organization-options request.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('hr/index.html','utf8');
const begin=html.indexOf('function p79HrExistingOrgNames(');
const end=html.indexOf('function addOrgItem(',begin);
assert(begin>0&&end>begin,'organization dialog reader and renderer remain available');
const source=html.slice(begin,end);
function setup(){
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{id,disabled:false,innerHTML:'',textContent:'',
   getAttribute(){return null}});
  return nodes.get(id);
 };
 const ui=[node('newHeadquarters'),node('newDivision'),node('newJobTitle'),node('saveOrgBtn')];
 const dialog={open:false,showModal(){this.open=true;},close(){this.open=false;},querySelectorAll(){return ui}};
 const keys=['departments','jobTitles','hiddenJobTitles','units','headquarters','divisions','offices','sections'];
 const empty=()=>Object.fromEntries(keys.map(key=>[key,[]]));
 const people=[
  {headquarters:'甲總公司',division:'倉儲事業部',office:'第一事業處',section:'裝卸組',jobTitle:'領班',dept:'舊部門'},
  {headquarters:'甲總公司',division:'倉儲事業部',office:'第一事業處',section:'機電室',jobTitle:'操作員',dept:'舊部門'}
 ];
 const sorted=xs=>[...new Set((xs||[]).map(v=>String(v||'').trim()).filter(Boolean))].sort();
 const ctx={JSON,String,Array,Object,Promise,console,session:{empId:'MANAGER'},token:'TEST',hrAccess:'manage',
  orgSettings:empty(),orgDraft:empty(),p79CanonicalOrgOptions:null,employees:people,
  p79HrOrgValue:(e,k)=>({headquarters:e.headquarters,divisions:e.division,offices:e.office,sections:e.section,jobTitles:e.jobTitle}[k]||''),
  uniqSorted:sorted,normalizeOrgSettings:raw=>Object.fromEntries(keys.map(k=>[k,sorted(raw[k]||[])])),
  canHr:()=>true,alert:message=>{throw Error(message)},orgDialog:dialog,
  p79OrgSaveStatus:(text,error)=>{node('orgSaveStatus').textContent=text;node('orgSaveStatus').error=!!error;},
  populateFilters:()=>{},p79IsJobTitleHidden:()=>false,esc:s=>String(s),
  $:node,p79ReadCanonicalOrgOptions:async()=>{throw Error('test must set the cloud response');}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return{ctx,node,dialog,ui,empty};
}
(async()=>{
 const x=setup();
 assert.deepEqual([...x.ctx.p79HrExistingOrgNames('headquarters')],['甲總公司']);
 assert.deepEqual([...x.ctx.p79HrExistingOrgNames('sections')],['機電室','裝卸組']);
 assert.deepEqual([...x.ctx.p79HrExistingOrgNames('jobTitles')],['操作員','領班']);
 let resolveRead;
 x.ctx.p79ReadCanonicalOrgOptions=()=>new Promise(resolve=>{resolveRead=resolve});
 const request=x.ctx.openOrgSettings();
 assert(x.dialog.open,'modal must open and show available assignments without asking to retype');
 for(const [id,label] of [['headquartersList','甲總公司'],['divisionList','倉儲事業部'],
  ['officeList','第一事業處'],['sectionList','裝卸組'],['jobTitleList','領班']]){
  assert(x.node(id).innerHTML.includes(label),'display currently assigned '+label);
  assert(x.node(id).innerHTML.includes('人員現用'),'assigned names clearly marked read-only');
 }
 assert.equal(x.node('saveOrgBtn').disabled,true,'must not save empty stale options before cloud confirmation');
 assert.equal(x.node('newDivision').disabled,true,'user edits must wait until authoritative load');
 x.ctx.orgSettings={...x.empty(),headquarters:['已儲存總公司'],divisions:['已儲存事業部'],
  offices:['已儲存事業處'],sections:['已儲存單位'],jobTitles:['已儲存職稱']};
 x.ctx.p79CanonicalOrgOptions=x.ctx.orgSettings;
 resolveRead({});
 await request;
 assert.equal(x.node('saveOrgBtn').disabled,false,'verified cloud lets authorized manager save');
 assert.equal(x.node('newDivision').disabled,false);
 assert(x.node('headquartersList').innerHTML.includes('已儲存總公司'),'replaces stale draft after cloud load');
 assert(x.node('headquartersList').innerHTML.includes('甲總公司'),'retains staff-assignment names');
 assert(x.node('headquartersList').innerHTML.includes('人員現用'));
 assert(!x.node('headquartersList').innerHTML.includes('尚未建立'));
 assert(x.node('orgSaveStatus').textContent.includes('已核對雲端'));
 // Error must keep assignment visibility, block saving and never drop any draft.
 const broken=setup();
 broken.ctx.p79ReadCanonicalOrgOptions=async()=>{throw Error('連線中斷')};
 await broken.ctx.openOrgSettings();
 assert(broken.node('orgSaveStatus').textContent.includes('連線中斷'));
 assert.equal(broken.node('orgSaveStatus').error,true);
 assert.equal(broken.node('saveOrgBtn').disabled,true);
 assert(broken.node('sectionList').innerHTML.includes('裝卸組'));
 // A later open cannot be left disabled by an earlier unfinished read.
 const race=setup(),deferred=[];
 race.ctx.p79ReadCanonicalOrgOptions=()=>new Promise(resolve=>deferred.push(resolve));
 const first=race.ctx.openOrgSettings(),second=race.ctx.openOrgSettings();
 race.ctx.p79CanonicalOrgOptions={headquarters:['總公司']};
 race.ctx.orgSettings={...race.empty(),headquarters:['總公司']};
 deferred[1]({});
 await second;
 deferred[0]({});
 await first;
 assert.equal(race.node('newHeadquarters').disabled,false);
 assert.equal(race.node('saveOrgBtn').disabled,false);
 console.log('PASS HR organization dialog: staff assignments visible immediately, cloud canonical reload, read-only roster differences, no accidental empty save, failure guard, overlapping requests');
})().catch(e=>{console.error(e);process.exitCode=1});
