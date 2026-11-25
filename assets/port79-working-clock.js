/* Ship-operation clocks: spreadsheet wall time is Taipei, not a browser instant.
 * Optional UTC interpretation is a read-only comparison, never a database repair. */
(function(root){
'use strict';
const KEY='p79_working_report_clock_preview_v1';
const TAIPEI='taipei',UTC='assume-utc';
function normalizeMode(mode){return mode===UTC?UTC:TAIPEI;}
function getMode(){try{return normalizeMode(root.localStorage?.getItem(KEY));}catch(_){return TAIPEI;}}
function setMode(mode){const value=normalizeMode(mode);try{root.localStorage?.setItem(KEY,value);return value;}catch(_){return null;}}
function dateParts(date){
 const m=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(String(date||''));
 if(!m)return null;
 const t=Date.UTC(+m[1],+m[2]-1,+m[3]);const d=new Date(t);
 return d.toISOString().slice(0,10)===m[0]?t:null;
}
function clockMinutes(clock){
 const m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(clock||'').trim());
 if(!m||+m[1]>24||+m[2]>59||+(m[3]||0)>59||(+m[1]===24&&(+m[2]||+(m[3]||0))))return null;
 return +m[1]*60 + +m[2] + +(m[3]||0)/60;
}
function split(t){const s=new Date(t).toISOString();return {date:s.slice(0,10),clock:s.slice(11,16)};}
function project(row,mode=getMode()){
 const raw={date:String(row?.workDate||''),start:String(row?.startTime||''),end:String(row?.endTime||''),endDate:'',converted:false};
 if(normalizeMode(mode)!==UTC||String(row?.source||'')!=='working-report')return raw;
 const date=dateParts(raw.date),a=clockMinutes(raw.start),b=clockMinutes(raw.end);
 if(date===null||a===null||b===null)return raw;
 const end=b<a?b+1440:b;
 const startLocal=split(date+(a+480)*60000),endLocal=split(date+(end+480)*60000);
 return {date:startLocal.date,start:startLocal.clock,end:endLocal.clock,endDate:endLocal.date,converted:true};
}
const api={KEY,TAIPEI,UTC,normalizeMode,getMode,setMode,project};
root.P79WorkingClock=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
