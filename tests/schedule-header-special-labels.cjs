const fs=require('fs'),vm=require('vm'),a=require('assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const begin=html.indexOf('    function p79CompactOvertimeCode('),end=html.indexOf('    function p79SubstituteShiftLabel(',begin);
const c={};vm.createContext(c);vm.runInContext(html.slice(begin,end),c);
for(const prefix of ['颱','選','國','休','例','代'])for(const period of ['08-11','24-08','24-01'])a.equal(c.p79CompactOvertimeCode(prefix+period),prefix+period);
a.equal(c.p79CompactOvertimeCode('颱08:00-11:00'),'颱08-11');a.equal(c.p79CompactOvertimeCode('選25-08'),'');
for(const [type,prefix]of [['颱風日加班','颱'],['選舉日加班','選']]){a.equal(c.p79OvertimePeriodLabel({code:'國08-11',category:'國',typeName:type}),prefix+'08-11');a.equal(c.p79OvertimePeriodLabel({code:prefix+'24-01',category:'國',typeName:type}),prefix+'24-01');}
a.equal(c.p79OvertimePeriodLabel({code:'國08-11',category:'國',typeName:'國定假日加班'}),'國08-11');a.equal(c.p79OvertimePeriodLabel({code:'代08-20',category:'延',overtimeStart:'16',overtimeEnd:'20'}),'16-20');
const style=()=>({values:{},setProperty(k,v,p){this.values[k]=[v,p]}}),headCells=Array.from({length:35},()=>({style:style()}));
let widths=[144,84,84,84,...Array(30).fill(60),56];
const sourceCells=widths.map((_,i)=>({getBoundingClientRect:()=>({width:widths[i]})}));
const row={cells:sourceCells,getBoundingClientRect:()=>({top:100,height:50})},source=sourceCells[0],clone={style:{}};
const headTable={style:style(),querySelectorAll:()=>headCells};const main={isConnected:true,clientWidth:1100,clientTop:0,scrollTop:0,scrollLeft:250,getBoundingClientRect:()=>({top:100})};
const header={style:style(),scrollLeft:0,querySelector:()=>headTable},bar={scrollLeft:0},fixedInner={style:{}};
const g={main,header,bar,fixedInner,fixed:{style:{}},fixedLabel:{style:{}},pairs:[{row,source,clone}],table:{scrollWidth:widths.reduce((a,b)=>a+b),getBoundingClientRect:()=>({height:500})},spacer:{style:{}}};vm.createContext(g);
const geometry=html.slice(html.indexOf('      const updateGeometry=()=>{'),html.indexOf('      updateGeometry();',html.indexOf('      const updateGeometry=()=>{')));
vm.runInContext(geometry+';this.update=updateGeometry;',g);
for(const quotaWidths of [[84,84,84],[64,64,64],[84.25,92.5,84]]){
 widths.splice(1,3,...quotaWidths);main.clientWidth-=10;g.update();a.deepEqual(headCells.map(x=>Number.parseFloat(x.style.values.width[0])),widths);a.equal(Number.parseFloat(headTable.style.values.width[0]),widths.reduce((a,b)=>a+b));a.equal(header.style.values.width[0],main.clientWidth+'px');a.equal(header.scrollLeft,250);a.equal(bar.scrollLeft,250);
 // Every date boundary must align, not only the first day.
 let body=0,head=0;for(let i=0;i<widths.length;i++){a.equal(head,body);body+=widths[i];head+=Number.parseFloat(headCells[i].style.values.width[0]);}
}
console.log('PASS expanded quota columns, fractional/resized widths, all date boundaries, horizontal scroll, and typhoon/election code labels');
