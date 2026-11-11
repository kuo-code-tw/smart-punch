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
  function driverName(r) {
    if (typeof displayPersonName === 'function') return String(displayPersonName(r.name) || '未填');
    return String(r.name || '未填');
  }
  function dayRows(rows) {
    var map = new Map();
    (rows || []).forEach(function (r) {
      var date = String(r.workDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(r);
    });
    return Array.from(map, function (entry) {
      var rs = entry[1];
      return { date:entry[0], totals:sum(rs),
        aqcs:Array.from(new Set(rs.map(aqcName))).sort(function (a,b) {return a.localeCompare(b,undefined,{numeric:true});}),
        drivers:Array.from(new Set(rs.map(driverName))).sort(function (a,b) {return a.localeCompare(b,'zh-Hant');}) };
    }).sort(function (a,b) {return b.date.localeCompare(a.date);});
  }
  function detailRows(rows) {
    return (rows || []).map(function (r) {
      var m = metric(r);
      return {
        date: String(r.workDate || '').slice(0,10),
        workingNo: String(r.workingNo || ''),
        vessel: String(r.shipName || r.vessel || ''),
        voyage: String(r.voyageE || r.voyageI || r.voyage || ''),
        aqc:aqcName(r),
        group:typeof operationGroupForRecord === 'function' ? String(operationGroupForRecord(r) || '') : String(r.group || ''),
        driver:driverName(r),
        period:String(r.startTime || '未填') + ' ～ ' + String(r.endTime || '未填'),
        disc:m.disc,load:m.load,bundle:bundle(r),hc:m.hc,
        containers:fixed(m.disc+m.load),hours:m.hours,
        gph:m.hours>0?fixed((m.disc+m.load+m.hc)/m.hours):null
      };
    }).sort(function (a,b) {return b.date.localeCompare(a.date) || a.aqc.localeCompare(b.aqc,undefined,{numeric:true}) || a.driver.localeCompare(b.driver,'zh-Hant');});
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
    var full = sum(all), visible = sum(shown), days = dayRows(shown), cranes = byAqc(all), visibleCranes = byAqc(shown), details = detailRows(shown);
    var cranesTotal = fixed(cranes.reduce(function (s, a) { return s + a.totals.containers; }, 0));
    var daysTotal = fixed(days.reduce(function (s, a) { return s + a.totals.containers; }, 0));
    var integrity = Math.abs(cranesTotal - full.containers) < .01 && Math.abs(daysTotal - visible.containers) < .01;
    return { full: full, visible: visible, days: days, cranes: cranes, visibleCranes: visibleCranes, details: details, integrity: integrity, status: integrity ? auditStatus(input) : 'mismatch' };
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
    bottom.innerHTML =
      '<section class="p79driver-panel"><div class="p79driver-panel-heading"><h3>▦ 每日司機作業量｜日期合計</h3><span id="p79driverScopeLabel"></span></div>' +
      '<p class="p79driver-explain">依目前選取的船舶、組別、姓名、AQC、日期統計；每列是一個<strong>有作業紀錄的日期</strong>，不是整個碼頭當日總量。總櫃數＝卸櫃＋裝櫃，不含 H/C。</p>' +
      '<div class="p79driver-table-scroll"><table class="p79driver-day-table"><thead><tr><th>作業日期</th><th>作業 AQC</th><th>司機姓名</th><th>作業筆數</th><th>卸櫃 DISC</th><th>裝櫃 LOAD</th><th>Bundle 扣除</th><th>H/C</th><th>總櫃數</th><th>作業時數</th><th>平均 GPH</th></tr></thead><tbody id="p79driverDayBody"></tbody><tfoot id="p79driverDayFoot"></tfoot></table></div></section>' +
      '<section class="p79driver-panel"><div class="p79driver-panel-heading"><h3>▤ WORKING REPORT｜逐筆來源明細</h3><span id="p79driverDetailCount"></span></div>' +
      '<p class="p79driver-explain">每一列都是原始司機作業紀錄。可核對 WORKING NO.、船名／航次、AQC、司機、起迄時段及櫃數；上方「全船司機作業明細」可直接編輯。此表<strong>不會新增或修改原始資料</strong>。</p>' +
      '<div class="p79driver-table-scroll p79driver-detail-scroll"><table class="p79driver-day-table p79driver-detail-table"><thead><tr><th>日期</th><th>WORKING NO.</th><th>船名／航次</th><th>AQC</th><th>組別</th><th>司機姓名</th><th>作業起迄</th><th>卸櫃</th><th>裝櫃</th><th>Bundle</th><th>H/C</th><th>總櫃數</th><th>Time</th><th>GPH</th></tr></thead><tbody id="p79driverDetailBody"></tbody></table></div></section>' +
      '<section class="p79driver-panel"><h3>▥ 作業量分析與計算說明</h3><div class="p79driver-analysis-grid">' +
      '<div class="p79driver-analysis-card"><h4 id="p79driverTrendTitle">每日櫃數與效率</h4><div id="p79driverTrend" class="p79driver-trend"></div><p id="p79driverTrendHelp" class="p79driver-analysis-help"></p></div>' +
      '<div class="p79driver-analysis-card"><h4>依 AQC 吊桿統計</h4><div id="p79driverCraneBars"></div></div>' +
      '<div class="p79driver-analysis-card"><h4>卸／裝櫃結構與效率</h4><div id="p79driverComposition" class="p79driver-composition"></div><div id="p79driverCalculation"></div></div>' +
      '</div></section>';
    tableCard.insertAdjacentElement('afterend', bottom);
    var h = tableCard.querySelector('h2'); if (h) h.textContent = '全船司機作業明細（AQC 分組）';
    var foot = document.createElement('div'); foot.className = 'p79driver-source-foot';
    foot.textContent = '資料來源：WORKING REPORT ｜ 船舶核對：WORKING SHEET ｜ 總櫃數 = DISC + LOAD ｜ GPH =（總櫃數 + H/C）÷ 時數。';
    bottom.insertAdjacentElement('afterend', foot);
    return true;
  }
  function trendMarkup(days) {
    var data = days.slice(0, 7).reverse(), width = 570, base = 202, top = 30, left = 50, chartWidth = 480;
    if (!data.length) return '<p class="p79driver-empty">此篩選範圍沒有作業日期，沒有可分析的資料。</p>';
    if (data.length === 1) {
      var one = data[0], v = one.totals;
      return '<div class="p79driver-one-day"><div class="p79driver-one-day-date">' + html(one.date) + '（唯一作業日）</div>' +
        '<strong>' + fmt(v.containers) + ' <small>櫃</small></strong><div>卸櫃 ' + fmt(v.disc) + ' ｜ 裝櫃 ' + fmt(v.load) + ' ｜ H/C ' + fmt(v.hc) + '</div>' +
        '<div>作業 ' + fmt(v.hours) + ' 小時 ｜ 平均效率 ' + fmt(v.gph) + ' GPH</div></div>';
    }
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
  function craneBarsMarkup(cranes) {
    if (!cranes.length) return '<p class="p79driver-empty">沒有 AQC 明細。</p>';
    var max = Math.max(1, ...cranes.map(function (c) {return c.totals.containers;}));
    return '<div class="p79driver-crane-list">' + cranes.map(function (c) {
      var x = c.totals, pct = fixed(x.containers/max*100);
      return '<div class="p79driver-crane-row"><div class="p79driver-crane-label"><b>AQC ' + html(c.aqc) + '</b><strong>' + fmt(x.containers) + ' 櫃</strong></div>' +
        '<div class="p79driver-crane-track"><div style="width:' + pct + '%"></div></div>' +
        '<small>卸 ' + fmt(x.disc) + '／裝 ' + fmt(x.load) + ' ｜ H/C ' + fmt(x.hc) + ' ｜ ' + fmt(x.hours) + ' 小時 ｜ GPH ' + fmt(x.gph) + '</small></div>';
    }).join('') + '</div>' + (cranes.length===1?'<p class="p79driver-analysis-help">目前只有 1 台 AQC 有紀錄，無法進行吊桿間比較。</p>':'');
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
    document.getElementById('p79driverAudit').innerHTML = '<div><strong>' + auditTitle + '</strong><span>WORKING REPORT 全船 ' + fmt(model.full.containers) + ' 櫃 ｜ WORKING SHEET 請款 ' + fmt(audit.bill) + ' ＋ SHIFT ' + fmt(audit.shift) + ' ＝ 總 Moves ' + fmt(audit.moves) + ' ｜ 差額 ' + fmt(audit.diff) + ' ｜ Bundle ' + fmt(audit.bundle) + '／' + fmt(master.workingSheetSource && master.workingSheetSource.bundleDeduct) + ' ｜ H/C ' + fmt(audit.hc) + '／' + fmt(audit.sheetHc) + '</span></div>' +
      (reason.length ? '<div class="p79driver-audit-reasons">' + html(reason.join('；')) + '</div>' : '<div class="p79driver-audit-reasons">全船核對不受組別、姓名、AQC 與日期篩選影響。</div>');
    var host = document.getElementById('driverVesselAqcSummary');
    if (host) {
      host.innerHTML = model.cranes.map(function (c) {
        var a = c.totals;
        return '<div class="p79driver-aqc-card"><header>⚓ AQC' + html(c.aqc) + '</header><div class="p79driver-aqc-metrics"><span>作業筆數<b>' + fmt(a.count) + '</b></span><span>卸櫃<b>' + fmt(a.disc) + '</b></span><span>裝櫃<b>' + fmt(a.load) + '</b></span><span>總櫃數<b>' + fmt(a.containers) + '</b></span><span>作業時數<b>' + fmt(a.hours) + '</b></span><span>GPH<b>' + fmt(a.gph) + '</b></span></div><small>全船 WORKING REPORT｜H/C ' + fmt(a.hc) + '</small></div>';
      }).join('') || '<div class="p79driver-empty">目前船舶沒有可顯示的 AQC 作業明細。</div>';
    }
    document.getElementById('p79driverScopeLabel').textContent = '目前篩選：' + fmt(d.count) + ' 筆、' + fmt(model.days.length) + ' 個作業日、' + fmt(d.people) + ' 位司機';
    document.getElementById('p79driverDayBody').innerHTML = model.days.map(function (entry) {
      var x = entry.totals;
      var aqcs = entry.aqcs.map(function (a) {return 'AQC '+html(a);}).join('、');
      var drivers = entry.drivers.map(html).join('、');
      return '<tr><td class="p79driver-cell-strong">' + html(entry.date) + '</td><td>' + aqcs + '</td><td>' + drivers + '</td><td>' + fmt(x.count) + '</td><td>' + fmt(x.disc) + '</td><td>' + fmt(x.load) + '</td><td>' + fmt(x.bundle) + '</td><td>' + fmt(x.hc) + '</td><td class="em">' + fmt(x.containers) + '</td><td>' + fmt(x.hours) + '</td><td>' + fmt(x.gph) + '</td></tr>';
    }).join('') || '<tr><td colspan="11" class="p79driver-empty">目前條件下沒有任何作業紀錄。請檢查船舶、AQC、姓名或日期範圍。</td></tr>';
    document.getElementById('p79driverDayFoot').innerHTML = model.days.length ? '<tr><td>篩選合計</td><td>' + fmt(model.visibleCranes.length) + ' 台 AQC</td><td>' + fmt(d.people) + ' 人</td><td>' + fmt(d.count) + '</td><td>' + fmt(d.disc) + '</td><td>' + fmt(d.load) + '</td><td>' + fmt(d.bundle) + '</td><td>' + fmt(d.hc) + '</td><td class="em">' + fmt(d.containers) + '</td><td>' + fmt(d.hours) + '</td><td>' + fmt(d.gph) + '</td></tr>' : '';
    var limited = model.details.slice(0, 200);
    document.getElementById('p79driverDetailCount').textContent = '目前篩選：' + fmt(model.details.length) + ' 筆' + (model.details.length>200?'（列出最近 200 筆；上方可查完整明細）':'');
    document.getElementById('p79driverDetailBody').innerHTML = limited.map(function (r) {
      var vessel = [r.vessel, r.voyage].filter(Boolean).join('／');
      return '<tr><td>' + html(r.date || '未填') + '</td><td class="p79driver-cell-strong">' + html(r.workingNo || '—') + '</td><td>' + html(vessel || '—') + '</td><td>AQC ' + html(r.aqc) + '</td><td>' + html(r.group || '—') + '</td><td class="p79driver-cell-strong">' + html(r.driver) + '</td><td>' + html(r.period) + '</td><td>' + fmt(r.disc) + '</td><td>' + fmt(r.load) + '</td><td>' + fmt(r.bundle) + '</td><td>' + fmt(r.hc) + '</td><td class="em">' + fmt(r.containers) + '</td><td>' + fmt(r.hours) + '</td><td>' + fmt(r.gph) + '</td></tr>';
    }).join('') || '<tr><td colspan="14" class="p79driver-empty">本範圍沒有 WORKING REPORT 司機作業資料。</td></tr>';
    var single = model.days.length === 1;
    document.getElementById('p79driverTrendTitle').textContent = single ? '單日作業摘要（不是趨勢）' : '每日櫃數與 GPH 趨勢';
    document.getElementById('p79driverTrend').innerHTML = trendMarkup(model.days);
    document.getElementById('p79driverTrendHelp').textContent = !model.days.length ? '未取得日期資料。' : single ? '只有 1 個有作業紀錄的日期，不能畫成多日趨勢；上方已列出這一天的原始司機作業明細。' : '僅比較最近 ' + Math.min(model.days.length,7) + ' 個有紀錄的日期；沒有作業紀錄的日期不會自動視為 0。';
    document.getElementById('p79driverCraneBars').innerHTML = craneBarsMarkup(model.visibleCranes);
    document.getElementById('p79driverComposition').innerHTML = compositionMarkup(d);
    document.getElementById('p79driverCalculation').innerHTML = '<div class="p79driver-calc"><b>本次計算</b><div>總櫃數 = ' + fmt(d.disc) + '（卸）＋' + fmt(d.load) + '（裝）＝ <strong>' + fmt(d.containers) + ' 櫃</strong></div><div>H/C 為 ' + fmt(d.hc) + '，不計入總櫃數。</div><div>GPH =（' + fmt(d.containers) + '＋' + fmt(d.hc) + '）÷ ' + fmt(d.hours) + ' 小時＝ <strong>' + fmt(d.gph) + '</strong></div><small>Bundle 扣除：' + fmt(d.bundle) + '（已反映於 WORKING REPORT 的 DISC／LOAD，不會再次扣除）</small></div>';
  }
  root.P79DriverDashboard = { render: render, build: build, sum: sum, dayRows: dayRows, byAqc: byAqc, detailRows: detailRows, trendMarkup: trendMarkup, craneBarsMarkup: craneBarsMarkup };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure);
  else ensure();
})(window);
