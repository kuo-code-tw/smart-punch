const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('hr/index.html','utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0);if(html.slice(a-6,a)==='async ')a-=6;const line=html.slice(a,html.indexOf('\n',a));return line.endsWith('}')?line:html.slice(a,html.indexOf('\n}',a)+2)}
const c={Set,Array,String,Object,JSON,localStorage:{setItem(){}},GAS_URL:'test',session:{empId:'TEST'},P79_HR_ORG_OPTIONS_KEY:'hrOrgOptionsV1',P79_HR_ORG_OPTIONS_V2_KEY:'hrOrgOptionsV2'};vm.createContext(c);
for(const n of ['uniqSorted','normalizeOrgSettings','p79OrgOptionsCacheKey','p79RememberOrgOptions','p79ParseCanonicalOrgOptions','p79ReadCanonicalOrgOptions'])vm.runInContext(fn(n),c);
(async()=>{
 const legacy={departments:['第二事業處','第二事業部','79W作業課'],units:['79W倉庫課'],jobTitles:['AQC','指揮手','新增職稱']};
 const initial=c.normalizeOrgSettings(legacy);assert.deepEqual(Array.from(initial.divisions),['第二事業部']);assert.deepEqual(Array.from(initial.offices),['第二事業處']);assert.deepEqual(Array.from(initial.sections),['79W作業課','79W倉庫課']);assert.equal(initial.departments.length,3);assert.equal(initial.jobTitles.length,3);assert.equal(initial.headquarters.length,0);
 const extended={headquarters:['總公司甲','總公司乙'],divisions:[],offices:['自訂事業處'],sections:['倉庫組','行政室','維修中心']};c.apiGet=async()=>({config:{hrOrgOptionsV1:legacy,hrOrgOptionsV2:extended,unrelated:'keep'}});await c.p79ReadCanonicalOrgOptions();assert.equal(c.p79CanonicalOrgOptions.divisions.length,0);assert.deepEqual(Array.from(c.p79CanonicalOrgOptions.sections),['行政室','倉庫組','維修中心']);assert.equal(c.p79CanonicalOrgOptions.headquarters.length,2);assert.deepEqual(Array.from(c.p79CanonicalOrgOptions.offices),['自訂事業處']);assert.equal(c.orgSettings.jobTitles.length,3);
 c.apiGet=async()=>({config:{hrOrgOptionsV1:legacy,hrOrgOptionsV2:{divisions:[],offices:[],sections:[]}}});await c.p79ReadCanonicalOrgOptions();assert.equal(c.p79CanonicalOrgOptions.headquarters.length,0);assert.equal(c.p79CanonicalOrgOptions.sections.length,0);
 c.apiGet=async()=>({config:{hrOrgOptionsV1:legacy,hrOrgOptionsV2:{divisions:[]}}});await assert.rejects(c.p79ReadCanonicalOrgOptions(),/格式不完整/);
 c.apiGet=async()=>({config:{departments:['原部門'],jobTitles:['領班'],units:['原單位']}});
 await c.p79ReadCanonicalOrgOptions();
 assert.deepEqual(Array.from(c.orgSettings.jobTitles),['領班'],'older saved titles must be restored from config');
 assert.deepEqual(Array.from(c.orgSettings.departments),['原部門']);
 assert.deepEqual(Array.from(c.orgSettings.units),['原單位']);

 for(const id of ['headquartersList','newHeadquarters','divisionList','officeList','sectionList','jobTitleList','newDivision','newOffice','newSection','newJobTitle'])assert(html.includes('id="'+id+'"'),id);
 assert(html.includes('repeat(5,minmax(0,1fr))'));assert(html.includes("apiPost(await makePayload(),60000)"));
 console.log('PASS four-level migration suggestions, explicit empty lists, dynamic titles, malformed config, five-column controls and save timeout');
})().catch(e=>{console.error(e);process.exitCode=1});
