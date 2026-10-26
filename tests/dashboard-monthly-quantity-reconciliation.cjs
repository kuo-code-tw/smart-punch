function run(){
  const assert=require('node:assert/strict');
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
  function extract(name){
    const begin=html.indexOf('function '+name+'(');
    assert(begin>=0,'Missing function '+name);
    const end=html.indexOf('\n}',begin);
    assert(end>begin,'Missing function end '+name);
    return html.slice(begin,end+2);
  }
  const host={innerHTML:'',visible:false,classList:{add(){host.visible=false;},remove(){host.visible=true;}},querySelector(){return null}};
  const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const ctx={
    Map,Set,Math,Number,String,Array,
    num:v=>Number(v)||0,
    round:(v,n=2)=>Number(Number(v).toFixed(n)),
    esc:escape,
    dashboardSignedDiff:v=>(v>0?'+':'')+String(v),
    canonicalOperationalRecords:rs=>rs,
    recordMoveValues:r=>({disc:r.disc,load:r.load}),
    document:{getElementById:id=>id==='dashboardQuantityReconciliation'?host:null}
  };
  vm.createContext(ctx);
  vm.runInContext(extract('dashboardQuantityReconciliation'),ctx);
  vm.runInContext(extract('renderDashboardQuantityReconciliation'),ctx);
  const jobs=[
    {workingNo:'A',vessel:'Cross month 1',totalContainers:497,shiftMoves:0,totalMoves:497},
    {workingNo:'B',vessel:'Cross month 2',totalContainers:771,shiftMoves:0,totalMoves:771},
    {workingNo:'C',vessel:'October',totalContainers:19394,shiftMoves:424,totalMoves:19818}
  ];
  const masters=[
    {workingNo:'A',workingSheetSource:{reportRecordIds:['a9','a10']}},
    {workingNo:'B',workingSheetSource:{reportRecordIds:['b9','b10']}},
    {workingNo:'C',workingSheetSource:{reportRecordIds:['c10']}}
  ];
  const rec=(id,no,date,qty)=>({id,workingNo:no,workDate:date,source:'working-report',disc:qty,load:0});
  const records=[
    rec('a9','A','2026-09-30',116),rec('a10','A','2026-10-01',381),
    rec('b9','B','2026-09-30',61),rec('b10','B','2026-10-01',710),
    rec('b-stale','B','2026-10-01',102),rec('c10','C','2026-10-26',19818)
  ];
  const data=ctx.dashboardQuantityReconciliation('2026-10',jobs,records,masters,21086);
  assert.equal(data.shipCount,3);
  assert.equal(data.bill,20662);
  assert.equal(data.shift,424);
  assert.equal(data.moves,21086);
  assert.equal(data.currentMoves,21086);
  assert.equal(data.otherMonthOrUnloaded,0);
  assert.equal(data.otherLoadedMoves,177); // Carried into the completion month, not deducted.
  assert.equal(data.staffOnlyDifference,0);
  assert.equal(data.staffMoves,21086);
  assert.equal(data.orphanMoves,102);
  assert.equal(data.orphans.length,1);
  assert.equal(data.orphans[0].id,'b-stale');
  assert.equal(data.missingIdLists,0);
  assert.equal(data.shipDetails.length,1);
  assert.deepEqual(records.map(x=>x.disc),[116,381,61,710,102,19818],'Read-only reconciliation must never mutate data');
  ctx.renderDashboardQuantityReconciliation('2026-10',jobs,records,masters,21086);
  assert.equal(host.visible,true);
  assert(host.innerHTML.includes('21086'),'Overview must show 21086 driver and ship Moves');
  assert(host.innerHTML.includes('21086'));
  assert(host.innerHTML.includes('102'));
  assert(host.innerHTML.includes('b-stale'));
  assert(host.innerHTML.includes('跨月'));
  assert(host.innerHTML.includes('只讀核對'));
  const partial=ctx.dashboardQuantityReconciliation('2026-10',jobs,records.filter(r=>r.workDate.startsWith('2026-10')),masters,21086);
  assert.equal(partial.otherMonthOrUnloaded,177,'Unavailable cross-month drivers must remain a visible unresolved gap');
  assert.equal(partial.otherLoadedMoves,0,'Unavailable old-month rows must not be misrepresented as verified');
  const zero=ctx.dashboardQuantityReconciliation('2026-10',[{workingNo:'Z',totalContainers:0,shiftMoves:10,totalMoves:10}],
    [rec('z','Z','2026-10-26',10)],[{workingNo:'Z',workingSheetSource:{reportRecordIds:['z']}}],10);
  assert.equal(zero.bill,0,'Zero-billing ship must not fall back to total Moves');
  assert.equal(zero.moves,10);
  assert.equal(ctx.dashboardQuantityReconciliation('',jobs,records,masters,20909),null);
  ctx.renderDashboardQuantityReconciliation('',jobs,records,masters,20909);
  assert.equal(host.visible,false);
  const missing=ctx.dashboardQuantityReconciliation('2026-10',[jobs[0]],[records[1]],[],381);
  assert.equal(missing.missingIdLists,1,'Missing source linkage must be flagged');
  const malicious=ctx.dashboardQuantityReconciliation('2026-10',jobs,[...records,rec('<img onerror=alert(1)>','B','2026-10-26',5)],masters,21086);
  ctx.renderDashboardQuantityReconciliation('2026-10',jobs,[...records,rec('<img onerror=alert(1)>','B','2026-10-26',5)],masters,21086);
  assert(!host.innerHTML.includes('<img onerror='),'Record IDs must be escaped in HTML');
  assert(host.innerHTML.includes('&lt;img'));
  assert(html.includes('>人員作業櫃數</div>'));
  assert(html.includes('>船舶請款櫃數</div>'));
  assert(html.includes('renderDashboardQuantityReconciliation(selectedMonth,allDashboardJobs,records,shipMasters,c)'));
  assert(html.includes('const workload=allShips.reduce((s,x)=>s+num(x.totalContainers),0);'));
  for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(script[1].trim())new vm.Script(script[1]);
  console.log(JSON.stringify({passed:12,failed:0,scope:'AQC 21086-Moves completion-month reconciliation, cross-month rows, orphan 102, safe rendering, zero billing, no mutations, JavaScript syntax'}));
}
run();
