/* 表形式エディタ（Excel ライクな直接編集）— PC 用 */
(function (TR) {
  'use strict';
  const U = TR.util;
  const ui = TR.ui;

  const COLS = [
    { key: 'no', label: 'ID', w: 84, stick: true },
    { key: 'major', label: '大項目', w: 110, suggest: true },
    { key: 'minor', label: '小項目', w: 170, suggest: true },
    { key: 'precondition', label: '前提条件', w: 200, multi: true },
    { key: 'steps', label: '手順', w: 280, multi: true },
    { key: 'expected', label: '期待結果', w: 260, multi: true },
    { key: 'result', label: '判定', w: 104, type: 'result' },
    { key: 'actual', label: '実績', w: 220, multi: true },
    { key: 'assignee', label: '担当', w: 86, suggest: true },
    { key: 'date', label: '実施日', w: 104, type: 'date' },
    { key: 'evidence', label: 'エビデンス', w: 150, type: 'evidence' },
    { key: 'note', label: '備考', w: 180, multi: true },
  ];
  const PRESETS = {
    create: { label: '作成', keys: ['no', 'major', 'minor', 'precondition', 'steps', 'expected', 'note'] },
    run: { label: '実施', keys: ['no', 'major', 'minor', 'steps', 'expected', 'result', 'actual', 'assignee', 'date', 'evidence'] },
    all: { label: 'すべて', keys: COLS.map((c) => c.key) },
  };
  const RH_W = 44; // 行番号列の幅

  const LS = {
    get(k, d) { try { const v = localStorage.getItem('tr.grid.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tr.grid.' + k, JSON.stringify(v)); } catch (e) { /* noop */ } },
  };

  const G = (TR.grid = {});
  let host, wrap, inner, table, editor, sugg, status;
  let rows = [], cols = [];
  let anchor = { r: 0, c: 0 }, end = { r: 0, c: 0 };
  let editing = false;
  let preset = LS.get('preset', 'all');
  let widths = LS.get('widths', {});
  let suggList = [], suggIdx = -1, suggMode = '';

  const app = () => TR.app;
  const W = (c) => widths[c.key] || c.w;

  G.COLS = COLS;
  G.PRESETS = PRESETS;
  G.preset = () => preset;
  G.setPreset = function (p) {
    if (!PRESETS[p]) return;
    preset = p;
    LS.set('preset', p);
    G.render();
    G.focus();
  };
  G.isActive = () => document.activeElement === editor;

  /* ---------- 描画 ---------- */
  function cellHtml(it, c, r, ci) {
    let cls = `g-c g-${c.key}`;
    let inner;
    if (c.type === 'result') {
      inner = ui.badge(it.result);
      if (it.result === '対象外') {
        const t = TR.naText(it);
        inner += `<div class="g-na">${t ? U.esc(t) : '<span class="warn-ic">⚠ 理由未入力</span>'}</div>`;
        if (!t) cls += ' g-warn';
      }
    } else if (c.type === 'evidence') {
      const ev = it.evidence || [];
      inner = `<div class="g-thumbs">${ev.slice(0, 3).map((id, i) => `<img data-thumb="${U.esc(id)}" data-ev-idx="${i}" alt="">`).join('')}`
        + (ev.length > 3 ? `<span class="more">+${ev.length - 3}</span>` : '')
        + (!ev.length && it.result === 'OK' ? '<span class="warn-ic">⚠ 未添付</span>' : '') + '</div>';
      if (!ev.length && it.result === 'OK') cls += ' g-warn';
    } else {
      inner = `<div class="g-v">${U.esc(it[c.key] || '')}</div>`;
    }
    if (c.stick) cls += ' g-stick';
    if (it.aiFields && it.aiFields.includes(c.key)) cls += ' g-ai';
    return `<td class="${cls}" data-c="${ci}">${inner}</td>`;
  }

  function rowHtml(it, r) {
    const rv = TR.isReview(it);
    return `<tr data-r="${r}" data-id="${U.esc(it.id)}"${rv ? ' class="ai-row"' : ''}><th class="g-rh" title="${rv ? '取り込んだ内容が未確認（色付きのセル）／' : ''}ドラッグで並べ替え／ダブルクリックで詳細">${r + 1}</th>${cols.map((c, ci) => cellHtml(it, c, r, ci)).join('')}</tr>`;
  }

  G.render = function () {
    if (!host || !TR.state.project) return;
    rows = app().viewItems();
    cols = PRESETS[preset].keys.map((k) => COLS.find((c) => c.key === k));
    const total = RH_W + cols.reduce((s, c) => s + W(c), 0);
    table.style.width = total + 'px';
    table.innerHTML = `<colgroup><col style="width:${RH_W}px">${cols.map((c) => `<col style="width:${W(c)}px">`).join('')}</colgroup>
      <thead><tr><th class="g-rh g-corner" title="すべて選択"></th>${cols.map((c, i) => `<th class="${c.stick ? 'g-stick' : ''}" data-c="${i}">${c.label}<span class="g-rs" data-rs="${i}"></span></th>`).join('')}</tr></thead>
      <tbody>${rows.map(rowHtml).join('')}</tbody>`;
    U.$('.g-empty', host).hidden = rows.length > 0;
    U.$$('[data-preset]', host.parentElement).forEach((b) => b.classList.toggle('on', b.dataset.preset === preset));
    clampSel();
    TR.imgCache.hydrate(table);
    stickyOffsets();
    paintSel();
    fitHeight();
  };

  G.refreshRow = function (it) {
    const r = rows.indexOf(it);
    if (r < 0) return;
    const tr = table.tBodies[0].rows[r];
    if (!tr) return;
    const tmp = document.createElement('tbody');
    tmp.innerHTML = rowHtml(it, r);
    const nr = tmp.firstElementChild;
    tr.replaceWith(nr);
    TR.imgCache.hydrate(nr);
    paintSel();
  };

  function stickyOffsets() {
    U.$$('.g-stick', table).forEach((el) => { el.style.left = RH_W + 'px'; });
  }

  function fitHeight() {
    if (!wrap.offsetParent) return;
    const top = wrap.getBoundingClientRect().top;
    const h = Math.max(260, window.innerHeight - top - 40);
    wrap.style.height = h + 'px';
  }

  const cellEl = (r, c) => {
    const tr = table.tBodies[0] && table.tBodies[0].rows[r];
    return tr ? tr.cells[c + 1] : null;
  };

  /* ---------- 選択 ---------- */
  function rng() {
    return {
      r1: Math.min(anchor.r, end.r), r2: Math.max(anchor.r, end.r),
      c1: Math.min(anchor.c, end.c), c2: Math.max(anchor.c, end.c),
    };
  }
  function clampSel() {
    const mr = Math.max(0, rows.length - 1), mc = Math.max(0, cols.length - 1);
    anchor = { r: Math.min(anchor.r, mr), c: Math.min(anchor.c, mc) };
    end = { r: Math.min(end.r, mr), c: Math.min(end.c, mc) };
  }
  function paintSel() {
    U.$$('.sel, .act', table).forEach((e) => e.classList.remove('sel', 'act'));
    U.$$('tr.rsel', table).forEach((e) => e.classList.remove('rsel'));
    U.$$('thead th.csel', table).forEach((e) => e.classList.remove('csel'));
    if (!rows.length) { placeEditor(); updateStatus(); return; }
    const g = rng();
    for (let r = g.r1; r <= g.r2; r++) {
      const tr = table.tBodies[0].rows[r];
      if (!tr) continue;
      tr.classList.add('rsel');
      for (let c = g.c1; c <= g.c2; c++) tr.cells[c + 1].classList.add('sel');
    }
    for (let c = g.c1; c <= g.c2; c++) { const th = table.tHead.rows[0].cells[c + 1]; if (th) th.classList.add('csel'); }
    const a = cellEl(anchor.r, anchor.c);
    if (a) a.classList.add('act');
    placeEditor();
    updateStatus();
  }
  function ensureVisible(r, c) {
    const td = cellEl(r, c);
    if (!td) return;
    const hh = table.tHead.offsetHeight;
    const stickW = RH_W + (cols[0] && cols[0].stick && c !== 0 ? W(cols[0]) : 0);
    const top = td.offsetTop, bottom = top + td.offsetHeight;
    if (top - hh < wrap.scrollTop) wrap.scrollTop = top - hh;
    else if (bottom > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = bottom - wrap.clientHeight + 2;
    if (td.classList.contains('g-stick')) return;
    const left = td.offsetLeft, right = left + td.offsetWidth;
    if (left - stickW < wrap.scrollLeft) wrap.scrollLeft = left - stickW;
    else if (right > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = right - wrap.clientWidth + 2;
  }
  function setSel(r, c, extend) {
    if (!rows.length) return;
    r = Math.max(0, Math.min(rows.length - 1, r));
    c = Math.max(0, Math.min(cols.length - 1, c));
    const prevRow = anchor.r;
    if (extend) end = { r, c };
    else { anchor = { r, c }; end = { r, c }; }
    ensureVisible(r, c);
    paintSel();
    if (!extend && prevRow !== r) followDetail();
  }
  function followDetail() {
    const it = rows[anchor.r];
    if (it && TR.detail.isOpen() && TR.detail.currentId() !== it.id) TR.detail.open(it.id, false, true);
  }
  function selectedItems() {
    const g = rng();
    return rows.slice(g.r1, g.r2 + 1);
  }
  G.selectedItems = () => (rows.length ? selectedItems() : []);
  G.activeItem = () => rows[anchor.r] || null;
  G.selectItem = function (id, colKey) {
    const r = rows.findIndex((x) => x.id === id);
    if (r < 0) return;
    let c = anchor.c;
    if (colKey) { const ci = cols.findIndex((x) => x.key === colKey); if (ci >= 0) c = ci; }
    setSel(r, c, false);
  };
  G.focus = function () {
    if (editor && host.offsetParent) editor.focus({ preventScroll: true });
  };

  /* ---------- エディタ ---------- */
  function placeEditor() {
    if (!editor) return;
    const td = cellEl(anchor.r, anchor.c);
    if (!td) { editor.style.left = '-9999px'; return; }
    let left = td.offsetLeft;
    if (td.classList.contains('g-stick')) left = Math.max(left, wrap.scrollLeft + parseFloat(td.style.left || 0));
    editor.style.left = left + 'px';
    editor.style.top = td.offsetTop + 'px';
    editor.style.width = (editing && cols[anchor.c].multi ? Math.max(td.offsetWidth, 360) : td.offsetWidth) + 'px';
    if (!editing) editor.style.height = td.offsetHeight + 'px';
    if (editing) grow();
    placeSuggest();
  }
  function grow() {
    const td = cellEl(anchor.r, anchor.c);
    editor.style.height = 'auto';
    editor.style.height = Math.min(320, Math.max(td ? td.offsetHeight : 30, editor.scrollHeight + 2)) + 'px';
  }

  function startEdit(mode) {
    const c = cols[anchor.c];
    const it = rows[anchor.r];
    if (!it || !c) return false;
    if (c.type === 'evidence') { editor.value = ''; return false; }
    if (c.type === 'result' && mode === 'edit') { editor.value = ''; openResultPop(); return false; }
    editing = true;
    if (mode === 'edit') editor.value = it[c.key] || '';
    wrap.classList.add('editing');
    editor.classList.add('on');
    placeEditor();
    if (mode === 'edit') { const n = editor.value.length; editor.setSelectionRange(n, n); }
    updateStatus();
    if (c.suggest) showSuggest('auto');
    return true;
  }
  function endEdit() {
    editing = false;
    editor.value = '';
    editor.classList.remove('on');
    wrap.classList.remove('editing');
    hideSuggest();
    placeEditor();
    updateStatus();
  }
  function commit(dr, dc, fillRange) {
    if (!editing) return;
    const v = editor.value;
    const c = cols[anchor.c];
    const it = rows[anchor.r];
    endEdit();
    const targets = [];
    if (fillRange) {
      const g = rng();
      for (let r = g.r1; r <= g.r2; r++) for (let ci = g.c1; ci <= g.c2; ci++) targets.push([rows[r], cols[ci]]);
    } else targets.push([it, c]);
    const changed = targets.filter(([t, col]) => col.type !== 'evidence' && String(t[col.key] || '') !== v);
    if (changed.length) {
      app().mutate(() => changed.forEach(([t, col]) => app().setField(t, col.key, v)));
      changed.forEach(([t]) => G.refreshRow(t));
      const naRows = changed.filter(([t, col]) => col.key === 'result' && t.result === '対象外' && !TR.naText(t)).map(([t]) => t);
      if (naRows.length) askReason(naRows);
    }
    if (dr || dc) move(dr, dc, false);
  }

  async function askReason(items) {
    const na = await ui.askNaReason(items.length === 1 ? items[0] : {}, items.length);
    if (na) {
      app().mutate(() => items.forEach((t) => Object.assign(t, na)));
      items.forEach((t) => G.refreshRow(t));
      app().afterChange();
    }
    G.focus();
  }

  /* ---------- 判定 ---------- */
  G.setResult = async function (result) {
    const items = selectedItems();
    if (!items.length) return;
    await app().applyResult(items, result);
    items.forEach((t) => G.refreshRow(t));
    G.focus();
  };

  let resultPop = null;
  function closeResultPop() { if (resultPop) { resultPop.remove(); resultPop = null; } }
  function openResultPop() {
    closeResultPop();
    const td = cellEl(anchor.r, anchor.c);
    if (!td) return;
    const pop = document.createElement('div');
    pop.className = 'quick-pop';
    const cur = rows[anchor.r].result;
    pop.innerHTML = TR.RESULTS.map((r, i) => `<button data-r="${r}" class="${cur === r ? 'cur' : ''}" title="キー ${i + 1}">${ui.badge(r)}</button>`).join('');
    document.body.appendChild(pop);
    const rc = td.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, rc.left)) + 'px';
    pop.style.top = (rc.bottom + window.scrollY + 2) + 'px';
    pop.addEventListener('mousedown', (e) => e.preventDefault());
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      closeResultPop();
      G.setResult(b.dataset.r);
    });
    resultPop = pop;
  }

  /* ---------- 候補（オートコンプリート・共通手順） ---------- */
  function showSuggest(mode) {
    const c = cols[anchor.c];
    const it = rows[anchor.r];
    if (!c || !it) return;
    const q = editor.value.trim().toLowerCase();
    const seen = new Set();
    const list = [];
    if (mode === 'snip') {
      (TR.state.project.snippets || []).forEach((s) => {
        if (!q || (s.title + '\n' + s.text).toLowerCase().includes(q)) list.push({ label: '共通手順：' + s.title, value: s.text, snip: true });
      });
    }
    TR.state.project.items.forEach((x) => {
      const v = x[c.key];
      if (!v || x === it || seen.has(v)) return;
      seen.add(v);
      if (mode === 'auto' && (v === editor.value || (q && !v.toLowerCase().includes(q)))) return;
      if (mode === 'snip' && q && !v.toLowerCase().includes(q)) return;
      list.push({ label: (mode === 'snip' ? `${x.no}：` : '') + v, value: v });
    });
    suggList = list.slice(0, mode === 'snip' ? 30 : 8);
    suggMode = mode;
    suggIdx = mode === 'snip' ? 0 : -1;
    if (!suggList.length) {
      if (mode === 'snip') sugg.innerHTML = '<div class="g-sg-empty">候補がありません（メニュー「共通手順の管理」で登録できます）</div>';
      else { hideSuggest(); return; }
    } else renderSuggest();
    sugg.hidden = false;
    placeSuggest();
  }
  function renderSuggest() {
    sugg.innerHTML = suggList.map((s, i) => `<div class="g-sg ${i === suggIdx ? 'on' : ''} ${s.snip ? 'snip' : ''}" data-i="${i}">${U.esc(s.label.length > 160 ? s.label.slice(0, 160) + '…' : s.label)}</div>`).join('');
  }
  function hideSuggest() { sugg.hidden = true; suggList = []; suggIdx = -1; suggMode = ''; }
  function placeSuggest() {
    if (!sugg || sugg.hidden) return;
    sugg.style.left = editor.style.left;
    sugg.style.top = (parseFloat(editor.style.top) + editor.offsetHeight) + 'px';
    sugg.style.minWidth = Math.max(240, editor.offsetWidth) + 'px';
  }
  function acceptSuggest(i) {
    const s = suggList[i];
    if (!s) return;
    if (suggMode === 'snip' && editor.value.trim() && cols[anchor.c].multi) {
      const p = editor.selectionStart;
      const before = editor.value.slice(0, p), after = editor.value.slice(p);
      const ins = (before && !before.endsWith('\n') ? '\n' : '') + s.value;
      editor.value = before + ins + after;
      const n = (before + ins).length;
      editor.setSelectionRange(n, n);
    } else {
      editor.value = s.value;
      if (suggMode === 'auto') { hideSuggest(); commit(1, 0); return; }
    }
    hideSuggest();
    grow();
  }

  /* ---------- 移動 ---------- */
  function move(dr, dc, extend, jump) {
    const base = extend ? end : anchor;
    let r = base.r, c = base.c;
    if (jump) {
      if (dr) r = dr > 0 ? rows.length - 1 : 0;
      if (dc) c = dc > 0 ? cols.length - 1 : 0;
    } else { r += dr; c += dc; }
    setSel(r, c, extend);
  }

  function rowHasContent(it) {
    return ['no', 'major', 'minor', 'precondition', 'steps', 'expected', 'actual', 'note'].some((k) => it[k] && k !== 'no' && k !== 'major');
  }

  /** Enter で下へ。最終行で内容があれば新しい行を追加 */
  function enterDown() {
    if (anchor.r === rows.length - 1 && rowHasContent(rows[anchor.r])) {
      G.insertRows('below', 1, true);
      return;
    }
    move(1, 0, false);
  }

  /* ---------- 行操作 ---------- */
  G.insertRows = function (where = 'below', count, keepCol) {
    const project = TR.state.project;
    const items = project.items;
    const sel = rows.length ? selectedItems() : [];
    const n = count || Math.max(1, sel.length);
    const ref = where === 'above' ? sel[0] : sel[sel.length - 1];
    const created = [];
    app().mutate(() => {
      let idx = ref ? items.indexOf(ref) + (where === 'above' ? 0 : 1) : items.length;
      for (let i = 0; i < n; i++) {
        const it = TR.newItem(TR.nextNo(items));
        const nb = ref || items[items.length - 1];
        if (nb) it.major = nb.major;
        const f = TR.state.filters;
        if (f.major && f.major !== '（未設定）') it.major = f.major;
        if (f.assignee && f.assignee !== '（未設定）') it.assignee = f.assignee;
        items.splice(idx++, 0, it);
        created.push(it);
        app().pin(it);
      }
    });
    G.render();
    const r = rows.indexOf(created[0]);
    let c = anchor.c;
    if (!keepCol) { const mi = cols.findIndex((x) => x.key === 'minor'); c = mi >= 0 ? mi : 0; }
    if (r >= 0) setSel(r, c, false);
    app().afterChange();
    G.focus();
    return created;
  };

  G.duplicateRows = function () {
    const sel = selectedItems();
    if (!sel.length) return;
    const items = TR.state.project.items;
    const created = [];
    app().mutate(() => {
      let idx = items.indexOf(sel[sel.length - 1]) + 1;
      sel.forEach((src) => {
        const it = TR.newItem(TR.nextNo(items));
        ['major', 'minor', 'precondition', 'steps', 'expected', 'assignee', 'note'].forEach((k) => { it[k] = src[k]; });
        items.splice(idx++, 0, it);
        created.push(it);
        app().pin(it);
      });
    });
    G.render();
    const r = rows.indexOf(created[0]);
    if (r >= 0) { anchor = { r, c: anchor.c }; end = { r: r + created.length - 1, c: anchor.c }; paintSel(); ensureVisible(r, anchor.c); }
    app().afterChange();
    ui.toast(`${created.length} 行を複製しました（判定・実績・エビデンスは空）`);
    G.focus();
  };

  G.deleteRows = function () {
    const sel = selectedItems();
    if (!sel.length) return;
    const items = TR.state.project.items;
    app().mutate(() => sel.forEach((it) => items.splice(items.indexOf(it), 1)));
    if (TR.detail.isOpen() && sel.some((x) => x.id === TR.detail.currentId())) TR.detail.close();
    const r = anchor.r;
    G.render();
    setSel(Math.min(r, rows.length - 1), anchor.c, false);
    app().afterChange();
    ui.toast(`${sel.length} 行を削除しました（Ctrl+Z で元に戻せます）`);
    G.focus();
  };

  /** 選択行を target 行の前/後へ移動 */
  function moveBlock(targetItem, after) {
    const sel = selectedItems();
    if (!sel.length || sel.includes(targetItem)) return;
    const items = TR.state.project.items;
    app().mutate(() => {
      sel.forEach((it) => items.splice(items.indexOf(it), 1));
      const idx = items.indexOf(targetItem) + (after ? 1 : 0);
      items.splice(idx, 0, ...sel);
    });
    G.render();
    const r1 = rows.indexOf(sel[0]);
    anchor = { r: r1, c: anchor.c }; end = { r: r1 + sel.length - 1, c: end.c };
    paintSel();
    ensureVisible(r1, anchor.c);
    app().afterChange();
  }
  G.moveRows = function (d) {
    const g = rng();
    if (d < 0 && g.r1 > 0) moveBlock(rows[g.r1 - 1], false);
    if (d > 0 && g.r2 < rows.length - 1) moveBlock(rows[g.r2 + 1], true);
  };

  G.renumber = async function () {
    const items = TR.state.project.items;
    if (!items.length) return;
    const m = String(items.find((x) => /\d/.test(x.no || '')) ? items.find((x) => /\d/.test(x.no || '')).no : 'TC-001').match(/^(.*?)(\d+)(\D*)$/) || ['', 'TC-', '001', ''];
    const width = Math.max(m[2].length, String(items.length).length);
    const sample = `${m[1]}${'1'.padStart(width, '0')}${m[3]}`;
    if (!(await ui.confirm(`全 ${items.length} 項目の ID を、現在の並び順で ${sample} から振り直します。よろしいですか？`, '振り直す'))) return;
    app().mutate(() => items.forEach((it, i) => { it.no = `${m[1]}${String(i + 1).padStart(width, '0')}${m[3]}`; }));
    G.render();
    app().afterChange();
    ui.toast('ID を振り直しました（Ctrl+Z で元に戻せます）');
  };

  /** 選択行に一括入力 */
  G.bulkEdit = async function () {
    const sel = selectedItems();
    if (!sel.length) return;
    const fields = TR.FIELDS.filter((f) => !['no', 'naNote'].includes(f.key));
    let out = null;
    const v = await ui.modal({
      title: `一括入力（${sel.length} 行）`,
      body: `<div class="form-grid">
        <label class="field"><span>項目</span><select name="key">${fields.map((f) => `<option value="${f.key}">${f.label}</option>`).join('')}</select></label>
        <label class="field"><span>値</span><textarea name="val" rows="2"></textarea></label>
        <label class="field res-field" hidden><span>判定</span><select name="res">${TR.RESULTS.map((r) => `<option>${r}</option>`).join('')}</select></label>
        <p class="muted small" style="grid-column:1/-1">ヒント：表の上で範囲を選び、値を入力して Ctrl+Enter でも一括入力できます。</p></div>`,
      buttons: [{ label: 'キャンセル', value: null }, { label: '入力', value: 'ok', cls: 'btn-primary' }],
      onOpen(el) {
        const sync = () => {
          const isRes = U.$('[name=key]', el).value === 'result';
          U.$('.res-field', el).hidden = !isRes;
          U.$('[name=val]', el).closest('.field').hidden = isRes;
        };
        U.$('[name=key]', el).addEventListener('change', sync);
        sync();
      },
      onButton(val, el) {
        if (val !== 'ok') return true;
        const key = U.$('[name=key]', el).value;
        out = { key, value: key === 'result' ? U.$('[name=res]', el).value : U.$('[name=val]', el).value };
        return true;
      },
    });
    if (v !== 'ok' || !out) return;
    if (out.key === 'result') await app().applyResult(sel, out.value);
    else app().mutate(() => sel.forEach((it) => app().setField(it, out.key, out.value)));
    G.render();
    app().afterChange();
    G.focus();
  };

  /** 選択行の「要確認」印を外す */
  G.markReviewed = function () {
    const sel = selectedItems().filter(TR.isReview);
    if (!sel.length) { ui.toast('選択行に要確認の印はありません'); G.focus(); return; }
    app().mutate(() => sel.forEach((it) => { it.aiFields = []; }));
    sel.forEach((it) => G.refreshRow(it));
    app().afterChange();
    ui.toast(`${sel.length} 行を確認済みにしました`);
    G.focus();
  };

  /* ---------- クリップボード ---------- */
  function cellText(it, c) {
    if (c.type === 'evidence') return (it.evidence || []).length ? `[エビデンス${it.evidence.length}件]` : '';
    return String(it[c.key] || '');
  }
  function toTSV(m) {
    return m.map((row) => row.map((v) => (/[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)).join('\t')).join('\r\n');
  }
  const parseTSV = (text) => U.parseDelimited(text, '\t');
  function copySel() {
    const g = rng();
    const m = [];
    for (let r = g.r1; r <= g.r2; r++) {
      const row = [];
      for (let c = g.c1; c <= g.c2; c++) row.push(cellText(rows[r], cols[c]));
      m.push(row);
    }
    return toTSV(m);
  }
  function clearSel() {
    const g = rng();
    const targets = [];
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      const col = cols[c];
      if (col.type === 'evidence') continue;
      if (col.key === 'result' ? rows[r].result !== '未実施' : rows[r][col.key]) targets.push([rows[r], col]);
    }
    if (!targets.length) return;
    app().mutate(() => targets.forEach(([it, col]) => app().setField(it, col.key, col.key === 'result' ? '未実施' : '')));
    new Set(targets.map((t) => t[0])).forEach((it) => G.refreshRow(it));
    app().afterChange();
  }
  function pasteMatrix(m) {
    if (!rows.length) return;
    const g = rng();
    const touched = new Set();
    const naRows = [];
    const set = (it, col, v) => {
      if (col.type === 'evidence') return;
      app().setField(it, col.key, v);
      touched.add(it);
      if (col.key === 'result' && it.result === '対象外' && !TR.naText(it)) naRows.push(it);
    };
    let added = 0;
    app().mutate(() => {
      if (m.length === 1 && m[0].length === 1 && (g.r2 > g.r1 || g.c2 > g.c1)) {
        for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) set(rows[r], cols[c], m[0][0]);
        return;
      }
      const items = TR.state.project.items;
      m.forEach((row, i) => {
        let r = g.r1 + i;
        if (r >= rows.length) {
          const it = TR.newItem(TR.nextNo(items));
          items.splice(items.indexOf(rows[rows.length - 1]) + 1, 0, it);
          app().pin(it);
          rows.push(it);
          added++;
          r = rows.length - 1;
        }
        row.forEach((v, j) => {
          const c = g.c1 + j;
          if (c < cols.length) set(rows[r], cols[c], v);
        });
      });
      end = { r: Math.min(rows.length - 1, g.r1 + m.length - 1), c: Math.min(cols.length - 1, g.c1 + Math.max(...m.map((x) => x.length)) - 1) };
      anchor = { r: g.r1, c: g.c1 };
    });
    G.render();
    app().afterChange();
    if (added) ui.toast(`${added} 行を追加して貼り付けました`);
    if (naRows.length) askReason(naRows);
  }

  /* ---------- 共通手順に登録 ---------- */
  G.saveSnippetFromCell = async function () {
    const it = rows[anchor.r], c = cols[anchor.c];
    if (!it || !c || !c.multi || !it[c.key]) { ui.toast('前提条件・手順などの文章セルを選んでください', 'error'); return; }
    const title = await promptText('共通手順として登録', 'タイトル', `${c.label}：${String(it[c.key]).split('\n')[0].slice(0, 24)}`);
    if (!title) return;
    const p = TR.state.project;
    p.snippets = p.snippets || [];
    p.snippets.push({ id: U.uid(), title, text: it[c.key] });
    app().save();
    ui.toast('共通手順に登録しました（編集中に Ctrl+Space で呼び出せます）', 'success', 4000);
    G.focus();
  };

  function promptText(title, label, value) {
    let out = null;
    return ui.modal({
      title,
      body: `<label class="field"><span>${U.esc(label)}</span><input name="t" value="${U.esc(value || '')}"></label>`,
      buttons: [{ label: 'キャンセル', value: null }, { label: 'OK', value: 'ok', cls: 'btn-primary' }],
      onOpen(el) { U.$('input', el).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) U.$('.modal-foot .btn-primary', el).click(); }); },
      onButton(v, el) { out = U.$('input', el).value.trim(); return true; },
    }).then((v) => (v === 'ok' ? out : null));
  }

  /* ---------- 状態表示 ---------- */
  function updateStatus() {
    if (!status) return;
    const c = cols[anchor.c];
    const g = rng();
    const n = rows.length ? (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1) : 0;
    let hint;
    if (editing) {
      hint = c && c.multi
        ? 'Enter：確定して下へ ／ Alt+Enter：改行 ／ Ctrl+Space：共通手順・他項目から挿入 ／ Ctrl+Enter：選択範囲すべてに入力 ／ Esc：取消'
        : 'Enter：確定して下へ ／ ↓：候補を選択 ／ Ctrl+Enter：選択範囲すべてに入力 ／ Esc：取消';
    } else if (c && c.type === 'result') {
      hint = '1：OK　2：NG　3：保留　4：未実施　5：対象外（選択した行すべてに適用）／ F2：一覧から選択';
    } else if (c && c.type === 'evidence') {
      hint = 'Ctrl+V：画像を貼り付け ／ ファイルをこのセルにドロップ ／ F2・ダブルクリック：詳細パネル';
    } else {
      hint = '入力するとそのまま編集 ／ F2・ダブルクリック：続きから編集 ／ Enter：下へ（最終行で行を追加） ／ Ctrl+D：上のセルをコピー ／ 右クリック：行の操作';
    }
    status.innerHTML = `<span class="g-pos">${rows.length ? `${rows[anchor.r] ? U.esc(rows[anchor.r].no || '') : ''} ${c ? c.label : ''}${n > 1 ? `　${n} セル選択` : ''}` : ''}</span><span class="g-hint">${hint}</span>`;
  }

  /* ---------- コンテキストメニュー ---------- */
  let ctx = null;
  function closeCtx() { if (ctx) { ctx.remove(); ctx = null; } }
  function openCtx(x, y) {
    closeCtx();
    const n = selectedItems().length;
    const c = cols[anchor.c];
    const m = document.createElement('div');
    m.className = 'menu ctx-menu';
    m.innerHTML = `
      <button data-ctx="open">詳細パネルを開く</button>
      <hr>
      <button data-ctx="above">上に行を挿入${n > 1 ? `（${n}行）` : ''}</button>
      <button data-ctx="below">下に行を挿入${n > 1 ? `（${n}行）` : ''}</button>
      <button data-ctx="dup">選択行を複製</button>
      <button data-ctx="up">上へ移動　<small>Alt+Shift+↑</small></button>
      <button data-ctx="down">下へ移動　<small>Alt+Shift+↓</small></button>
      <button data-ctx="del" class="danger">選択行を削除（${n}行）</button>
      <hr>
      <button data-ctx="bulk">一括入力…</button>
      <button data-ctx="na">対象外にする（理由を入力）</button>
      <button data-ctx="reviewed">✓ 確認済みにする（要確認の印を外す）</button>
      ${c && c.multi ? '<button data-ctx="snip">このセルを共通手順に登録</button>' : ''}
      <hr>
      <button data-ctx="copy">コピー　<small>Ctrl+C</small></button>`;
    document.body.appendChild(m);
    m.style.left = Math.min(x, window.innerWidth - m.offsetWidth - 8) + 'px';
    m.style.top = Math.min(y, window.innerHeight - m.offsetHeight - 8) + window.scrollY + 'px';
    m.addEventListener('mousedown', (e) => e.preventDefault());
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ctx]');
      if (!b) return;
      closeCtx();
      const a = b.dataset.ctx;
      if (a === 'open') TR.detail.open(rows[anchor.r].id);
      else if (a === 'above' || a === 'below') G.insertRows(a);
      else if (a === 'dup') G.duplicateRows();
      else if (a === 'del') G.deleteRows();
      else if (a === 'up') G.moveRows(-1);
      else if (a === 'down') G.moveRows(1);
      else if (a === 'bulk') G.bulkEdit();
      else if (a === 'na') G.setResult('対象外');
      else if (a === 'reviewed') G.markReviewed();
      else if (a === 'snip') G.saveSnippetFromCell();
      else if (a === 'copy') {
        try { await navigator.clipboard.writeText(copySel()); ui.toast('コピーしました'); } catch (err) { ui.toast('Ctrl+C でコピーしてください', 'error'); }
        G.focus();
      }
    });
    ctx = m;
  }

  /* ---------- イベント ---------- */
  function onKey(e) {
    if (e.isComposing || e.keyCode === 229) return;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (resultPop && k === 'Escape') { closeResultPop(); e.preventDefault(); return; }
    if (editing) {
      const c = cols[anchor.c];
      if (!sugg.hidden && suggList.length && (k === 'ArrowDown' || k === 'ArrowUp')) {
        e.preventDefault();
        suggIdx = Math.max(-1, Math.min(suggList.length - 1, suggIdx + (k === 'ArrowDown' ? 1 : -1)));
        renderSuggest();
        return;
      }
      if (k === 'Escape') { e.preventDefault(); if (!sugg.hidden) hideSuggest(); else endEdit(); return; }
      if (k === 'Enter') {
        if (!sugg.hidden && suggIdx >= 0) { e.preventDefault(); acceptSuggest(suggIdx); return; }
        if (e.altKey || e.shiftKey) {
          e.preventDefault();
          if (c.multi) { editor.setRangeText('\n', editor.selectionStart, editor.selectionEnd, 'end'); grow(); }
          return;
        }
        e.preventDefault();
        if (ctrl) { commit(0, 0, true); return; }
        const last = anchor.r === rows.length - 1;
        commit(0, 0);
        if (last) enterDown(); else move(1, 0, false);
        return;
      }
      if (k === 'Tab') { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); return; }
      if (ctrl && (k === ' ' || e.code === 'Space')) { e.preventDefault(); showSuggest('snip'); return; }
      return; // 通常の文字入力
    }

    // 非編集時
    if (!rows.length) {
      if (k === 'Enter' || (k.length === 1 && !ctrl)) { e.preventDefault(); G.insertRows('below', 1); }
      return;
    }
    const c = cols[anchor.c];
    const it = rows[anchor.r];
    const nav = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
    if (nav && e.altKey && e.shiftKey && nav[1] === 0) { e.preventDefault(); G.moveRows(nav[0]); return; }
    if (nav && e.altKey && k === 'ArrowDown' && c.type === 'result') { e.preventDefault(); openResultPop(); return; }
    if (nav) { e.preventDefault(); move(nav[0], nav[1], e.shiftKey, ctrl); return; }
    if (k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1, false); return; }
    if (k === 'Enter') {
      e.preventDefault();
      if (ctrl) { TR.detail.open(it.id); return; }
      if (e.shiftKey) move(-1, 0, false); else enterDown();
      return;
    }
    if (k === 'Home') { e.preventDefault(); if (ctrl) setSel(0, 0, e.shiftKey); else setSel(e.shiftKey ? end.r : anchor.r, 0, e.shiftKey); return; }
    if (k === 'End') { e.preventDefault(); if (ctrl) setSel(rows.length - 1, cols.length - 1, e.shiftKey); else setSel(e.shiftKey ? end.r : anchor.r, cols.length - 1, e.shiftKey); return; }
    if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); move(k === 'PageDown' ? 15 : -15, 0, e.shiftKey); return; }
    if (k === 'F2') { e.preventDefault(); if (c.type === 'evidence') TR.detail.open(it.id); else startEdit('edit'); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearSel(); return; }
    if (k === 'Escape') { closeCtx(); if (anchor.r !== end.r || anchor.c !== end.c) setSel(anchor.r, anchor.c, false); else if (TR.detail.isOpen()) TR.detail.close(); return; }
    if (ctrl) {
      const lk = k.toLowerCase();
      if (lk === 'z' && !e.shiftKey) { e.preventDefault(); app().undo(); return; }
      if (lk === 'y' || (lk === 'z' && e.shiftKey)) { e.preventDefault(); app().redo(); return; }
      if (lk === 'a') { e.preventDefault(); anchor = { r: 0, c: 0 }; end = { r: rows.length - 1, c: cols.length - 1 }; paintSel(); return; }
      if (lk === 'd') { e.preventDefault(); fillDown(); return; }
      if (k === ';') {
        e.preventDefault();
        if (c.key === 'date') { app().mutate(() => selectedItems().forEach((x) => app().setField(x, 'date', U.today()))); selectedItems().forEach((x) => G.refreshRow(x)); }
        return;
      }
      return; // Ctrl+C / X / V は copy/cut/paste イベントで処理
    }
    if (k === ' ' && e.shiftKey) { e.preventDefault(); anchor = { r: anchor.r, c: 0 }; end = { r: end.r, c: cols.length - 1 }; paintSel(); return; }
    if (c.type === 'result' && /^[1-5]$/.test(k)) { e.preventDefault(); G.setResult(TR.RESULTS[+k - 1]); return; }
    if (c.type === 'evidence') {
      if (k === ' ') { e.preventDefault(); TR.detail.open(it.id); return; }
      if (k.length === 1) e.preventDefault();
      return;
    }
    // それ以外の文字はテキストエリアへ入力され、input イベントで編集開始
  }

  function fillDown() {
    const g = rng();
    const targets = [];
    if (g.r1 === g.r2) {
      if (g.r1 === 0) return;
      for (let c = g.c1; c <= g.c2; c++) targets.push([rows[g.r1], cols[c], rows[g.r1 - 1]]);
    } else {
      for (let r = g.r1 + 1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) targets.push([rows[r], cols[c], rows[g.r1]]);
    }
    const t2 = targets.filter(([, col]) => col.type !== 'evidence');
    if (!t2.length) return;
    app().mutate(() => t2.forEach(([it, col, src]) => {
      app().setField(it, col.key, src[col.key] || '');
      if (col.key === 'result' && src.result === '対象外') { it.naReason = src.naReason; it.naNote = src.naNote; it.naRef = src.naRef; }
    }));
    new Set(t2.map((t) => t[0])).forEach((it) => G.refreshRow(it));
    app().afterChange();
  }

  function cellFromEvent(e) {
    const td = e.target.closest('td.g-c, th.g-rh');
    if (!td || !table.contains(td)) return null;
    const tr = td.parentElement;
    if (!tr.dataset.r) return null;
    return { r: +tr.dataset.r, c: td.tagName === 'TH' ? -1 : +td.dataset.c, td };
  }

  function bind() {
    let dragSel = false;
    let rowDrag = null;

    table.addEventListener('mousedown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      closeCtx();
      closeResultPop();
      if (e.target.closest('.g-rs')) return; // 列幅変更
      const th = e.target.closest('thead th');
      if (th) {
        e.preventDefault();
        if (editing) commit(0, 0);
        if (th.classList.contains('g-corner')) { anchor = { r: 0, c: 0 }; end = { r: rows.length - 1, c: cols.length - 1 }; }
        else if (th.dataset.c != null) {
          const ci = +th.dataset.c;
          if (e.shiftKey) end = { r: rows.length - 1, c: ci }; else { anchor = { r: 0, c: ci }; end = { r: rows.length - 1, c: ci }; }
        }
        paintSel();
        G.focus();
        return;
      }
      const p = cellFromEvent(e);
      if (!p) return;
      if (editing && (p.r !== anchor.r || p.c !== anchor.c)) commit(0, 0);
      if (editing) return; // 編集中セル内のクリック
      e.preventDefault();
      if (e.button === 2) {
        const g = rng();
        const inside = p.r >= g.r1 && p.r <= g.r2 && (p.c < 0 || (p.c >= g.c1 && p.c <= g.c2));
        if (!inside) { if (p.c < 0) { anchor = { r: p.r, c: 0 }; end = { r: p.r, c: cols.length - 1 }; paintSel(); } else setSel(p.r, p.c, false); }
        G.focus();
        return;
      }
      if (p.c < 0) {
        // 行番号：行選択 or ドラッグ並べ替え
        const g = rng();
        const fullRow = g.c1 === 0 && g.c2 === cols.length - 1;
        if (e.shiftKey) { end = { r: p.r, c: cols.length - 1 }; anchor = { r: anchor.r, c: 0 }; }
        else if (!(fullRow && p.r >= g.r1 && p.r <= g.r2)) { anchor = { r: p.r, c: 0 }; end = { r: p.r, c: cols.length - 1 }; }
        paintSel();
        if (anchor.r === end.r) followDetail();
        rowDrag = { startY: e.clientY, active: false, target: null, after: false };
        G.focus();
        return;
      }
      setSel(p.r, p.c, e.shiftKey);
      dragSel = true;
      G.focus();
    });

    document.addEventListener('mousemove', (e) => {
      if (dragSel) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el) return;
        const td = el.closest && el.closest('td.g-c');
        if (td && table.contains(td)) {
          const r = +td.parentElement.dataset.r, c = +td.dataset.c;
          if (r !== end.r || c !== end.c) { end = { r, c }; paintSel(); }
        }
      } else if (rowDrag) {
        if (!rowDrag.active && Math.abs(e.clientY - rowDrag.startY) > 5) { rowDrag.active = true; wrap.classList.add('row-dragging'); }
        if (!rowDrag.active) return;
        U.$$('tr.drop-before, tr.drop-after', table).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const tr = el && el.closest && el.closest('tbody tr');
        if (tr && table.contains(tr)) {
          const rc = tr.getBoundingClientRect();
          rowDrag.after = e.clientY > rc.top + rc.height / 2;
          rowDrag.target = rows[+tr.dataset.r];
          tr.classList.add(rowDrag.after ? 'drop-after' : 'drop-before');
        }
        // 端で自動スクロール
        const wr = wrap.getBoundingClientRect();
        if (e.clientY < wr.top + 40) wrap.scrollTop -= 12;
        else if (e.clientY > wr.bottom - 30) wrap.scrollTop += 12;
      }
    });
    document.addEventListener('mouseup', () => {
      dragSel = false;
      if (rowDrag) {
        U.$$('tr.drop-before, tr.drop-after', table).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
        wrap.classList.remove('row-dragging');
        if (rowDrag.active && rowDrag.target) moveBlock(rowDrag.target, rowDrag.after);
        rowDrag = null;
      }
    });

    table.addEventListener('dblclick', (e) => {
      const p = cellFromEvent(e);
      if (!p) return;
      if (p.c < 0) { TR.detail.open(rows[p.r].id); return; }
      const c = cols[p.c];
      if (c.type === 'evidence') TR.detail.open(rows[p.r].id);
      else if (c.type === 'result') openResultPop();
      else startEdit('edit');
    });

    table.addEventListener('click', (e) => {
      const img = e.target.closest('img[data-thumb]');
      if (!img) return;
      const it = rows[+img.closest('tr').dataset.r];
      ui.lightbox(it.evidence.map((id, i) => ({ id, caption: `${it.no}  エビデンス${i + 1}` })), +img.dataset.evIdx);
    });

    table.addEventListener('contextmenu', (e) => {
      if (!cellFromEvent(e)) return;
      e.preventDefault();
      openCtx(e.clientX, e.clientY);
    });
    document.addEventListener('mousedown', (e) => { if (ctx && !e.target.closest('.ctx-menu')) closeCtx(); if (resultPop && !e.target.closest('.quick-pop')) closeResultPop(); });

    // 列幅の変更
    table.addEventListener('pointerdown', (e) => {
      const rs = e.target.closest('.g-rs');
      if (!rs) return;
      e.preventDefault();
      const c = cols[+rs.dataset.rs];
      const startX = e.clientX, startW = W(c);
      const colEl = table.querySelectorAll('col')[+rs.dataset.rs + 1];
      const onMove = (ev) => {
        widths[c.key] = Math.max(48, Math.round(startW + ev.clientX - startX));
        colEl.style.width = widths[c.key] + 'px';
        table.style.width = RH_W + cols.reduce((s, x) => s + W(x), 0) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        LS.set('widths', widths);
        placeEditor();
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });

    // エディタ
    editor.addEventListener('keydown', onKey);
    editor.addEventListener('input', () => {
      if (!editing) {
        if (!startEdit('replace')) { editor.value = ''; return; }
      }
      grow();
      placeSuggest();
      const c = cols[anchor.c];
      if (c && c.suggest) showSuggest('auto');
      else if (suggMode === 'snip') showSuggest('snip');
    });
    editor.addEventListener('compositionstart', () => { if (!editing) startEdit('replace'); });
    editor.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement === editor) return;
        if (editing) commit(0, 0);
        wrap.classList.remove('focused');
      }, 0);
    });
    editor.addEventListener('focus', () => wrap.classList.add('focused'));

    sugg.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const d = e.target.closest('[data-i]');
      if (d) acceptSuggest(+d.dataset.i);
    });

    // クリップボード
    editor.addEventListener('copy', (e) => {
      if (editing || !rows.length) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', copySel());
    });
    editor.addEventListener('cut', (e) => {
      if (editing || !rows.length) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', copySel());
      clearSel();
    });
    editor.addEventListener('paste', (e) => {
      e.stopPropagation(); // 詳細パネルの貼り付け処理に渡さない
      const files = [];
      for (const ci of (e.clipboardData && e.clipboardData.items) || []) {
        if (ci.kind === 'file') { const f = ci.getAsFile(); if (f) files.push(f); }
      }
      if (files.length) {
        e.preventDefault();
        const it = rows[anchor.r];
        if (it) TR.detail.addFilesTo(it, files);
        return;
      }
      if (editing) return;
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      if (text) pasteMatrix(parseTSV(text));
    });

    // 行へのファイルドロップでエビデンス追加
    const isFileDrag = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    let dropRow = null;
    const clearDrop = () => { if (dropRow) dropRow.classList.remove('file-drop'); dropRow = null; };
    table.addEventListener('dragover', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const tr = e.target.closest('tbody tr');
      if (tr !== dropRow) { clearDrop(); dropRow = tr; if (tr) tr.classList.add('file-drop'); }
    });
    table.addEventListener('dragleave', (e) => { if (!table.contains(e.relatedTarget)) clearDrop(); });
    table.addEventListener('drop', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      const tr = e.target.closest('tbody tr');
      clearDrop();
      if (!tr) return;
      const it = rows[+tr.dataset.r];
      setSel(+tr.dataset.r, anchor.c, false);
      TR.detail.addFilesTo(it, Array.from(e.dataTransfer.files || []));
    });

    wrap.addEventListener('scroll', () => { if (!editing) placeEditor(); }, { passive: true });
    window.addEventListener('resize', U.debounce(() => { if (host.offsetParent) { fitHeight(); placeEditor(); } }, 100));
  }

  G.mount = function (el) {
    host = el;
    host.innerHTML = `
      <div class="g-wrap" tabindex="-1">
        <div class="g-inner">
          <table class="grid"></table>
          <textarea class="g-editor" spellcheck="false" aria-label="セルの編集"></textarea>
          <div class="g-sugg" hidden></div>
        </div>
        <div class="g-empty" hidden>項目がありません。ここをクリックして <kbd>Enter</kbd> を押すか、「＋ 行を追加」で入力を始めます。<br>Excel からコピーした表もそのまま貼り付けられます（Ctrl+V）。</div>
      </div>
      <div class="g-status"></div>`;
    wrap = U.$('.g-wrap', host);
    inner = U.$('.g-inner', host);
    table = U.$('table', host);
    editor = U.$('.g-editor', host);
    sugg = U.$('.g-sugg', host);
    status = U.$('.g-status', host);
    U.$('.g-empty', host).addEventListener('mousedown', (e) => { e.preventDefault(); G.focus(); });
    void inner;
    bind();
  };
})(window.TR);
