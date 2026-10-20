(function(g){
'use strict';
let pending=false,timer=null;
function editing(){
 return ['editRecordModal','addRecordModal'].some(id=>{
  const modal=g.document.getElementById(id);
  return modal&&!modal.classList.contains('hidden');
 });
}
function flush(){
 timer=null;
 if(!pending)return;
 if(editing()){timer=g.setTimeout(flush,200);return;}
 pending=false;
 // One refresh of the currently visible view replaces all deferred redraws.
 if(typeof g.p79RenderOnlyVisibleAttendanceView==='function')g.p79RenderOnlyVisibleAttendanceView();
}
g.p79DeferAttendanceTableRender=function(){
 if(!editing())return false;
 pending=true;
 if(timer===null)timer=g.setTimeout(flush,200);
 return true;
};
})(window);
