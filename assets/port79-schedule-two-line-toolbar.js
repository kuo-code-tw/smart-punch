/* PORT79 schedule presentation-only. Re-parent the ORIGINAL status, role
 * selectors and cloud-source nodes into one compact row, without cloning or
 * replacing listeners, IDs, form values, edit locks or schedule data.
 */
(function(){
 'use strict';
 function mount(){
   const shell=document.getElementById('schedule-control-shell');
   const quick=document.getElementById('p79ScheduleQuickBar');
   const roles=document.getElementById('main-role-tabs-container');
   const legend=document.getElementById('schedule-legend-row');
   const editor=document.getElementById('p79ReferenceEditorHost');
   const source=document.getElementById('p79ScheduleDataSource');
   if(!shell||!quick||!roles||!legend||!editor||!source||
      document.getElementById('p79ScheduleCompactSecondRow'))return;
   const row=document.createElement('div');
   row.id='p79ScheduleCompactSecondRow';
   row.setAttribute('aria-label','人員職稱分類與排班狀態');
   const filter=document.createElement('div');
   filter.id='p79ScheduleCompactFilter';
   const status=document.createElement('div');
   status.id='p79ScheduleCompactStatus';
   const previousParents=[roles.closest('#schedule-control-shell > div'),
     legend.closest('#schedule-control-shell > div')];
   // Keep the actual More/Legend dropdowns OUTSIDE the horizontally
   // scrollable action strip, so their popups are never clipped.
   const popups=document.createElement('div');
   popups.id='p79ScheduleCompactDropdowns';
   const actions=quick.querySelector('.p79-quick-actions');
   if(actions){
     for(const details of [...actions.querySelectorAll(':scope > details')])
       popups.appendChild(details);
     if(popups.children.length)quick.appendChild(popups);
   }
   // Append moves existing live DOM nodes. Their event handlers and closures,
   // including save/refresh, edit-lock and status observers are preserved.
   filter.appendChild(roles);
   status.appendChild(editor);
   status.appendChild(legend);
   status.appendChild(source);
   row.append(filter,status);
   quick.insertAdjacentElement('afterend',row);
   for(const parent of previousParents){
     if(parent&&parent!==row&&parent.parentElement===shell)
       parent.setAttribute('data-p79-compact-vacated','true');
   }
   shell.classList.add('p79-two-line-toolbar');
 }
 if(document.readyState==='loading')
   document.addEventListener('DOMContentLoaded',mount,{once:true});
 else mount();
})();
