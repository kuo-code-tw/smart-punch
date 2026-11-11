/* PORT79 Driver Workstation | presentation-only, backed by canonical WORKING REPORT rows. */
(function (root) {
  'use strict';
  var nf = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });
  function fmt(v) { return v === null || v === undefined || !Number.isFinite(+v) ? '—' : nf.format(+v); }
  function html(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function fixed(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
  function aqcName(row) { return typeof normalizeAqcNo === 'function' ? (normalizeAqcNo(row.number || row.gcNo) || '未填') : String(row.number || row.gcNo || '未填'); }
  function metric(row) {
    if (typeof workloadRecordMetrics !== 'function') return { disc: 0, load: 0, hc: 0, hours: 0 };
    var m = workloadRecordMetrics(row);
    return { disc: +m.disc || 0, load: +m.load || 0, hc: +m.hc || 0, hours: +m.hours || 0 };
  }
  function bundle(row) {
    if (typeof effectiveBundleRecord !== 'function') return 0;
    return +effectiveBundleRecord(row).bundleDeduct || 0;
  }
  function sum(rows) {
    var x = { count: 0, people: 0, disc: 0, load: 0, hc: 0, hours: 0, bundle: 0, containers: 0, gph: null };
    var names = new Set();
    (rows || []).forEach(function (r) {
      var m = metric(r), person = String(r.empId || '').trim() || String(r.name || '').trim();
      if (person) names.add(person);
      x.count++;
      x.disc += m.disc; x.load += m.load; x.hc += m.hc; x.hours += m.hours; x.bundle += bundle(r);
    });
    x.people = names.size;
    ['disc', 'load', 'hc', 'hours', 'bundle'].forEach(function (k) { x[k] = fixed(x[k]); });
    x.containers = fixed(x.disc + x.load);
    x.gph = x.hours > 0 ? fixed((x.containers + x.hc) / x.hours) : null;
    return x;
  }
  function dayRows(rows) {
    var map = new Map();
    (rows || []).forEach(function (r) {
      var date = String(r.workDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(r);
    });
    return Array.from(map, function (entry) { return { date: entry[0], totals: sum(entry[1]) }; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
  }
  function byAqc(rows) {
    var map = new Map();
    (rows || []).forEach(function (r) {
      var key = aqcName(r);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return Array.from(map, function (entry) { return { aqc: entry[0], totals: sum(entry[1]) }; })
      .sort(function (a, b) { return a.aqc.localeCompare(b.aqc, undefined, { numeric: true }); });
  }
  function auditStatus(input) {
    var status = input.audit && input.audit.status || 'pending';
    var read = input.readStatus || '';
    if (input.ambiguous || read !== 'ready') return 'pending';
    return status === 'match' ? 'match' : status === 'mismatch' ? 'mismatch' : 'pending';
  }
  function build(input) {
    var all = input.allRows || [], shown = input.visibleRows || [];
    var full = sum(all), visible = sum(shown), days = dayRows(shown), cranes = byAqc(all);
    var cranesTotal = fixed(cranes.reduce(function (s, a) { return s + a.totals.containers; }, 0));
    var daysTotal = fixed(days.reduce(function (s, a) { return s + a.totals.containers; }, 0));
    var integrity = Math.abs(cranesTotal - full.containers) < .01 && Math.abs(daysTotal - visible.containers) < .01;
    return { full: full, visible: visible, days: days, cranes: cranes, integrity: integrity, status: integrity ? auditStatus(input) : 'mismatch' };
  }
  function ensure() {
    var view = document.getElementById('view-personstats');
    if (!view || view.querySelector('[data-p79driver-head]')) return !!view;
    var section = view.querySelector('[data-section-key="view-records-1"]');
    var card = section && section.querySelector('.card');
    var tableCard = view.querySelector('.vessel-operations-card');
    if (!section || !card || !tableCard) return false;
    section.classList.add('p79driver-section');
    card.classList.add('p79driver-controls');
    if (section.firstElementChild) section.firstElementChild.classList.add('p79driver-old-heading');
    var head = document.createElement('header');
    head.className = 'p79driver-header'; head.setAttribute('data-p79driver-head', '');
    head.innerHTML = '<div class="p79driver-title"><span class="p79driver-ship" aria-hidden="true">⚓</span><div><h2>司機作業統計</h2><p>船舶作業工作台 <b>｜</b> WORKING REPORT <b>｜</b> AQC 作業明細</p></div></div>' +
      '<div class="p79driver-head-status" id="p79driverHeadStatus" role="status">資料核對中</div>';
    section.insertBefore(head, card);
    var toolbar = card.firstElementChild;
    if (toolbar) toolbar.classList.add('p79driver-primary-toolbar');
    var filters = document.getElementById('recordGroupFilter');
    var filterBox = filters && filters.closest('.border-t');
    var oldKpis = document.getElementById('recordStatCount');
    oldKpis = oldKpis && oldKpis.parentElement && oldKpis.parentElement.parentElement;
    if (filterBox) { filterBox.classList.add('p79driver-filter-toolbar'); if (oldKpis) card.insertBefore(filterBox, oldKpis); }
    if (oldKpis) oldKpis.id = 'p79driverLegacyKpis';
    var kpis = document.createElement('div'); kpis.id = 'p79driverKpis'; kpis.className = 'p79driver-kpis';
    if (oldKpis) card.insertBefore(kpis, oldKpis); else card.appendChild(kpis);
    var audit = document.createElement('div'); audit.id = 'p79driverAudit'; audit.className = 'p79driver-audit';
    if (oldKpis) card.insertBefore(audit, oldKpis); else card.appendChild(audit);
    var bottom = document.createElement('div'); bottom.className = 'p79driver-bottom'; bottom.id = 'p79driverBottom';
    bottom.innerHTML = '<section class="p79driver-panel"><h3>▦ 每日司機作業量</h3><div class="p79driver-table-scroll"><table class="p79driver-day-table"><thead><tr><th>日期</th><th>作業筆數</th><th>司機人數</th><th>DISC</th><th>LOAD</th><th>H/C</th><th>總櫃數</th><th>Time</th></tr></thead><tbody id="p79driverDayBody"></tbody></table></div></section>' +
      '<section class="p79driver-panel"><h3>▥ 作業量趨勢與結構</h3><div class="p79driver-charts"><div id="p79driverTrend" class="p79driver-trend"></div><div id="p79driverComposition" class="p79driver-composition"></div></div></section>';
    tableCard.insertAdjacentElement('afterend', bottom);
    var h = tableCard.querySelector('h2'); if (h) h.textContent = '全船司機作業明細（AQC 分組）';
    var foot = document.createElement('div'); foot.className = 'p79driver-source-foot';
    foot.textContent = '資料來源：WORKING REPORT ｜ 船舶核對：WORKING SHEET ｜ 總櫃數 = DISC + LOAD ｜ GPH =（總櫃數 + H/C）÷ 時數。';
    bottom.insertAdjacentElement('afterend', foot);
    return true;
  }
  function trendMarkup(days) {
    var data = days.slice(0, 7).reverse(), width = 570, base = 202, top = 30, left = 50, chartWidth = 480;
    if (!data.length) return '<p class="p79driver-empty">目前沒有作業日期，無法繪製趨勢。</p>';
    var peak = Math.max(1, ...data.map(function (x) { return x.totals.containers; }));
    var maxGph = Math.max(1, ...data.map(function (x) { return x.totals.gph || 0; }));
    var span = chartWidth / data.length;
    var bars = data.map(function (d, i) {
      var bh = (d.totals.containers / peak) * (base - top), x = left + i * span + span * .22;
      return '<rect x="' + x.toFixed(1) + '" y="' + (base - bh).toFixed(1) + '" width="' + (span * .52).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="#3d9fea" opacity=".7"><title>' + html(d.date) + '：' + fmt(d.totals.containers) + ' 櫃</title></rect>' +
        '<text x="' + (left + (i + .5) * span).toFixed(1) + '" y="224" font-size="13" text-anchor="middle" fill="#334155">' + html(d.date.slice(5)) + '</text>';
    }).join('');
    var pts = data.filter(function (d) { return d.totals.gph !== null; }).map(function (d) {
      var i = data.indexOf(d);
      return { x: left + (i + .5) * span, y: base - d.totals.gph / maxGph * (base - top) };
    });
    var line = pts.length > 1 ? '<polyline points="' + pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ') + '" fill="none" stroke="#128642" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' : '';
    var dots = pts.map(function (p) { return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="5" fill="#fff" stroke="#128642" stroke-width="3"/>'; }).join('');
    var grid = [0, .25, .5, .75, 1].map(function (v) { var y = base - v * (base - top); return '<line x1="50" y1="' + y + '" x2="540" y2="' + y + '" stroke="#e4ebf4"/><text x="42" y="' + (y + 4) + '" text-anchor="end" font-size="12" fill="#64748b">' + fmt(fixed(peak * v)) + '</text>'; }).join('');
    return '<div class="p79driver-chart-legend"><span><i class="p79driver-legend-bar"></i>總櫃數</span><span><i class="p79driver-legend-line"></i>效率 GPH</span></div>' +
      '<svg viewBox="0 0 ' + width + ' 235" role="img" aria-label="' + html('近 ' + data.length + ' 個有作業日期的櫃數與效率趨勢') + '">' + grid + bars + line + dots + '</svg>';
  }
  function compositionMarkup(totals) {
    if (totals.containers <= 0) return '<p class="p79driver-empty">目前沒有卸櫃或裝櫃資料。</p>';
    var pct = fixed(100 * totals.disc / totals.containers);
    return '<div class="p79driver-donut" style="background:conic-gradient(#2386e3 0 ' + pct + '%,#45d76a ' + pct + '% 100%)"><div><small>總櫃數</small><strong>' + fmt(totals.containers) + '</strong></div></div>' +
      '<div class="p79driver-donut-labels"><p><i class="p79driver-dot blue"></i>卸櫃 DISC <b>' + fmt(totals.disc) + '</b><small>' + pct + '%</small></p><p><i class="p79driver-dot green"></i>裝櫃 LOAD <b>' + fmt(totals.load) + '</b><small>' + fixed(100 - pct) + '%</small></p></div>';
  }
  function render(input) {
    if (!ensure()) return;
    var model = build(input), d = model.visible, master = input.master || {}, audit = input.audit || {};
    var shipLabel = [master.workingNo, master.vessel || master.shipName, master.voyageE || master.voyageI].filter(Boolean).join(' ｜ ');
    var info = document.getElementById('p79driverHeadStatus');
    var names = { match: '✓ WORKING SHEET 核對一致', mismatch: '⚠ 櫃數或來源明細不一致', pending: '◷ 來源資料待核對' };
    if (info) { info.textContent = (shipLabel ? shipLabel + ' ｜ ' : '') + names[model.status]; info.dataset.status = model.status; }
    var tiles = [
      ['作業筆數', d.count, '▤', 'blue'], ['作業人數', d.people, '♙', 'sky'],
      ['卸櫃 DISC', d.disc, '▥', 'cyan'], ['裝櫃 LOAD', d.load, '▥', 'indigo'],
      ['Bundle 扣除', d.bundle, '◫', 'purple'], ['總櫃數', d.containers, '▤', 'green'],
      ['H/C', d.hc, '▥', 'sky'], ['作業時數 Time', fixed(d.hours), '◷', 'blue'],
      ['平均效率 GPH', d.gph, '▥', 'indigo']
    ];
    document.getElementById('p79driverKpis').innerHTML = tiles.map(function (x) {
      return '<div class="p79driver-kpi tone-' + x[3] + '"><span class="p79driver-kpi-icon" aria-hidden="true">' + x[2] + '</span><div><span class="p79driver-kpi-label">' + x[0] + '</span><strong>' + fmt(x[1]) + '</strong><small>目前篩選｜WORKING REPORT</small></div></div>';
    }).join('');
    var readIncomplete = input.readStatus !== 'ready';
    var reason = [].concat(audit.reasons || []);
    if (readIncomplete) reason.push(input.readStatus === 'error' ? '雲端資料讀取失敗，不能標示為核對通過' : input.readStatus === 'partial' ? '雲端或歷史明細只讀到部分資料' : '尚未完成雲端與歷史資料讀取');
    if (input.ambiguous) reason.push('同編號船舶的碼頭不明，不能安全合併');
    if (!model.integrity) reason.push('目前明細的 AQC 或每日小計加總不一致');
    var auditTitle = model.status === 'match' ? '櫃數核對一致' : model.status === 'mismatch' ? '資料差異，請先處理' : '核對尚未完成';
    document.getElementById('p79driverAudit').dataset.status = model.status;
    document.getElementById('p79driverAudit').innerHTML = '<div><strong>' + auditTitle + '</strong><span>WORKING REPORT 全船 ' + fmt(model.full.containers) + ' 櫃 ｜ WORKING SHEET 總 Moves ' + fmt(audit.moves) + ' ｜ 差額 ' + fmt(audit.diff) + ' ｜ Bundle ' + fmt(audit.bundle) + '／' + fmt(master.workingSheetSource && master.workingSheetSource.bundleDeduct) + ' ｜ H/C ' + fmt(audit.hc) + '／' + fmt(audit.sheetHc) + '</span></div>' +
      (reason.length ? '<div class="p79driver-audit-reasons">' + html(reason.join('；')) + '</div>' : '<div class="p79driver-audit-reasons">全船核對不受組別、姓名、AQC 與日期篩選影響。</div>');
    var host = document.getElementById('driverVesselAqcSummary');
    if (host) {
      host.innerHTML = model.cranes.map(function (c) {
        var a = c.totals;
        return '<div class="p79driver-aqc-card"><header>⚓ AQC' + html(c.aqc) + '</header><div class="p79driver-aqc-metrics"><span>作業筆數<b>' + fmt(a.count) + '</b></span><span>卸櫃<b>' + fmt(a.disc) + '</b></span><span>裝櫃<b>' + fmt(a.load) + '</b></span><span>總櫃數<b>' + fmt(a.containers) + '</b></span><span>作業時數<b>' + fmt(a.hours) + '</b></span><span>GPH<b>' + fmt(a.gph) + '</b></span></div><small>全船 WORKING REPORT｜H/C ' + fmt(a.hc) + '</small></div>';
      }).join('') || '<div class="p79driver-empty">目前船舶沒有可顯示的 AQC 作業明細。</div>';
    }
    document.getElementById('p79driverDayBody').innerHTML = model.days.map(function (entry) {
      var x = entry.totals;
      return '<tr><td>' + html(entry.date) + '</td><td>' + fmt(x.count) + '</td><td>' + fmt(x.people) + '</td><td>' + fmt(x.disc) + '</td><td>' + fmt(x.load) + '</td><td>' + fmt(x.hc) + '</td><td class="em">' + fmt(x.containers) + '</td><td>' + fmt(x.hours) + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="p79driver-empty">篩選範圍沒有作業資料。</td></tr>';
    document.getElementById('p79driverTrend').innerHTML = trendMarkup(model.days);
    document.getElementById('p79driverComposition').innerHTML = compositionMarkup(d);
  }
  root.P79DriverDashboard = { render: render, build: build, sum: sum, dayRows: dayRows, byAqc: byAqc };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure);
  else ensure();
})(window);
