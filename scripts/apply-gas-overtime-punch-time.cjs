'use strict';
const fs=require('node:fs'),vm=require('node:vm');
const helper="function p79OvertimePunchEpochV1_(record){\n  const raw=String(record?.timeStr??record?.['出勤時間']??'').trim();\n  // Explicit timezone means an absolute instant. Never strip the date suffix\n  // or reinterpret UTC as Taiwan wall-clock time.\n  const iso=/^(\\d{4})-(\\d{2})-(\\d{2})[T ](\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d{1,3}))?)?(Z|[+-]\\d{2}:?\\d{2})$/i.exec(raw);\n  const local=/^(\\d{2,4})[/-](\\d{1,2})[/-](\\d{1,2})[ T](\\d{1,2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d{1,3}))?)?$/.exec(raw);\n  const m=iso||local;if(!m)return NaN;\n  let y=Number(m[1]);if(!iso&&y<1911)y+=1911;\n  const month=Number(m[2]),day=Number(m[3]),h=Number(m[4]),n=Number(m[5]),sec=Number(m[6]||0),ms=Number(String(m[7]||'').padEnd(3,'0'));\n  const wall=Date.UTC(y,month-1,day,h,n,sec,ms),check=new Date(wall);\n  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==month-1||check.getUTCDate()!==day||h>23||n>59||sec>59)return NaN;\n  if(!iso)return wall-8*3600000;\n  const z=m[8].toUpperCase();\n  if(z==='Z')return wall;\n  const digits=z.slice(1).replace(':',''),oh=Number(digits.slice(0,2)),om=Number(digits.slice(2));\n  if(oh>23||om>59)return NaN;\n  return wall-(z[0]==='-'?-1:1)*(oh*60+om)*60000;\n }";
function patch(source){
 const names=['p79SaveDirectOvertimeReport_','p79GetOvertimeReportContext_'];
 for(const name of names){
  const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
  if(start<0||end<0)throw Error('missing GAS anchor '+name);
  const part=source.slice(start,end),count=part.split('attendanceCanonicalEpoch_(').length-1;
  if(count!==(name===names[0]?3:1))throw Error('unexpected GAS epoch call count '+name+' '+count);
  source=source.slice(0,start)+part.replaceAll('attendanceCanonicalEpoch_(','p79OvertimePunchEpochV1_(')+source.slice(end);
 }
 const marker='function p79SaveDirectOvertimeReport_(';
 if(source.split(marker).length!==2||source.includes('function p79OvertimePunchEpochV1_('))throw Error('GAS anchor missing or already patched');
 source=source.replace(marker,helper+'\n'+marker);
 new vm.Script(source);return source;
}
module.exports=patch;
module.exports.helperSource=()=>helper;
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output||input===output)throw Error('Usage: node scripts/apply-gas-overtime-punch-time.cjs LIVE_Code.gs PATCHED_Code.gs');fs.writeFileSync(output,patch(fs.readFileSync(input,'utf8')));}
