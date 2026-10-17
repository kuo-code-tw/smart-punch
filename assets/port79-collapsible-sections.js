/* Native disclosure panels; no application data is stored or re-rendered. */
(function(){
'use strict';
const prefix='port79_efficiency_collapse_v1:';
const panels=[...document.querySelectorAll('details[data-collapse-key]')];
for(const panel of panels){
  try{const state=localStorage.getItem(prefix+panel.dataset.collapseKey);if(state==='closed')panel.open=false;else if(state==='open')panel.open=true;}catch(_){}
  panel.addEventListener('toggle',()=>{try{localStorage.setItem(prefix+panel.dataset.collapseKey,panel.open?'open':'closed');}catch(_){}});
}
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-collapse-action][data-collapse-view]');if(!button)return;
  const view=document.getElementById(button.dataset.collapseView);if(!view||view.id==='view-dashboard')return;
  const open=button.dataset.collapseAction==='open';
  view.querySelectorAll('details[data-collapse-key]').forEach(panel=>{panel.open=open;});
});
})();
