'use strict';
// Isolated static compatibility tests. Never calls GAS or touches cloud spreadsheets.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const child=require('node:child_process');
const assert=require('node:assert/strict');
const patch=require('../scripts/apply-gas-stale-open-checkin.cjs');
const baseline=fs.readFileSync('backend/punch-deleted-guard-baseline.gs','utf8');
const v100=require('../scripts/apply-gas-punch-deleted-guard.cjs').apply(baseline);

let passed=0;
function test(label,run){run();passed++;console.log('PASS '+label);}
test('known V100 guard passes signature and produces test-only candidate',()=>{
  assert.equal(patch.verifySourceCompatibility(v100),true);
  const output=patch.apply(v100);
  assert(output.includes('function p79AllowNextShiftAfterOldOpenIn_(ss, record, state)'));
  assert(output.includes('previousOpenShiftNeedsReview'));
});
test('legacy V6 one-argument duplicate guard is refused, even if hooks are present',()=>{
  const v6=v100.replace('function p79CheckDuplicatePunchGuard_(record, ss) {',
    'function p79CheckDuplicatePunchGuard_(record) {');
  assert.throws(()=>patch.verifySourceCompatibility(v6),/legacy one-argument GAS/);
  assert.throws(()=>patch.apply(v6),/record, ss.*required/);
});
test('missing repair hook is refused',()=>{
  const src=v100.replace('function p79RepairStalePunchGuard_(', 'function legacyRepair_(');
  assert.throws(()=>patch.apply(src),/repair hook or fixture marker missing/);
});
test('missing fixture marker is refused',()=>{
  const src=v100.replace('function fixtureEndMarker_()', 'function olderEnd_()');
  assert.throws(()=>patch.apply(src),/repair hook or fixture marker missing/);
});
test('missing duplicate guard declaration is refused',()=>{
  const src=v100.replace('function p79CheckDuplicatePunchGuard_(', 'function legacyGuard_(');
  assert.throws(()=>patch.apply(src),/duplicate guard declaration missing/);
});
test('two parameters with wrong order cannot pass',()=>{
  const src=v100.replace('function p79CheckDuplicatePunchGuard_(record, ss)',
    'function p79CheckDuplicatePunchGuard_(ss, record)');
  assert.throws(()=>patch.apply(src),/record, ss.*required/);
});
test('reapplying same candidate is refused',()=>{
  assert.throws(()=>patch.apply(patch.apply(v100)),/already applied/);
});
test('CLI on incompatible GAS refuses output file, no partial candidate written',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'p79-gas-compat-'));
  try{
    const input=path.join(folder,'v6.gs'),output=path.join(folder,'candidate.gs');
    fs.writeFileSync(input,v100.replace('function p79CheckDuplicatePunchGuard_(record, ss) {',
      'function p79CheckDuplicatePunchGuard_(record) {'));
    const cli=child.spawnSync(process.execPath,
      ['scripts/apply-gas-stale-open-checkin.cjs',input,output],{encoding:'utf8'});
    assert.notEqual(cli.status,0,'unsupported GAS must fail');
    assert.match(cli.stderr,/legacy one-argument GAS/);
    assert.equal(fs.existsSync(output),false,'incompatible version must never produce deployable file');
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
console.log(JSON.stringify({passed,failed:0,scope:'synthetic compatibility and CLI gate only; no Apps Script connection or cloud writes'}));
