const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('hr/index.html','utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0);if(html.slice(a-6,a)==='async ')a-=6;const line=html.slice(a,html.indexOf('\n',a));return line.endsWith('}')?line:html.slice(a,html.indexOf('\n}',a)+2)}
function setup(mode='normal'){
 const els={saveOrgBtn:{textContent:'儲存',disabled:false},orgSaveStatus:{style:{}},status:{textContent:''}};
 let cfg={hrOrgOptionsV1:{departments:['D'],units:['U'],jobTitles:['old']},hrOrgOptionsV2:{headquarters:['HQ'],divisions:['DIV'],offices:['OFF'],sections:['SEC']},gps:{radius:100},idle:10};const calls=[],cache=[];
 const c={Set,Array,String,Object,JSON,Promise,TextEncoder,Error,window:{},console,session:{empId:'TEST'},GAS_URL:'test',localStorage:{setItem:(k,v)=>cache.push(v)},$:id=>els[id],hrAccess:'manage',canHr:()=>true,orgDialog:{closed:false,close(){this.closed=true}},populateFilters(){},alert(){throw Error('unauthorized')},setTimeout:fn=>fn(),P79_HR_ORG_OPTIONS_KEY:'hrOrgOptionsV1',P79_HR_ORG_OPTIONS_V2_KEY:'hrOrgOptionsV2',orgDraft:{departments:['D'],jobTitles:['new','指揮手'],units:['U'],headquarters:['總公司'],divisions:['事業部'],offices:['事業處'],sections:['行政室']},
 apiGet:async()=>{calls.push('GET');return{ok:true,config:cfg}},apiPost:async p=>{calls.push(p.action);if(mode==='auth')throw Error('權限不足');if(p.action==='hrSaveOrgSettings')return{ok:true};cfg=p.config;if(mode==='timeout')throw Error('signal is aborted without reason');if(mode==='old')return{ok:true};if(mode==='mismatch')return{ok:true,config:{...cfg,hrOrgOptionsV2:{...cfg.hrOrgOptionsV2,headquarters:['different']}}};if(mode==='malformed')return{ok:true,config:{}};return{ok:true,config:cfg}}};
 vm.createContext(c);for(const n of ['uniqSorted','normalizeOrgSettings','p79OrgOptionsCacheKey','p79RememberOrgOptions','p79ParseCanonicalOrgOptions','p79ReadCanonicalOrgOptions','p79OrgSaveStatus','p79OrgSaveIsLockBusy','p79RetryOrgOperation','p79RetryOrgSave','saveOrgSettings'])vm.runInContext(fn(n),c);
 return{c,calls,els,cache,config:()=>cfg};
}
(async()=>{
 let x=setup();await x.c.saveOrgSettings();assert.deepEqual(x.calls,['hrSaveOrgSettings','GET','saveConfig']);assert(x.c.orgDialog.closed);assert.match(x.els.status.textContent,/✅/);assert.equal(x.config().gps.radius,100);assert.equal(x.config().idle,10);assert.equal(x.c.orgSettings.headquarters[0],'總公司');
 for(const mode of ['old','timeout']){x=setup(mode);await x.c.saveOrgSettings();assert.deepEqual(x.calls,['hrSaveOrgSettings','GET','saveConfig','GET']);assert(x.c.orgDialog.closed);assert.equal(x.calls.filter(a=>a==='saveConfig').length,1)}
 for(const mode of ['mismatch','malformed']){x=setup(mode);await x.c.saveOrgSettings();assert(!x.c.orgDialog.closed);assert.equal(x.els.status.textContent,'');assert.match(x.els.orgSaveStatus.textContent,/讀回不一致/);assert(!x.els.saveOrgBtn.disabled)}
 x=setup('auth');await x.c.saveOrgSettings();assert.deepEqual(x.calls,['hrSaveOrgSettings']);assert(!x.c.orgDialog.closed);assert.match(x.els.orgSaveStatus.textContent,/權限不足/);
 x=setup();x.c.orgDraft.jobTitles=['x'.repeat(9000)];await x.c.saveOrgSettings();assert.equal(x.calls.length,0);assert(!x.c.orgDialog.closed);
 console.log('PASS 7 fast-save scenarios: three requests, old reply fallback, uncertain write readback, mismatch, malformed reply, auth stop, oversized draft');
})().catch(e=>{console.error(e);process.exitCode=1});
