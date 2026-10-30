/* Keep attendance/workhours navigation on one compatible review build. */
(function(g){
 'use strict';
 const build='20261030-v5';
 function upgrade(event){
  const anchor=event.target?.closest?.('a[href]');if(!anchor)return;
  let url;try{url=new URL(anchor.getAttribute('href'),g.location.href);}catch(_){return;}
  if(url.origin!==g.location.origin||!/\/(?:attendance|work-hours)\/(?:index\.html)?$/.test(url.pathname))return;
  url.searchParams.set('reviewBuild',build);
  anchor.setAttribute('href',url.toString());
 }
 g.document.documentElement.dataset.p79ReviewBuild=build;
 g.document.addEventListener('click',upgrade,true);
 g.document.addEventListener('auxclick',upgrade,true);
})(window);
