'use strict';
// Generate a candidate GAS patch only. Never deploy or write attendance from this script.
const fs=require('node:fs');

function replaceOnce(text,needle,replacement){
  const at=text.indexOf(needle);
  if(at<0||text.indexOf(needle,at+needle.length)>=0)
    throw Error('Unexpected GAS source layout: '+needle.slice(0,85));
  return text.slice(0,at)+replacement+text.slice(at+needle.length);
}

function apply(source){
  if(!source.includes('function p79CheckDuplicatePunchGuard_(')||
     !source.includes('function p79RepairStalePunchGuard_(')||
     !source.includes('function fixtureEndMarker_('))
    throw Error('Expected V100 guard source not found');
  if(source.includes('function p79AllowNextShiftAfterOldOpenIn_('))
    throw Error('Stale-open candidate already applied');
  const before="  if (normalizeText_(state.type) === type) {\n    const label";
  const after=
    "  // A *confirmed* old, unclosed IN is an exception, not a lifetime login ban.\n"+
    "  // Never manufacture a sign-out, and never waive the same-day duplicate guard.\n"+
    "  if (type === 'IN' && normalizeText_(state.type) === 'IN' && ss) {\n"+
    "    const recovery=p79AllowNextShiftAfterOldOpenIn_(ss,record,state);\n"+
    "    if (recovery.ok) return recovery;\n"+
    "  }\n\n"+before;
  let result=replaceOnce(source,before,after);
  const helper=String.raw