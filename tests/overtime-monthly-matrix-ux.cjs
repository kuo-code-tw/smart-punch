const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const matrix=fs.readFileSync('assets/port79-overtime-monthly-matrix.js','utf8');
const work=fs.readFileSync('work-hours/index.html','utf8');
new vm.Script(matrix);
assert(work.includes('../assets/port79-overtime-monthly-matrix.js?v=20261025-monthly-ux-v1'),'production URL must load refreshed UI instead of cached file');
const markers=[
 'p79MonthlyMatrixUx','mm-filter-card','mm-form-grid','mm-advanced','mm-advanced-content',
 'mm-job-options','mm-company-settings','mm-feedback','mmFeedbackTitle','mmProgress',
 'mmResetFilters','mm-empty','mmLoadButton','mmJobDropdown','mmCompanyDropdown',
 'mmStatusElement.replaceWith(mmFeedback)',"q('#mmPrint').onclick","q('#mmExcel').onclick",
 "q('#mmLoad').onclick=async()=>","q('#mmLoad').onclick();"
];
for(const marker of markers)assert(matrix.includes(marker),'missing user-facing monthly matrix feature: '+marker);
assert(matrix.includes("const snapshot=await context.snapshot(month)"),'monthly report must still read official cloud snapshot');
assert(matrix.includes("loaded=build(snapshot,context.employees()"),'must preserve existing calculation source');
assert(matrix.includes("excel(loaded,q('#mmHide').checked"),'must retain original Excel export');
assert(matrix.includes("html(loaded,q('#mmHide').checked"),'must retain print output');
assert(matrix.includes("document.body.style.overflow=previousOverflow;dialog.remove()"),'closing modal must unlock page scroll');
assert(matrix.includes("if(!context.canExport())throw Error("),'permissions must still gate cloud report');
assert(matrix.includes("q('#mmLoad').click()"),'clear filters must regenerate report');
assert(matrix.includes("mmAdvanced.open=false"),'clear filters should reset advanced display');
assert(matrix.includes("'正在整理 '+monthLabel"),'loading card should say what month it is loading');
assert(matrix.includes("feedback('success'"),'completed report should announce success');
assert(matrix.includes("feedback('warning'"),'verification issues must stay visible');
assert(matrix.includes("feedback('error'"),'cloud failure must show actionable error state');
assert(matrix.includes("feedback('empty'"),'zero matches must show empty state');
assert(matrix.includes("kind!=='loading'"),'progress must not falsely display after completion');
console.log('PASS monthly report full-width filter card, collapsed advanced settings, accurate progress status, errors, permissions, print/export, cache-busted production wiring');
