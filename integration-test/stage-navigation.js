(function () {
  'use strict';
  const systems = new Set(['hr', 'attendance', 'leave', 'schedule', 'work-hours', 'aqc-efficiency', 'history-data']);
  function keepIsolated(event) {
    const link = event.target?.closest?.('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    const match = url.pathname.match(/^\/smart-punch\/([^/]+)\/(?:index\.html)?$/);
    if (!match || !systems.has(match[1])) return;
    url.pathname = '/smart-punch/integration-test/' + match[1] + '/';
    link.href = url.href;
  }
  document.addEventListener('click', keepIsolated, true);
  document.addEventListener('auxclick', keepIsolated, true);
})();
