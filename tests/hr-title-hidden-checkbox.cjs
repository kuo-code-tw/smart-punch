const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('hr/index.html','utf8');
assert(html.includes('onchange="setOrgJobTitleHidden('));
assert(html.includes('type="checkbox" aria-label="隱藏職稱'));
assert(html.includes('async function saveOrgSettings(keepOpen=false)'));
assert(html.includes('if(!keepOpen)orgDialog.close()'));
assert(!html.includes('toggleOrgJobTitleVisibility('));
const from=html.indexOf('function setOrgJobTitleHidden('),to=html.indexOf('function removeOrgItem(',from);
assert(from>=0&&to>from);
let updates=0,queued=0;
const c={orgDraft:{jobTitles:['AQC','領班'],hiddenJobTitles:[]},hrAccess:'manage',
 canHr:()=>true,p79JobTitleKey:x=>String(x).toUpperCase(),uniqSorted:x=>[...new Set(x)].sort(),
 renderOrgSettings(){updates++},p79OrgSaveStatus(){},p79QueueOrgTitleAutoSave(){queued++}};
vm.createContext(c);vm.runInContext(html.slice(from,to),c);
c.setOrgJobTitleHidden('領班',true);
assert.deepEqual([...c.orgDraft.hiddenJobTitles],['領班']);
c.setOrgJobTitleHidden('領班',false);
assert.equal(c.orgDraft.hiddenJobTitles.length,0);
assert.equal(updates,2);assert.equal(queued,2);
console.log('PASS HR job-title checkboxes toggle visibility and queue automatic save');
