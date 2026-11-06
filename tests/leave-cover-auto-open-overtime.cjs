'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync('leave/index.html','utf8');
const daily=fs.readFileSync('assets/port79-leave-daily-simple.js','utf8');
const a=page.indexOf('function p79LaunchLeaveOvertimeAfterSave(){');
const b=page.indexOf('\nasync function p79OpenLeaveOvertimeHandoff(){',a);
assert(a>=0&&b>a,'auto-open helper exists');
const code=page.slice(a,b);
const statuses=[],handoff={entries:[{empId:'E2',leaveId:'L1',date:'2026-11-06'}]},calls=[];
let allow=true,entry=handoff,throwOpen=false;
const c={
 console:{warn:(...args)=>calls.push(['warning',...args])},
 p79GetLeaveHandoff:()=>entry,
 p79CanReportOvertime:()=>allow,
 setStatus:(message,type)=>statuses.push({message,type}),
 p79OpenLeaveOvertimeHandoff:()=>{calls.push('opened');return throwOpen?Promise.reject(Error('offline')):Promise.resolve();}
};
vm.createContext(c);vm.runInContext(code,c);
(async()=>{
 entry=null;assert.equal(c.p79LaunchLeaveOvertimeAfterSave(),false);assert.equal(calls.length,0,'no pending item, no filing');
 entry=handoff;allow=false;assert.equal(c.p79LaunchLeaveOvertimeAfterSave(),false);
 assert.equal(calls.length,0,'permission denied, must not open');
 assert.match(statuses.at(-1).message,/沒有加班申報權限/);
 allow=true;assert.equal(c.p79LaunchLeaveOvertimeAfterSave(),true);
 assert.deepEqual(calls,['opened'],'open first report when permission and pending handoff exist');
 throwOpen=true;assert.equal(c.p79LaunchLeaveOvertimeAfterSave(),true);
 await new Promise(resolve=>setImmediate(resolve));
 assert(statuses.some(x=>x.message.includes('加班視窗未能開啟')),'failed navigation remains actionable');
 assert.equal(entry.entries.length,1,'failed navigation never loses report queue');

 const saveStart=page.indexOf('async function saveAdminCreateLeave(){');
 const saveEnd=page.indexOf('</script>',saveStart);
 assert(saveStart>=0&&saveEnd>saveStart);
 const save=page.slice(saveStart,saveEnd);
 assert(save.includes('p79LaunchLeaveOvertimeAfterSave();'),'legacy single/multi-day entry opens filing too');
 assert(save.indexOf('p79AppendLeaveHandoffEntries(entries.map')<save.indexOf('p79LaunchLeaveOvertimeAfterSave();'),'must persist handoff first');
 assert(save.indexOf('p79LaunchLeaveOvertimeAfterSave();')<save.indexOf('void loadCloud(false,true);'),'open before background refresh');
 const dailySuccess=daily.slice(daily.indexOf("  $id('adminCreateLeaveDialog').close();"),daily.indexOf(' }catch(error){',daily.indexOf("  $id('adminCreateLeaveDialog').close();")));
 assert(dailySuccess.includes('window.p79LaunchLeaveOvertimeAfterSave()'),'daily app opens report after complete save');
 assert(dailySuccess.indexOf("  $id('adminCreateLeaveDialog').close();")<dailySuccess.indexOf('window.p79LaunchLeaveOvertimeAfterSave()'),'daily window closes before report opens');
 assert(!daily.slice(daily.indexOf('async function saveDaily(){'),daily.indexOf("  $id('adminCreateLeaveDialog').close();")).includes('p79LaunchLeaveOvertimeAfterSave()'),'partial writes never open the report');
 const noCover=page.slice(page.indexOf('async function p79SaveCreateLeaveWithoutCover('),page.indexOf('async function saveAdminCreateLeave(){'));
 assert(!noCover.includes('p79LaunchLeaveOvertimeAfterSave'),'no-cover mode does not open filing');
 const approved=page.slice(page.indexOf('async function p79SaveLeaveCover(){'),page.indexOf('async function setLeaveStatus(',page.indexOf('async function p79SaveLeaveCover(){')));
 assert(approved.includes('await p79OpenLeaveOvertimeHandoff();'),'approved cover continues auto filing');
 for(const script of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))
  if(!/\bsrc=|application\/json|importmap/.test(script[1])&&script[2].trim())new vm.Script(script[2]);
 new vm.Script(daily);
 console.log('PASS leave overtime auto-open: permission, no-cover, confirmed handoff, failure retention, daily and legacy routes, syntax');
})().catch(e=>{console.error(e);process.exitCode=1});
