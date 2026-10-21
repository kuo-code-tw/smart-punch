const fs=require('fs'),vm=require('vm'),a=require('assert/strict'),source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const pair=source.slice(source.indexOf(' function reportPair('),source.indexOf(' function advanceLeaveHandoff('));
const preview=source.slice(source.indexOf('   function preview(){'),source.indexOf('   const refreshTypes='));
for(const category of ['休','國','例','延','代']){
const forSelect={value:'TARGET'},empSelect={value:'WORKER'},el={querySelector:key=>key==='#p79OtForWrap'?{style:{}}:{setAttribute(){},textContent:''}},prefill={leaveHandoffId:'LEAVE',forEmpId:'TARGET',empId:'WORKER'},people=[{empId:'TARGET',name:'測試請假者'},{empId:'WORKER',name:'測試代班者'}],rows=[[category,'CODE',8,12,'','','08','16']],c={forSelect,empSelect,el,prefill,people,rows,kind:{value:'TYPE',setAttribute(){}},select:{selectedIndex:0,value:'0',setAttribute(){}},refreshPairPeople(){},matches:()=>true};vm.createContext(c);vm.runInContext(pair+preview,c);c.preview();a.equal(forSelect.value,'TARGET');
const expression=source.match(/\.\.\.reportPair\(([^\n]+?)\),note:/)[1];c.empId='WORKER';const result=vm.runInContext('reportPair('+expression+')',c);a.equal(result.forEmpId,'TARGET',category+' must retain locked leave target after preview');
}
new vm.Script(source);console.log('PASS actual form preview and save pairing retain linked leave target across all categories');
