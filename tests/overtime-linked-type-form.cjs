const fs=require('fs'),vm=require('vm'),a=require('assert/strict'),source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const pair=source.slice(source.indexOf(' function reportPair('),source.indexOf(' function advanceLeaveHandoff('));
const preview=source.slice(source.indexOf('   function preview(){'),source.indexOf('   const refreshTypes='));
for(const category of ['休','國','例','延','代']){
const forSelect={value:'TARGET'},empSelect={value:'WORKER'},el={querySelector:key=>key==='#p79OtForWrap'?{style:{}}:{setAttribute(){},textContent:''}},prefill={leaveHandoffId:'LEAVE',forEmpId:'TARGET',empId:'WORKER'},people=[{empId:'TARGET',name:'測試請假者'},{empId:'WORKER',name:'測試代班者'}],rows=[[category,'CODE',8,12,'','','08','16']],c={forSelect,empSelect,el,prefill,people,rows,kind:{value:'TYPE',setAttribute(){}},select:{selectedIndex:0,value:'0',setAttribute(){}},refreshPairPeople(){},matches:()=>true};vm.createContext(c);vm.runInContext(source,c);c.displayPeriodCode=c.P79Overtime.displayPeriodCode;vm.runInContext(pair+preview,c);c.preview();a.equal(forSelect.value,'TARGET');
const savePair=source.match(/     const pair=editingOriginal[\s\S]*?;(?=\n     const draft=)/);
a.ok(savePair,'actual save handler must expose its pairing decision');
a.match(source,/rule:report\(rows\[Number\(select.value\)\]\),\.\.\.pair,note:/,'saved draft must use the pairing decision');
Object.assign(c,{empId:'WORKER',selectedCategory:category,editingOriginal:false});
const result=vm.runInContext(savePair[0]+'\npair',c);a.equal(result.forEmpId,'TARGET',category+' must retain locked leave target after preview');
// Existing reports must also retain their target when a non-cover category is edited.
c.editingOriginal=true;c.prefill.leaveHandoffId='';
const edited=vm.runInContext('(()=>{'+savePair[0]+';return pair;})()',c);
a.equal(edited.forEmpId,'TARGET',category+' original report pairing must survive edits');
}
new vm.Script(source);console.log('PASS actual form preview and save pairing retain linked leave target across all categories');
