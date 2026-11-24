'use strict';
const fs=require('node:fs');
async function test(page,report){
 const assert=(x,m)=>{if(!x)throw Error(m)};
 const a=report.indexOf(' async function retryCloudRead('),b=report.indexOf(' async function rpc(',a);
 let attempts=0,retries=0;
 const run=new Function('retryableCloudRead','setTimeout',report.slice(a,b)+';return retryCloudRead')(()=>true,fn=>fn());
 try{await run(async()=>{attempts++;throw Error('雲端忙碌')},()=>retries++,{maxAttempts:2,maxDelay:1600});}catch(e){}
 assert(attempts===2&&retries===1,'direct retries bounded');
 attempts=0;try{await run(async()=>{attempts++;throw Error('雲端忙碌')});}catch(e){}
 assert(attempts===5,'legacy busy policy unchanged');
 assert(page.includes('if(!batch&&!draft.directRow)setTimeout'),'single render for direct confirmation');
 assert(page.includes('draft.directRow?30000:45000'),'bounded write wait');
 assert(page.includes('draft.directRow?1:3'),'bounded write lock retries');
 assert(page.includes("draft.onProgress?.('正式寫入')"),'write phase');
 assert(page.includes('expectedPunchStart:item.start,expectedPunchEnd:item.end'),'attendance unchanged');
 assert(page.includes('expectedRevision:cloud.revision'),'revision protection unchanged');
 assert(page.includes('result.report?.planned!==false'),'verified result required');
 assert(report.includes("policy.onStage?.('核對出勤')"),'preflight phase');
 return 'PASS bounded retry, legacy policy unchanged, one render, progress phases and verification retained';
}
test(fs.readFileSync('work-hours/index.html','utf8'),fs.readFileSync('assets/port79-overtime-report.js','utf8')).then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
