'use strict';
// Generate a GAS candidate patch for isolated deployment only; no cloud writes.
const fs=require('node:fs');
const path=require('node:path');
function replaceOnce(text,needle,replacement) {
  const at=text.indexOf(needle);
  if(at<0||text.indexOf(needle,at+needle.length)>=0)
    throw Error('Unexpected GAS source layout: '+needle.slice(0,85));
  return text.slice(0,at)+replacement+text.slice(at+needle.length);
}
function verifySourceCompatibility(source) {
  const text=String(source||'');
  // This candidate targets the V100 guard shape, not the older one-argument GAS.
  const m=text.match(/(?:^|\n)\s*function\s+p79CheckDuplicatePunchGuard_\s*\(([^)]*)\)\s*\{/);
  if(!m) throw Error('Expected V100 guard source: duplicate guard declaration missing');
  const params=m[1].split(',').map(v=>v.trim()).filter(Boolean);
  if(params.length!==2||params[0]!=='record'||params[1]!=='ss')
    throw Error('Expected V100 guard source: p79CheckDuplicatePunchGuard_(record, ss) required; legacy one-argument GAS cannot be patched');
  if(!text.includes('function p79RepairStalePunchGuard_(')||
     !text.includes('function fixtureEndMarker_('))
    throw Error('Expected V100 guard source: repair hook or fixture marker missing; do not patch/deploy this GAS version');
  return true;
}
function apply(source) {
  verifySourceCompatibility(source);
  if(source.includes('function p79AllowNextShiftAfterOldOpenIn_('))
    throw Error('Stale-open candidate already applied');
  const before="  if (normalizeText_(state.type) === type) {\n    const label";
  const after=
    "  // A confirmed old unclosed IN must not become a lifetime punch ban.\n"+
    "  // Do not manufacture a sign-out or waive today's duplicate guard.\n"+
    "  if (type === 'IN' && normalizeText_(state.type) === 'IN' && ss) {\n"+
    "    const recovery=p79AllowNextShiftAfterOldOpenIn_(ss,record,state);\n"+
    "    if (recovery.ok) return recovery;\n"+
    "  }\n\n"+before;
  let result=replaceOnce(source,before,after);
  const helper=fs.readFileSync(path.join(__dirname,'../backend/punch-stale-open-candidate.gs'),'utf8').trim();
  result=replaceOnce(result,'\nfunction fixtureEndMarker_() {}','\n'+helper+'\n\nfunction fixtureEndMarker_() {}');
  return result;
}
module.exports={apply,verifySourceCompatibility};
if(require.main===module) {
  const [input,output]=process.argv.slice(2);
  if(!input||!output)throw Error('Usage: node apply-gas-stale-open-checkin.cjs <isolated-input.gs> <candidate-output.gs>');
  fs.writeFileSync(output,apply(fs.readFileSync(input,'utf8')));
}
