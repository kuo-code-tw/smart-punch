const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const extract=name=>{
 const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',start);
 assert(start>=0&&end>start,'function not found '+name);
 return html.slice(start,end+6);
};
const month='2026-10',day=d=>month+'-'+String(d).padStart(2,'0');
const roster=Object.fromEntries(Array.from({length:31},(_,i)=>[day(i+1),'早']));
roster[day(3)]='國'; // national-classified typhoon stop
roster[day(4)]='國'; // national-classified typhoon work
roster[day(7)]='國'; // genuine national day, unaffected
roster[day(12)]='休'; // ordinary rest label unchanged
const emp={id:'EMP',name:'測試'},initial=JSON.stringify(roster);
const c={
 Map,Set,Date,Array,String,Object,Number,Math,JSON,
 monthlyScheduleData:{EMP:roster},monthlyScheduleMeta:{EMP:{}},
 p79RestQuota:()=>({days:31,counts:{例:4,休:5,國:2}}),
 p79AutomaticRestMetadata:()=>({}),p79EmploymentStartDate:()=>'',scheduleEscapeHtml:x=>String(x||'')
};
vm.createContext(c);
vm.runInContext(extract('p79DailyRestCount'),c);
vm.runInContext(extract('p79ScheduleRestCountCells'),c);
const compute=(off,work)=>c.p79ScheduleRestCountCells(emp,month,{},off,work);
const cell=(html,category)=>html.match(new RegExp('<td data-rest-category="'+category+'"[\\s\\S]*?<\\/td>'))?.[0]||'';
assert.deepEqual(JSON.parse(JSON.stringify(c.p79DailyRestCount(emp,month,{}).counts)),{例:0,休:0,國:3},'start with three national days');
let result=compute([day(3)],[day(4)]);
assert.match(cell(result,'國'),/<span>1\/1<\/span>/,'two typhoon dates are subtracted from 國');
assert.match(cell(result,'颱'),/<span>2 天<\/span>/,'two typhoon days count once each');
assert.doesNotMatch(cell(result,'國'),/03、04/,'national tooltip does not retain typhoon days');
assert.match(cell(result,'國'),/已移至「颱」統計/);
assert.doesNotMatch(cell(result,'颱'),/停\d+／勤\d+/,'no separate off/work subline');
assert.equal([...result.matchAll(/<td\b/g)].length,4,'only four summary columns');
result=compute([day(3),day(4)],[day(4)]);
assert.match(cell(result,'國'),/<span>1\/1<\/span>/,'duplicate event day never subtracts twice');
assert.match(cell(result,'颱'),/<span>2 天<\/span>/,'duplicate event day counted once');
result=compute([],[]);
assert.match(cell(result,'國'),/<span>3\/0<\/span>/,'no typhoon flag never alters 國');
assert.match(cell(result,'颱'),/<span>0 天<\/span>/);
roster[day(4)]='早';
c.monthlyScheduleMeta.EMP[day(4)]={overtimeReport:{id:'SAVED',category:'國'}};
const unchanged=JSON.stringify(c.monthlyScheduleMeta);
result=compute([day(3)],[day(4)]);
assert.match(cell(result,'國'),/<span>1\/1<\/span>/,'formal overtime category 國 on typhoon day belongs solely to 颱 count');
assert.match(cell(result,'颱'),/<span>2 天<\/span>/);
assert.equal(JSON.stringify(c.monthlyScheduleMeta),unchanged,'confirmed overtime report is preserved');
assert.equal(JSON.stringify(roster),JSON.stringify({...JSON.parse(initial),[day(4)]:'早'}),'do not change shifts');
assert(html.includes('p79ScheduleRestCountCells(emp,yearMonth,automaticRestMeta,typhoonShownDates,typhoonWorkedDates)'));
for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(script[1].trim())new vm.Script(script[1]);
console.log('PASS national/typhoon no-double-count, typhoon simple total, duplicate/off+worked, saved report unchanged, quota unchanged');
