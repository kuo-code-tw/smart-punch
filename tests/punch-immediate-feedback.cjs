'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
function fixture(path,{busy=false,reject=false}={}){
 const source=fs.readFileSync(path,'utf8'),events=[],frames=[],timers=[],queue=[];let finish;
 const c={window:{requestAnimationFrame:fn=>frames.push(fn)},navigator:{onLine:true},Date,Math,String,JSON,
  writing:busy,syncBatchTotal:0,syncBatchDone:0,syncBatchStartedAt:0,lastDoneAt:0,activeSyncRecordId:'',currentOpText:'',
  isV5AttendanceWrite:()=>true,readQueue:()=>queue,opKey:p=>String(p.record.id),samePayload:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
  p79OrderedReadyQueue:q=>q,p79PunchUploadPriority:()=>0,enqueue:p=>queue.push({key:String(p.record.id),payload:p}),
  remove:()=>{queue.length=0;return true},updateUi(){},desc:()=> 'punch',send:()=>new Promise((resolve,rejectFn)=>finish=()=>reject?rejectFn(Error('offline')):resolve({ok:true,id:'1',fastLane:true,punchWriteConfirmed:true})),
  markRecentAttendanceMutationCloudConfirmed(){},p79PauseAttendanceWrite:()=>false,p79AttendanceRetryDelay:()=>8000,saveQueue(){},
  p79RenderOnlyVisibleAttendanceView:()=>events.push('visible'),renderAdminRecordsTable:()=>events.push('table'),renderAdminLiveTable:()=>events.push('live'),
  showToast:()=>events.push('toast'),setTimeout:fn=>timers.push(fn),drain(){},scheduleDelta(){}};
 vm.createContext(c);const start=source.indexOf('async function submitAttendanceWrite('),end=source.indexOf('\nwindow.p79V5SubmitAttendanceWrite=',start);assert(start>=0&&end>start);vm.runInContext(source.slice(start,end),c);
 return {c,events,frames,timers,finish:()=>finish(),submit:payload=>c.submitAttendanceWrite(payload,'done',()=>events.push('ack'),()=>events.push('error'))};
}
const punch={action:'addRecord',record:{id:'1',source:'employee-punch'}};
(async()=>{
 for(const path of ['assets/port79-attendance-core.js','port79-attendance-core.js']){
  let t=fixture(path),pending=t.submit(punch);assert(!t.events.includes('ack'),'no success before cloud reply');t.finish();await pending;
  assert.deepEqual(t.events,['ack','toast']);assert.equal(t.frames.length,1,'table work waits for the receipt paint');
  t.frames[0]();for(const fn of [...t.timers])fn();assert(t.events.indexOf('ack')<t.events.indexOf('table'));
  t=fixture(path,{reject:true});pending=t.submit(punch);t.finish();await pending;assert.deepEqual(t.events,['error'],'failed writes never report success');
  t=fixture(path,{busy:true});const queued=await t.submit(punch);assert(queued.queued);assert(!t.events.includes('ack'),'queued does not mean persisted');
  t=fixture(path);pending=t.submit({action:'updateRecord',record:{id:'1',source:'admin'}});t.finish();await pending;assert(t.events.indexOf('table')<t.events.indexOf('ack'),'management behavior retained');
  const elements=new Map(),c={window:{p79SetPunchProgress:m=>events.push(m)},document:{getElementById:id=>elements.get(id),createElement:()=>({style:{},setAttribute(){}}),body:{appendChild:el=>elements.set(el.id,el)}}},events=[];vm.createContext(c);
  const source=fs.readFileSync(path,'utf8'),start=source.indexOf('(function installPunchInstantFeedback(){');vm.runInContext(source.slice(start),c);
  c.window.p79SetPunchProgress('正在核對打卡資料與定位，請稍候…');const banner=elements.get('p79PunchInstantFeedback');assert.equal(banner.style.display,'block');assert(banner.textContent.includes('處理中'));assert(!/打卡成功|打卡完成|雲端已收到/.test(banner.textContent));
  c.window.p79SetPunchProgress('');assert.equal(banner.style.display,'none');assert.equal(events.length,2,'original guards still receive all state transitions');
 }
 console.log('PASS immediate visible pending feedback, no false success, actual receipt before deferred table rendering, failed/queued writes stay unconfirmed, management path retained in both cores');
})().catch(error=>{console.error(error);process.exitCode=1});
