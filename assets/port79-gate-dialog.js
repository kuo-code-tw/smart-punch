/* The Gate iframe reports progress into a modal owned by the vessel page. */
(function(g){
 'use strict';
 var d=g.document,dialog=d.getElementById('p79GateImportDialog');
 if(!dialog)return;
 function allowed(source){return source===d.getElementById('p79GateImportFrame')?.contentWindow;}
 g.P79GateDialog={
  open:function(source,fileName){
   if(!allowed(source))return;
   d.getElementById('p79GateImportDialogFile').textContent=String(fileName||'');
   this.update(source,'已收到檔案，正在讀取與核對…','info');
   if(!dialog.open)dialog.showModal();
  },
  close:function(source){if(allowed(source))dialog.close();},
  update:function(source,message,kind){
   if(!allowed(source))return;
   var status=d.getElementById('p79GateImportDialogStatus');
   status.textContent=String(message||'');status.dataset.kind=kind||'info';dialog.dataset.kind=kind||'info';
  }
 };
 d.getElementById('p79GateImportDialogClose').addEventListener('click',function(){dialog.close();});
})(window);
