/* Excel 仕様書の取り込み（列の対応付け画面つき） */
(function (TR) {
  'use strict';
  const U = TR.util;
  const ui = TR.ui;

  const norm = (s) => String(s == null ? '' : s)
    .normalize('NFKC').toLowerCase().replace(/[\s　\r\n:：()（）【】\[\]]/g, '');

  function colName(c) {
    let s = '';
    c++;
    while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
    return s;
  }

  /** シートを 2 次元配列化（結合セルは左上の値で埋める） */
  function sheetRows(XLSX, ws) {
    if (!ws || !ws['!ref']) return { rows: [], r0: 0, c0: 0 };
    const range = XLSX.utils.decode_range(ws['!ref']);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
    (ws['!merges'] || []).forEach((m) => {
      const v = (rows[m.s.r - range.s.r] || [])[m.s.c - range.s.c];
      for (let r = m.s.r; r <= m.e.r; r++) {
        const row = rows[r - range.s.r] || (rows[r - range.s.r] = []);
        for (let c = m.s.c; c <= m.e.c; c++) {
          if (r === m.s.r && c === m.s.c) continue;
          row[c - range.s.c] = v;
        }
      }
    });
    return { rows, r0: range.s.r, c0: range.s.c };
  }

  function aliasScore(cell) {
    const n = norm(cell);
    if (!n) return 0;
    for (const f of TR.FIELDS) {
      if (norm(f.label) === n || f.aliases.some((a) => norm(a) === n)) return 2;
    }
    for (const f of TR.FIELDS) {
      if (f.aliases.some((a) => norm(a).length >= 2 && n.includes(norm(a)))) return 1;
    }
    return 0;
  }

  function detectHeaderRow(rows) {
    let best = 0, bestScore = -1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const score = (rows[i] || []).reduce((s, c) => s + aliasScore(c), 0);
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return best;
  }

  function guessMapping(header) {
    const map = {};
    const used = new Set();
    const hs = header.map(norm);
    // 1) 完全一致
    TR.FIELDS.forEach((f) => {
      const keys = [f.label, ...f.aliases].map(norm);
      const j = hs.findIndex((h, idx) => h && !used.has(idx) && keys.includes(h));
      if (j >= 0) { map[f.key] = j; used.add(j); }
    });
    // 2) 部分一致
    TR.FIELDS.forEach((f) => {
      if (map[f.key] != null) return;
      const keys = [f.label, ...f.aliases].map(norm).filter((k) => k.length >= 2);
      const j = hs.findIndex((h, idx) => h && !used.has(idx) && keys.some((k) => h.includes(k)));
      if (j >= 0) { map[f.key] = j; used.add(j); }
    });
    return map;
  }

  function cellText(v, key) {
    if (key === 'date') return U.normalizeDate(v);
    if (v instanceof Date) return U.normalizeDate(v);
    if (v == null) return '';
    return String(v).replace(/\r\n?/g, '\n').trim();
  }

  /** 対応付けに従って項目化 */
  function buildItems(rows, headerIdx, map, opts) {
    const out = [];
    const last = { major: '', minor: '' };
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const v = {};
      TR.FIELDS.forEach((f) => { v[f.key] = map[f.key] != null && map[f.key] !== '' ? cellText(row[map[f.key]], f.key) : ''; });
      const hasAny = TR.FIELDS.some((f) => v[f.key]);
      if (!hasAny) continue;
      if (opts.fillDown) {
        if (v.major) { if (v.major !== last.major) last.minor = ''; last.major = v.major; } else v.major = last.major;
      }
      // 大項目だけの行（見出し行）はスキップ
      const others = TR.FIELDS.filter((f) => f.key !== 'major').some((f) => v[f.key]);
      if (!others) continue;
      if (opts.fillDown) {
        if (v.minor) last.minor = v.minor; else if (!v.no && !v.expected && !v.steps) v.minor = last.minor;
      }
      const it = TR.newItem(v.no);
      TR.FIELDS.forEach((f) => { if (f.key !== 'result') it[f.key] = v[f.key]; });
      it.result = map.result != null && map.result !== '' ? U.normalizeResult(v.result) : '未実施';
      out.push(it);
    }
    if (opts.autoNo) {
      out.forEach((it, i) => { if (!it.no) it.no = `TC-${U.pad(i + 1, 3)}`; });
    }
    return out;
  }

  function mappingHtml(header, map) {
    const opts = (sel) => `<option value="">（取り込まない）</option>` + header.map((h, j) =>
      `<option value="${j}" ${String(sel) === String(j) ? 'selected' : ''}>${colName(j)}列：${U.esc(String(h || '').replace(/\n/g, ' ').slice(0, 30) || '（空欄）')}</option>`).join('');
    return TR.FIELDS.map((f) => `
      <label class="map-row"><span>${f.label}</span><select data-map="${f.key}">${opts(map[f.key])}</select></label>`).join('');
  }

  function previewHtml(items) {
    if (!items.length) return '<p class="muted">取り込める行がありません。見出し行と列の対応を確認してください。</p>';
    const cols = TR.FIELDS.filter((f) => ['no', 'major', 'minor', 'expected', 'result', 'assignee', 'date'].includes(f.key));
    return `<p class="muted small">${items.length} 件を取り込みます（先頭5件を表示）</p>
      <div class="table-scroll"><table class="preview"><thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>${items.slice(0, 5).map((it) => `<tr>${cols.map((c) => `<td>${c.key === 'result' ? ui.badge(it.result) : U.esc(String(it[c.key] || '').slice(0, 40))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  async function start() {
    const [file] = await ui.pickFile('.xlsx,.xlsm,.xls,.csv,.ods');
    if (!file) return;
    const b = ui.busy('Excel を読み込み中…');
    let XLSX, wb;
    try {
      XLSX = await TR.libs.xlsx();
      const buf = await U.readAsArrayBuffer(file);
      wb = XLSX.read(buf, { type: 'array', cellDates: true });
    } finally { b.close(); }

    const st = { sheet: wb.SheetNames[0], rows: [], r0: 0, headerIdx: 0, map: {}, items: [] };

    const loadSheet = (name) => {
      st.sheet = name;
      const r = sheetRows(XLSX, wb.Sheets[name]);
      st.rows = r.rows;
      st.r0 = r.r0;
      st.headerIdx = detectHeaderRow(st.rows);
      st.map = guessMapping(st.rows[st.headerIdx] || []);
    };
    // 対応する見出しが最も多いシートを初期選択
    let bestSheet = wb.SheetNames[0], bestScore = -1;
    wb.SheetNames.forEach((n) => {
      const r = sheetRows(XLSX, wb.Sheets[n]).rows;
      const h = detectHeaderRow(r);
      const s = (r[h] || []).reduce((a, c) => a + aliasScore(c), 0);
      if (s > bestScore) { bestScore = s; bestSheet = n; }
    });
    loadSheet(bestSheet);

    const proj = TR.state.project;
    const body = `
      <p class="muted small">ファイル：${U.esc(file.name)}</p>
      <div class="import-top">
        <label class="field"><span>シート</span><select id="impSheet">${wb.SheetNames.map((n) => `<option ${n === st.sheet ? 'selected' : ''}>${U.esc(n)}</option>`).join('')}</select></label>
        <label class="field"><span>見出しの行番号</span><input id="impHeader" type="number" min="1"></label>
      </div>
      <h3 class="sub">列の対応付け</h3>
      <div class="map-grid" id="impMap"></div>
      <div class="import-opts">
        <label class="chk"><input type="checkbox" id="impFill" checked> 空欄・結合セルの大項目／小項目は上の行を引き継ぐ</label>
        <label class="chk"><input type="checkbox" id="impAutoNo" checked> ID が空欄なら自動採番</label>
        <div class="radio-row">
          取り込み方法：
          <label class="chk"><input type="radio" name="impMode" value="append" checked> 現在のプロジェクトに追加</label>
          <label class="chk"><input type="radio" name="impMode" value="replace"> 現在の項目を置き換え</label>
          <label class="chk"><input type="radio" name="impMode" value="new"> 新しいプロジェクトとして作成</label>
        </div>
      </div>
      <h3 class="sub">プレビュー</h3>
      <div id="impPreview"></div>`;

    const recompute = (el) => {
      st.items = buildItems(st.rows, st.headerIdx, st.map, {
        fillDown: U.$('#impFill', el).checked,
        autoNo: U.$('#impAutoNo', el).checked,
      });
      U.$('#impPreview', el).innerHTML = previewHtml(st.items);
    };
    const renderMap = (el) => {
      U.$('#impHeader', el).value = st.r0 + st.headerIdx + 1;
      U.$('#impMap', el).innerHTML = mappingHtml(st.rows[st.headerIdx] || [], st.map);
      recompute(el);
    };

    const res = await ui.modal({
      title: 'Excel 仕様書の取り込み',
      wide: true,
      sticky: true,
      body,
      buttons: [{ label: 'キャンセル', value: null }, { label: '取り込む', value: 'ok', cls: 'btn-primary' }],
      onOpen(el) {
        renderMap(el);
        U.$('#impSheet', el).addEventListener('change', (e) => { loadSheet(e.target.value); renderMap(el); });
        U.$('#impHeader', el).addEventListener('change', (e) => {
          const idx = Math.max(0, (parseInt(e.target.value, 10) || 1) - 1 - st.r0);
          st.headerIdx = Math.min(idx, Math.max(0, st.rows.length - 1));
          st.map = guessMapping(st.rows[st.headerIdx] || []);
          renderMap(el);
        });
        U.$('#impMap', el).addEventListener('change', (e) => {
          const s = e.target.closest('[data-map]');
          if (!s) return;
          st.map[s.dataset.map] = s.value === '' ? null : +s.value;
          recompute(el);
        });
        ['#impFill', '#impAutoNo'].forEach((s) => U.$(s, el).addEventListener('change', () => recompute(el)));
      },
      onButton(v, el) {
        if (v !== 'ok') return true;
        if (!st.items.length) { ui.toast('取り込める行がありません', 'error'); return false; }
        st.mode = (U.$('input[name="impMode"]:checked', el) || {}).value || 'append';
        return true;
      },
    });
    if (res !== 'ok') return;

    if (st.mode === 'replace') {
      if (!(await ui.confirm(`現在の ${proj.items.length} 件の項目（エビデンス含む）を削除し、${st.items.length} 件で置き換えます。よろしいですか？`, '置き換える', true))) return;
      const ids = proj.items.flatMap((it) => it.evidence || []);
      if (ids.length) await TR.db.deleteImages(ids);
      proj.items = st.items;
      await TR.app.save(true);
    } else if (st.mode === 'new') {
      const p = TR.newProject(file.name.replace(/\.[^.]+$/, ''));
      p.items = st.items;
      await TR.db.putProject(p);
      await TR.app.reloadProjects(p.id);
    } else {
      proj.items.push(...st.items);
      await TR.app.save(true);
    }
    TR.app.gotoList({});
    ui.toast(`${st.items.length} 件を取り込みました`, 'success');
  }

  TR.importer = { start, _test: { guessMapping, detectHeaderRow, buildItems } };
})(window.TR);
