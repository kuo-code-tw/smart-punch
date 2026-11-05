'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
function fn(name){let start=html.indexOf('        function '+name+'(');if(start<0)start=html.indexOf('        async function '+name+'(');assert(start>=0,name);return html.slice(start,html.indexOf('\n        }',start)+10);}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({fallback=false,admin=false}={}){
 let now=100000,finishCloud,finishDevice;const gps=[],events=[],writes=[],toasts=[];
 const employee={empId:'E1',deviceId:'PHONE',sessionFallback:fallback};
 const c={Date:{now:()=>now},Promise,JSON,String,console,window:{},currentEmp:employee,
  sysConfig:{adminIds:admin?['E1']:[]},document:{getElementById:()=>null},
  isFirstPunchVerified:e=>!e.sessionFallback,isSamePhysicalDeviceId:(a,b)=>a===b,getDeviceId:()=> 'PHONE',
  getConfiguredPunchLocations:()=>[{name:'PORT',radius:100}],
  requestLocationPermission:cb=>{events.push('gps');gps.push(cb)},
  p79MobileHasOfficial:()=>false,p79MobileOfficial:{lastError:''},
  p79MobileRefreshOfficial:()=>{events.push('cloud');return new Promise(r=>finishCloud=r)},
  p79SetPunchProgress:message=>events.push(message),
  getOpenClockInShift:()=>null,validateEmployeePunchSequence:()=>({ok:true}),
  updateHomeClockInButtonState(){},showToast:message=>toasts.push(message),
  normalizeEmployeeIdentifiers:e=>e,employees:[],saveEmployees(){},savePersistentEmployeeSession(){},
  loginEmployee(){},verifyAndBindCurrentDevice:async()=>true,
  execPunch:(...args)=>{writes.push(args);c.releasePunchGuard()},
  refreshPunchLocationConfig:async()=>{},pendingFirstPunchStatus:'',
  p79PunchInProgress:false,p79PunchGuardStartedAt:0};
 c.window.P79PunchDeviceState={read:()=>{events.push('device');return new Promise(r=>finishDevice=r)}};
 vm.createContext(c);for(const name of ['p79PreparePunchChecks','p79RefreshPunchDeviceFromMaster','releasePunchGuard','handlePunch'])vm.runInContext(fn(name),c);
 return {c,gps,events,writes,toasts,cloud:ok=>finishCloud(ok),device:master=>finishDevice(master),advance:n=>now+=n};
}
(async()=>{
 let t=setup(),attempt=t.c.handlePunch('上班簽到');
 assert(t.events.includes('gps')&&t.events.includes('cloud'),'GPS starts without waiting for cloud');
 assert.equal(t.writes.length,0);t.gps.shift()(true,10,{name:'PORT',radius:100});
 await tick();assert.equal(t.writes.length,0,'GPS alone cannot write');
 t.cloud(true);await attempt;assert.equal(t.writes.length,1);
 t=setup();attempt=t.c.handlePunch('上班簽到');t.gps.shift()(true,10,{name:'PORT',radius:100});t.cloud(false);await attempt;assert.equal(t.writes.length,0,'cloud rejection blocks write even with GPS');
 t=setup();attempt=t.c.handlePunch('上班簽到');t.gps.shift()(false,null,null);t.cloud(true);await attempt;assert.equal(t.writes.length,0,'GPS failure blocks write');assert.equal(t.c.p79PunchInProgress,false);
 t=setup();attempt=t.c.handlePunch('上班簽到');t.gps.shift()(true,10,{name:'PORT',radius:100});t.c.currentEmp={empId:'OTHER'};t.cloud(true);await attempt;assert.equal(t.writes.length,0,'account change blocks old attempt');
 t=setup();attempt=t.c.handlePunch('上班簽到');t.gps.shift()(true,10,{name:'PORT',radius:100});t.advance(9000);t.cloud(true);await attempt;assert.equal(t.writes.length,0);assert.equal(t.gps.length,1,'old GPS is reacquired');t.gps.shift()(true,10,{name:'PORT',radius:100});assert.equal(t.writes.length,1);
 t=setup();attempt=t.c.handlePunch('上班簽到');t.gps.shift()(true,10,{name:'PORT',radius:100});t.c.getConfiguredPunchLocations=()=>[{name:'NEW',radius:50}];t.cloud(true);await attempt;assert.equal(t.gps.length,1,'changed location rules require GPS again');assert.equal(t.writes.length,0);t.gps.shift()(false,null,null);
 t=setup();attempt=t.c.handlePunch('上班簽到');t.advance(16000);await t.c.handlePunch('上班簽到');assert.equal(t.events.filter(e=>e==='cloud').length,1,'no second attempt after 15 seconds');t.gps.shift()(true,10,{name:'PORT',radius:100});t.cloud(false);await attempt;
 t=setup({fallback:true});attempt=t.c.handlePunch('上班簽到');assert(t.events.includes('device')&&t.events.includes('cloud'),'binding lookup and attendance start together');t.device({empId:'E1',deviceId:'PHONE'});t.cloud(true);await attempt;assert.equal(t.events.filter(e=>e==='device').length,1,'prepared device read is consumed once');assert.equal(t.gps.length,1);t.gps.shift()(true,10,{name:'PORT',radius:100});assert.equal(t.writes.length,1);
 t=setup({admin:true});attempt=t.c.handlePunch('上班簽到');t.cloud(true);await attempt;assert.equal(t.gps.length,0);assert.equal(t.writes.length,1,'existing admin exemption retained');
 console.log('PASS concurrent read-only checks, no write before all gates, cloud/GPS failure, identity change, stale/config-changed GPS reacquisition, repeat click guard, one device read, admin exemption');
})().catch(error=>{console.error(error);process.exitCode=1});
