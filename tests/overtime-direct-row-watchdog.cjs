'use strict';
const fs=require('node:fs');
async function test(page){
 const assert=(x,m)=>{if(!x)throw Error(m)};
 const start=page.indexOf('        function p79RunDirectReport('),end=page.indexOf('        async function p79OpenMainPlannedOvertimeRow',start);
 const {run,guard}=new Function(page.slice(start,end)+';return {run:p79RunDirectReport,guard:p79AssertDirectReportActive}')();
 const controller=()=>({signal:{aborted:false},abort(){this.signal.aborted=true}});
 let op={controller:controller(),stopped:false,writeStarted:false},writes=0,finish;
 const slow=new Promise(r=>finish=r);
 try{await run(async()=>{await slow;guard(op);writes++;},op,5);throw Error('missing timeout');}catch(e){assert(/尚未送出/.test(e.message),'read timeout explicit');}
 finish();await Promise.resolve();await Promise.resolve();
 assert(op.stopped&&op.controller.signal.aborted&&writes===0,'late read never writes');
 op={controller:controller(),stopped:false,writeStarted:true};
 try{await run(()=>new Promise(()=>{}),op,5);throw Error('missing timeout');}catch(e){assert(/寫入結果待確認/.test(e.message),'write timeout unknown not failure');}
 op={controller:controller(),stopped:false,writeStarted:false};
 assert(await run(()=>Promise.resolve(7),op,100)===7&&!op.stopped,'success no abort');
 assert(page.includes('button.disabled=verified;button.textContent=verified?'),'button release independent of repaint');
 assert(page.includes('p79AssertDirectReportActive(draft.directOperation);'),'late write guarded');
 return 'PASS unresolved read/write, deadline, no late write, button release';
}
test(fs.readFileSync('work-hours/index.html','utf8')).then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
