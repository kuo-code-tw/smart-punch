const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const g={};vm.runInNewContext(fs.readFileSync('assets/port79-overtime-reason.js','utf8'),{window:g});
for(const value of [null,undefined,false,'',0]){
 assert.equal(g.P79OvertimeReason.amended(null,value).verified,false,'unreported attendance must not crash or acquire audit evidence');
 assert.equal(g.P79OvertimeReason.amended({id:'NEW',createdAt:'2026-10-27'},value).verified,false);
}
const report={id:'SAME-ID',amendments:[{confirmed:true,at:'2026-10-27T12:00:00Z',actor:'測試管理員',reason:'更正時段'}]};
assert.equal(g.P79OvertimeReason.amended(report,null).verified,true,'cloud report history remains discoverable with absent day metadata');
assert.equal(g.P79OvertimeReason.amended(report,null).history.length,1);
assert.equal(g.P79OvertimeReason.amended({id:'X'},{overtimeAmendments:[{confirmed:false,at:'x',actor:'x'}]}).verified,false);
console.log('PASS unreported attendance/null metadata never interrupt overtime rendering; only confirmed audit evidence is classified as modified');
