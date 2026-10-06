/* アプリ本体：状態管理・ダッシュボード・一覧・メニュー */
(function (TR) {
  'use strict';
  const U = TR.util;
  const ui = TR.ui;

  const EMPTY_FILTERS = () => ({ major: '', result: '', assignee: '', q: '', warn: false });

  const S = (TR.state = {
    projects: [],
    project: null,
    view: 'dashboard',
    filters: EMPTY_FILTERS(),
    pinned: new Set(), // 追加直後の行は絞り込みに関わらず表示
  });

  const LS = {
    get(k) { try { return localStorage.getItem('tr.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('tr.' + k, v); } catch (e) { /* noop */ } },
  };

  const app = (TR.app = {});
  const mq = window.matchMedia('(max-width: 760px)');
  app.isMobile = () => mq.matches;

  /* ---------- 保存 ---------- */
  const saveNow = async () => {
    if (!S.project) return;
    try {
      await TR.db.putProject(S.project);
    } catch (e) {
      console.error(e);
      ui.toast('保存に失敗しました：' + e.message, 'error', 6000);
    }
  };
  const saveDebounced = U.debounce(saveNow, 400);
  app.save = function (immediate) {
    if (!S.project) return Promise.resolve();
    S.project.updatedAt = new Date().toISOString();
    if (immediate) { saveDebounced.flush(); return saveNow(); }
    saveDebounced();
    return Promise.resolve();
  };
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDebounced.flush(); });
  window.addEventListener('pagehide', () => saveDebounced.flush());

  /* ---------- 元に戻す / やり直し ---------- */
  const H = (TR.history = { undo: [], redo: [] });
  const snap = () => JSON.stringify(S.project.items);
  H.save = function () {
    if (!S.project) return;
    H.undo.push(snap());
    if (H.undo.length > 100) H.undo.shift();
    H.redo.length = 0;
    updateUndoButtons();
  };
  H.reset = function () { H.undo.length = 0; H.redo.length = 0; updateUndoButtons(); };
  function restore(from, to) {
    if (!from.length) return false;
    to.push(snap());
    S.project.items = JSON.parse(from.pop());
    app.save();
    if (TR.detail.isOpen() && !S.project.items.some((x) => x.id === TR.detail.currentId())) TR.detail.close();
    app.render();
    TR.detail.rerender();
    updateUndoButtons();
    return true;
  }
  app.undo = () => { if (!restore(H.undo, H.redo)) ui.toast('元に戻せる操作はありません'); };
  app.redo = () => { if (!restore(H.redo, H.undo)) ui.toast('やり直せる操作はありません'); };
  function updateUndoButtons() {
    const u = U.$('[data-tool=undo]'), r = U.$('[data-tool=redo]');
    if (u) u.disabled = !H.undo.length;
    if (r) r.disabled = !H.redo.length;
  }

  /** 履歴を残して変更 */
  app.mutate = function (fn) {
    H.save();
    const r = fn();
    app.save();
    return r;
  };

  /** 値の設定（正規化と付随処理込み） */
  app.setField = function (it, key, v) {
    v = v == null ? '' : String(v);
    if (key === 'evidence') return;
    TR.touchField(it, key);
    if (key === 'result') {
      const r = TR.RESULTS.includes(v) ? v : U.normalizeResult(v);
      if (it.result !== r) {
        it.result = r;
        if (TR.DONE_RESULTS.includes(r) && !it.date) it.date = U.today();
      }
    } else if (key === 'date') {
      it.date = U.normalizeDate(v);
    } else {
      it[key] = v;
    }
    it.updatedAt = new Date().toISOString();
  };

  /** 判定を設定（対象外なら理由を確認） */
  app.applyResult = async function (items, result) {
    let na = null;
    if (result === '対象外') {
      na = await ui.askNaReason(items.length === 1 ? items[0] : {}, items.length);
      if (!na) return false;
    }
    app.mutate(() => items.forEach((it) => { app.setField(it, 'result', result); if (na) Object.assign(it, na); }));
    app.afterChange();
    return true;
  };

  /** 変更後の軽い再描画（件数・パネル・モバイル一覧） */
  app.afterChange = U.debounce(() => {
    if (!S.project) return;
    if (S.view === 'list') {
      updateCount();
      if (app.isMobile()) app.renderCards();
    }
    TR.detail.refreshMeta();
  }, 60);

  app.pin = (it) => S.pinned.add(it.id);

  /* ---------- プロジェクト ---------- */
  async function refreshProjects() {
    S.projects = (await TR.db.listProjects()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  function renderProjectSelect() {
    const sel = U.$('#projectSelect');
    sel.innerHTML = S.projects.map((p) => `<option value="${U.esc(p.id)}">${U.esc(p.name)}</option>`).join('');
    if (S.project) sel.value = S.project.id;
  }

  app.selectProject = async function (id) {
    await app.save(true);
    const p = await TR.db.getProject(id);
    if (!p) return;
    p.items = p.items || [];
    p.meta = p.meta || {};
    p.snippets = p.snippets || [];
    p.items.forEach((it) => { ['naReason', 'naNote', 'naRef'].forEach((k) => { if (it[k] == null) it[k] = ''; }); });
    S.project = p;
    S.filters = EMPTY_FILTERS();
    S.pinned.clear();
    H.reset();
    LS.set('lastProject', id);
    TR.detail.close();
    renderProjectSelect();
    app.render();
    TR.db.cleanupOrphans(p).catch(() => {});
  };

  app.reloadProjects = async function (selectId) {
    await refreshProjects();
    if (!S.projects.length) {
      const b = ui.busy('サンプルプロジェクトを作成中…');
      let p;
      try { p = await TR.createSampleProject(); } finally { b.close(); }
      await refreshProjects();
      selectId = p.id;
    }
    const id = selectId && S.projects.find((p) => p.id === selectId) ? selectId : S.projects[0].id;
    await app.selectProject(id);
  };

  function projectForm(p) {
    const m = p.meta || {};
    const f = (k, label, v, ph = '') => `<label class="field"><span>${label}</span><input name="${k}" value="${U.esc(v || '')}" placeholder="${U.esc(ph)}"></label>`;
    return `
      <div class="form-grid">
        ${f('name', 'プロジェクト名（報告書タイトル）', p.name)}
        ${f('system', '対象システム', m.system)}
        ${f('version', 'バージョン', m.version)}
        ${f('period', '実施期間', m.period, '例：2026/10/01 〜 2026/10/10')}
        ${f('author', '作成者', m.author)}
        ${f('org', '組織・会社名', m.org)}
        <label class="field full"><span>概要（報告書の表紙・サマリに表示）</span><textarea name="summary" rows="3">${U.esc(m.summary || '')}</textarea></label>
      </div>`;
  }

  async function editProject(p, title) {
    const v = await ui.modal({
      title,
      body: projectForm(p),
      buttons: [{ label: 'キャンセル', value: null }, { label: '保存', value: 'ok', cls: 'btn-primary' }],
      onButton: (val, el) => {
        if (val !== 'ok') return true;
        const fd = {};
        U.$$('[name]', el).forEach((i) => { fd[i.name] = i.value.trim(); });
        if (!fd.name) { ui.toast('プロジェクト名を入力してください', 'error'); return false; }
        p.name = fd.name;
        p.meta = { system: fd.system, version: fd.version, period: fd.period, author: fd.author, org: fd.org, summary: fd.summary };
        return true;
      },
    });
    return v === 'ok';
  }

  /* ---------- 共通手順 ---------- */
  async function manageSnippets() {
    const p = S.project;
    p.snippets = p.snippets || [];
    const list = p.snippets.map((s) => ({ ...s }));
    const rowHtml = (s, i) => `<div class="snip-row" data-i="${i}">
        <input class="snip-title" value="${U.esc(s.title)}" placeholder="タイトル">
        <textarea class="snip-text" rows="3" placeholder="内容（前提条件・手順など）">${U.esc(s.text)}</textarea>
        <button class="btn btn-sm btn-danger" data-del="${i}">削除</button></div>`;
    const v = await ui.modal({
      title: '共通手順の管理',
      wide: true,
      body: `<p class="muted small">よく使う前提条件・手順を登録しておくと、表の編集中に <kbd>Ctrl</kbd>+<kbd>Space</kbd>（詳細パネルでは「📋」ボタン）で挿入できます。表のセルを右クリック →「このセルを共通手順に登録」でも追加できます。</p>
        <div class="snip-list"></div>
        <button class="btn btn-sm" data-add>＋ 追加</button>`,
      buttons: [{ label: 'キャンセル', value: null }, { label: '保存', value: 'ok', cls: 'btn-primary' }],
      onOpen(el) {
        const box = U.$('.snip-list', el);
        const sync = () => U.$$('.snip-row', box).forEach((r) => {
          const s = list[+r.dataset.i];
          s.title = U.$('.snip-title', r).value;
          s.text = U.$('.snip-text', r).value;
        });
        const draw = () => { box.innerHTML = list.map(rowHtml).join('') || '<p class="muted">まだ登録がありません。</p>'; };
        draw();
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-add]')) { sync(); list.push({ id: U.uid(), title: '', text: '' }); draw(); U.$$('.snip-title', box).pop().focus(); }
          const d = e.target.closest('[data-del]');
          if (d) { sync(); list.splice(+d.dataset.del, 1); draw(); }
        });
        el.addEventListener('input', sync);
      },
    });
    if (v !== 'ok') return;
    p.snippets = list.filter((s) => s.text.trim()).map((s) => ({ id: s.id || U.uid(), title: s.title.trim() || s.text.split('\n')[0].slice(0, 24), text: s.text }));
    await app.save(true);
    ui.toast('共通手順を保存しました', 'success');
  }

  function showShortcuts() {
    const rows = [
      ['セルに文字を入力', 'そのまま編集を開始（日本語入力もそのまま）'],
      ['F2 ／ ダブルクリック', '続きから編集'],
      ['Enter ／ Tab', '確定して下 ／ 右へ（最終行で Enter → 行を追加）'],
      ['Alt+Enter', 'セル内で改行'],
      ['Ctrl+Space（編集中）', '共通手順・他の項目の内容を挿入'],
      ['Ctrl+Enter（編集中）', '選択範囲すべてに同じ値を入力'],
      ['Shift+矢印 ／ ドラッグ', '範囲選択（行番号クリックで行選択）'],
      ['Ctrl+C ／ Ctrl+V', 'コピー ／ 貼り付け（Excel との相互コピペ可。画像を貼るとエビデンスに追加）'],
      ['Ctrl+D', '上のセルをコピー（範囲選択時は先頭行を下へ）'],
      ['Delete', '選択セルを消去'],
      ['Ctrl+Z ／ Ctrl+Y', '元に戻す ／ やり直し'],
      ['判定セルで 1〜5', 'OK ／ NG ／ 保留 ／ 未実施 ／ 対象外（選択行すべて）'],
      ['実施日セルで Ctrl+;', '今日の日付'],
      ['Alt+Shift+↑↓ ／ 行番号をドラッグ', '行を移動'],
      ['Ctrl+Enter（非編集時）', '詳細パネルを開く'],
      ['右クリック', '行の挿入・複製・削除・一括入力など'],
    ];
    ui.modal({
      title: 'キーボード操作',
      wide: true,
      body: `<table class="kbd-table">${rows.map(([k, d]) => `<tr><th>${U.esc(k)}</th><td>${U.esc(d)}</td></tr>`).join('')}</table>`,
    });
  }

  /* ---------- フィルタ ---------- */
  app.filtered = function () {
    const f = S.filters;
    const q = f.q.trim().toLowerCase();
    return S.project.items.filter((it) => {
      if (f.major && (it.major || '（未設定）') !== f.major) return false;
      if (f.result && it.result !== f.result) return false;
      if (f.assignee && (it.assignee || '（未設定）') !== f.assignee) return false;
      if (f.warn && !TR.warnOf(it) && !TR.isReview(it)) return false;
      if (q) {
        const hay = [...TR.FIELDS.map((fd) => it[fd.key] || ''), it.naReason || ''].join('\n').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  };
  /** 表示する行（絞り込み＋追加直後の行） */
  app.viewItems = function () {
    if (!Object.values(S.filters).some(Boolean)) return S.project.items.slice();
    const set = new Set(app.filtered());
    return S.project.items.filter((it) => set.has(it) || S.pinned.has(it.id));
  };

  app.isWarn = (it) => !!TR.warnOf(it);

  function uniq(key) {
    return Array.from(new Set(S.project.items.map((it) => it[key] || '（未設定）')));
  }

  function renderFilters() {
    const f = S.filters;
    const opt = (v, label, cur) => `<option value="${U.esc(v)}" ${v === cur ? 'selected' : ''}>${U.esc(label)}</option>`;
    U.$('#fMajor').innerHTML = opt('', '大項目：すべて', f.major) + uniq('major').map((v) => opt(v, v, f.major)).join('');
    U.$('#fResult').innerHTML = opt('', '判定：すべて', f.result) + TR.RESULTS.map((v) => opt(v, v, f.result)).join('');
    U.$('#fAssignee').innerHTML = opt('', '担当：すべて', f.assignee) + uniq('assignee').map((v) => opt(v, v, f.assignee)).join('');
    U.$('#fQuery').value = f.q;
    U.$('#fWarn').checked = f.warn;
  }

  function updateCount() {
    const n = app.viewItems().length;
    U.$('#listCount').textContent = `${n} / ${S.project.items.length} 件`;
  }

  /* ---------- 一覧（スマホ：カード） ---------- */
  function cardHtml(it) {
    const ev = it.evidence || [];
    const warn = TR.warnOf(it);
    const thumbs = ev.slice(0, 4).map((id, i) => `<img class="thumb" data-thumb="${U.esc(id)}" data-ev-idx="${i}" alt="エビデンス${i + 1}" loading="lazy">`).join('');
    const more = ev.length > 4 ? `<span class="more">+${ev.length - 4}</span>` : '';
    const sel = TR.detail.currentId() === it.id ? ' selected' : '';
    const na = it.result === '対象外' ? `<div class="na-text">${U.esc(TR.naText(it))}</div>` : '';
    return `<tr data-id="${U.esc(it.id)}" class="${warn ? 'warn' : ''}${sel}" tabindex="0">
      <td class="c-no">${U.esc(it.no)}</td>
      <td class="c-major">${U.esc(it.major)}</td>
      <td class="c-minor">${U.esc(it.minor)}${TR.isReview(it) ? ' <span class="ai-tag">要確認</span>' : ''}</td>
      <td class="c-exp"><div class="clamp">${U.esc(it.expected)}</div>${na}</td>
      <td class="c-res"><button class="badge-btn" data-quick="${U.esc(it.id)}" title="判定を変更">${ui.badge(it.result)}</button></td>
      <td class="c-asg">${U.esc(it.assignee)}</td>
      <td class="c-date">${U.esc(it.date)}</td>
      <td class="c-ev"><div class="thumbs">${thumbs}${more}${warn ? `<span class="warn-ic">⚠ ${U.esc(warn)}</span>` : ''}</div></td>
    </tr>`;
  }

  app.renderCards = function () {
    const items = app.viewItems();
    const body = U.$('#itemsBody');
    body.innerHTML = items.map(cardHtml).join('');
    TR.imgCache.hydrate(body);
    const empty = U.$('#listEmpty');
    if (!S.project.items.length) {
      empty.hidden = false;
      empty.textContent = '項目がありません。「＋ 追加」から始めてください（表形式の編集は PC で行えます）。';
    } else if (!items.length) {
      empty.hidden = false;
      empty.textContent = '条件に一致する項目がありません。';
    } else empty.hidden = true;
  };

  app.renderList = function () {
    if (!S.project) return;
    renderFilters();
    updateCount();
    const mobile = app.isMobile();
    U.$('#gridHost').hidden = mobile;
    U.$('#gridTools').hidden = mobile;
    U.$('#cardList').hidden = !mobile;
    if (mobile) app.renderCards();
    else TR.grid.render();
    updateUndoButtons();
  };

  /** 行の再描画（詳細パネルからの編集時） */
  app.updateRow = function (it) {
    if (S.view !== 'list') return;
    if (app.isMobile()) {
      const tr = U.$(`#itemsBody tr[data-id="${CSS.escape(it.id)}"]`);
      if (!tr) return;
      const tmp = document.createElement('tbody');
      tmp.innerHTML = cardHtml(it);
      const nr = tmp.firstElementChild;
      tr.replaceWith(nr);
      TR.imgCache.hydrate(nr);
    } else TR.grid.refreshRow(it);
  };

  /* ---------- 判定の素早い変更（スマホ一覧） ---------- */
  app.setResult = (it, result) => app.applyResult([it], result);

  let quickPop = null;
  function closeQuick() { if (quickPop) { quickPop.remove(); quickPop = null; } }
  function openQuick(btn, it) {
    closeQuick();
    const pop = document.createElement('div');
    pop.className = 'quick-pop';
    pop.innerHTML = TR.RESULTS.map((r) => `<button data-r="${r}" class="${it.result === r ? 'cur' : ''}">${ui.badge(r)}</button>`).join('');
    document.body.appendChild(pop);
    const rc = btn.getBoundingClientRect();
    const pw = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, rc.left + rc.width / 2 - pw / 2)) + 'px';
    pop.style.top = (rc.bottom + window.scrollY + 4) + 'px';
    pop.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      closeQuick();
      if (await app.setResult(it, b.dataset.r)) {
        app.updateRow(it);
        ui.toast(`${it.no || '項目'} を「${it.result}」にしました`);
      }
    });
    quickPop = pop;
  }
  document.addEventListener('click', (e) => { if (quickPop && !e.target.closest('.quick-pop') && !e.target.closest('[data-quick]')) closeQuick(); });
  window.addEventListener('resize', closeQuick);

  /* ---------- ダッシュボード ---------- */
  function stackBar(c, total) {
    if (!total) return '<div class="stack"><span class="seg seg-empty" style="width:100%"></span></div>';
    return '<div class="stack">' + TR.RESULTS.map((r) => {
      const w = (c[r] || 0) / total * 100;
      return w ? `<span class="seg seg-${TR.RESULT_CLASS[r]}" style="width:${w}%" title="${r}: ${c[r]}件"></span>` : '';
    }).join('') + '</div>';
  }

  function groupTable(key, label) {
    const groups = TR.groupBy(S.project.items, key);
    if (!groups.size) return '';
    const rows = Array.from(groups.entries()).map(([name, list]) => {
      const s = TR.summarize(list);
      return `<tr>
        <th scope="row"><button class="link" data-goto-${key}="${U.esc(name)}">${U.esc(name)}</button></th>
        <td class="num">${s.total}</td>
        ${TR.RESULTS.map((r) => `<td class="num r-${TR.RESULT_CLASS[r]}">${s.counts[r] || 0}</td>`).join('')}
        <td class="bar-cell">${stackBar(s.counts, s.total)}<span class="pct">${TR.pct(s.progress)}</span></td>
      </tr>`;
    }).join('');
    return `<div class="card">
      <h3>${label}別</h3>
      <div class="table-scroll"><table class="grp">
        <thead><tr><th>${label}</th><th>件数</th>${TR.RESULTS.map((r) => `<th>${r}</th>`).join('')}<th class="bar-cell">進捗</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }

  app.renderDashboard = function () {
    const p = S.project;
    const s = TR.summarize(p.items);
    const m = p.meta || {};
    const metaLine = [m.system, m.version, m.period].filter(Boolean).map(U.esc).join(' ／ ');
    const okNoEv = p.items.filter((it) => it.result === 'OK' && !(it.evidence || []).length);

    const naNoReason = p.items.filter((it) => it.result === '対象外' && !TR.naText(it));
    const reviewItems = p.items.filter(TR.isReview);
    const ngItems = p.items.filter((it) => it.result === 'NG');
    const naItems = p.items.filter((it) => it.result === '対象外');
    const naBreak = Array.from(TR.groupBy(naItems.map((it) => ({ r: it.naReason || '（理由未入力）' })), 'r').entries());
    const itemLink = (it) => `<li><button class="link" data-open="${U.esc(it.id)}">${U.esc(it.no)}</button> ${U.esc(it.major)} › ${U.esc(it.minor)}</li>`;

    U.$('#view-dashboard').innerHTML = `
      <div class="dash-head">
        <div>
          <h1>${U.esc(p.name)}</h1>
          ${metaLine ? `<p class="muted">${metaLine}</p>` : ''}
        </div>
        <p class="muted small">最終更新：${U.formatDateTime(p.updatedAt)}</p>
      </div>

      <div class="stats">
        <button class="stat" data-goto-result=""><span class="stat-label">全項目</span><span class="stat-val">${s.total}</span></button>
        ${TR.RESULTS.map((r) => `<button class="stat stat-${TR.RESULT_CLASS[r]}" data-goto-result="${r}"><span class="stat-label">${r}</span><span class="stat-val">${s.counts[r] || 0}</span></button>`).join('')}
      </div>

      <div class="card">
        <div class="progress-head">
          <h3>進捗</h3>
          <div class="progress-nums"><strong>${TR.pct(s.progress)}</strong> <span class="muted">（実施済 ${s.done} / 対象 ${s.target} 件${s.counts['対象外'] ? `・対象外 ${s.counts['対象外']} 件を除く` : ''}）</span>　OK率 <strong>${TR.pct(s.okRate)}</strong></div>
        </div>
        ${stackBar(s.counts, s.total)}
        <div class="legend">${TR.RESULTS.map((r) => `<span><i class="dot seg-${TR.RESULT_CLASS[r]}"></i>${r} ${s.counts[r] || 0}</span>`).join('')}</div>
      </div>

      <div class="grid2">
        <div class="card ${okNoEv.length || naNoReason.length || reviewItems.length ? 'card-warn' : ''}">
          <h3>エビデンス未添付</h3>
          <div class="big-num">${s.noEvidenceDone}<small> 件</small></div>
          <p class="muted small">実施済（OK / NG / 保留）でエビデンスが1件もない項目。未実施を含めると ${s.noEvidenceAll} 件。</p>
          ${okNoEv.length ? `<div class="alert">⚠ <strong>OKなのにエビデンスなし：${okNoEv.length} 件</strong>
            <ul class="item-links">${okNoEv.slice(0, 8).map(itemLink).join('')}</ul>
            ${okNoEv.length > 8 ? '<button class="link" data-goto-warn>…すべて表示</button>' : ''}</div>` : '<p class="ok-msg">✓ OK項目はすべてエビデンス添付済みです</p>'}
          ${naNoReason.length ? `<div class="alert">⚠ <strong>対象外の理由が未入力：${naNoReason.length} 件</strong>
            <ul class="item-links">${naNoReason.slice(0, 8).map(itemLink).join('')}</ul></div>` : ''}
          ${reviewItems.length ? `<div class="alert alert-ai">🤖 <strong>取り込み後に未確認の項目：${reviewItems.length} 件</strong>
            <ul class="item-links">${reviewItems.slice(0, 8).map(itemLink).join('')}</ul>
            ${reviewItems.length > 8 ? '<button class="link" data-goto-warn>…すべて表示</button>' : ''}</div>` : ''}
        </div>
        <div class="card">
          <h3>NG 項目</h3>
          <div class="big-num r-ng">${ngItems.length}<small> 件</small></div>
          ${ngItems.length ? `<ul class="item-links">${ngItems.slice(0, 10).map(itemLink).join('')}</ul>` : '<p class="muted">NG はありません</p>'}
          ${naItems.length ? `<h3 class="mt">対象外 ${naItems.length} 件の理由</h3>
            <ul class="na-break">${naBreak.map(([k, list]) => `<li><span>${U.esc(k)}</span><b>${list.length}</b></li>`).join('')}</ul>` : ''}
        </div>
      </div>

      ${groupTable('major', '大項目')}
      ${groupTable('assignee', '担当')}
    `;
  };

  /* ---------- 画面切替 ---------- */
  app.setView = function (v) {
    S.view = v;
    LS.set('view', v);
    U.$$('.tab').forEach((t) => {
      const on = t.dataset.view === v;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on);
    });
    U.$('#view-dashboard').hidden = v !== 'dashboard';
    U.$('#view-list').hidden = v !== 'list';
    document.body.classList.toggle('view-list', v === 'list');
    app.render();
    if (v === 'list' && !app.isMobile()) TR.grid.focus();
  };

  app.render = function () {
    if (!S.project) return;
    if (S.view === 'dashboard') app.renderDashboard();
    else app.renderList();
  };

  app.gotoList = function (filters) {
    S.filters = Object.assign(EMPTY_FILTERS(), filters);
    S.pinned.clear();
    app.setView('list');
  };

  /* ---------- 項目追加（スマホ／ダッシュボード） ---------- */
  app.addItem = function () {
    if (!app.isMobile() && S.view === 'list') { TR.grid.insertRows('below', 1); return; }
    const items = S.project.items;
    const it = TR.newItem(TR.nextNo(items));
    it.major = S.filters.major && S.filters.major !== '（未設定）' ? S.filters.major : (items.length ? items[items.length - 1].major : '');
    if (S.filters.assignee && S.filters.assignee !== '（未設定）') it.assignee = S.filters.assignee;
    app.mutate(() => items.push(it));
    app.pin(it);
    if (S.view !== 'list') app.setView('list'); else app.renderList();
    TR.detail.open(it.id, true);
  };

  app.deleteItem = async function (it) {
    if (!(await ui.confirm(`項目「${it.no} ${it.minor || ''}」を削除しますか？`, '削除', true))) return false;
    const items = S.project.items;
    app.mutate(() => items.splice(items.indexOf(it), 1));
    app.render();
    ui.toast('削除しました（Ctrl+Z で元に戻せます）');
    return true;
  };

  /* ---------- メニュー ---------- */
  const actions = {
    async 'project-new'() {
      const p = TR.newProject('新しいプロジェクト');
      if (!(await editProject(p, '新規プロジェクト'))) return;
      await TR.db.putProject(p);
      await app.reloadProjects(p.id);
      app.setView('list');
      ui.toast('プロジェクトを作成しました');
    },
    async 'project-edit'() {
      if (await editProject(S.project, 'プロジェクト情報の編集')) {
        await app.save(true);
        await refreshProjects();
        renderProjectSelect();
        app.render();
        ui.toast('保存しました');
      }
    },
    async 'project-delete'() {
      const p = S.project;
      if (!(await ui.confirm(`プロジェクト「${p.name}」を削除しますか？\n項目とエビデンスはすべて削除され、元に戻せません。\n（必要なら先に「プロジェクトを保存（.zip）」でバックアップしてください）`, '削除する', true))) return;
      S.project = null;
      await TR.db.deleteProject(p.id);
      await app.reloadProjects();
      ui.toast('削除しました');
    },
    async 'project-sample'() {
      const b = ui.busy('サンプルを作成中…');
      try {
        const p = await TR.createSampleProject();
        await app.reloadProjects(p.id);
      } finally { b.close(); }
      ui.toast('サンプルプロジェクトを作成しました');
    },
    'snippets': manageSnippets,
    async 'renumber'() { if (S.view !== 'list') app.setView('list'); await TR.grid.renumber(); app.render(); },
    'shortcuts': showShortcuts,
    'file-save': () => TR.exporter.saveProjectZip(S.project),
    async 'file-open'() {
      const [f] = await ui.pickFile('.zip,application/zip');
      if (f) await TR.exporter.loadProjectZip(f);
    },
    'import-excel': () => TR.importer.start(),
    'import-text': () => TR.textImport.start(),
    'out-pdf': () => TR.report.start(),
    'out-html': () => TR.viewer.start(S.project),
  };

  app.runAction = async function (name) {
    const fn = actions[name];
    if (!fn) return;
    try {
      await app.save(true);
      await fn();
    } catch (e) {
      console.error(e);
      ui.alert(e.message || String(e), 'エラー');
    }
  };

  function toggleMenu(open) {
    const menu = U.$('#menu');
    const btn = U.$('#menuBtn');
    const show = open == null ? menu.hidden : open;
    menu.hidden = !show;
    btn.setAttribute('aria-expanded', show);
  }

  /* ---------- イベント ---------- */
  function bind() {
    TR.grid.mount(U.$('#gridHost'));

    U.$('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    U.$('#menu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      toggleMenu(false);
      app.runAction(b.dataset.action);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) toggleMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggleMenu(false); closeQuick(); } });

    U.$('#projectSelect').addEventListener('change', (e) => app.selectProject(e.target.value));
    U.$$('.tab').forEach((t) => t.addEventListener('click', () => app.setView(t.dataset.view)));

    const onFilter = () => {
      S.filters.major = U.$('#fMajor').value;
      S.filters.result = U.$('#fResult').value;
      S.filters.assignee = U.$('#fAssignee').value;
      S.filters.q = U.$('#fQuery').value;
      S.filters.warn = U.$('#fWarn').checked;
      S.pinned.clear();
      app.renderList();
    };
    ['#fMajor', '#fResult', '#fAssignee', '#fWarn'].forEach((s) => U.$(s).addEventListener('change', onFilter));
    U.$('#fQuery').addEventListener('input', U.debounce(onFilter, 200));
    U.$('#fClear').addEventListener('click', () => { S.filters = EMPTY_FILTERS(); S.pinned.clear(); app.renderList(); });
    U.$('#addItemBtn').addEventListener('click', app.addItem);

    // 表のツールバー
    U.$('#gridTools').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    U.$('#gridTools').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.preset) return TR.grid.setPreset(b.dataset.preset);
      const t = b.dataset.tool;
      const G = TR.grid;
      if (t === 'add') G.insertRows('below');
      else if (t === 'dup') G.duplicateRows();
      else if (t === 'del') G.deleteRows();
      else if (t === 'bulk') G.bulkEdit();
      else if (t === 'undo') { app.undo(); G.focus(); }
      else if (t === 'redo') { app.redo(); G.focus(); }
      else if (t === 'detail') { const it = G.activeItem(); if (it) TR.detail.open(it.id); }
      else if (t === 'help') showShortcuts();
      else if (t === 'ai') TR.textImport.start();
      else if (t === 'reviewed') G.markReviewed();
    });

    // スマホ一覧のクリック
    const body = U.$('#itemsBody');
    body.addEventListener('click', (e) => {
      const q = e.target.closest('[data-quick]');
      if (q) {
        e.stopPropagation();
        const it = S.project.items.find((x) => x.id === q.dataset.quick);
        if (quickPop) closeQuick(); else openQuick(q, it);
        return;
      }
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const th = e.target.closest('img[data-thumb]');
      if (th) {
        const it = S.project.items.find((x) => x.id === tr.dataset.id);
        ui.lightbox(it.evidence.map((id, i) => ({ id, caption: `${it.no}  エビデンス${i + 1}` })), +th.dataset.evIdx);
        return;
      }
      TR.detail.open(tr.dataset.id);
    });

    // ダッシュボードのクリック
    U.$('#view-dashboard').addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.open) { app.gotoList({}); TR.detail.open(t.dataset.open); TR.grid.selectItem(t.dataset.open); }
      else if ('gotoResult' in t.dataset) app.gotoList({ result: t.dataset.gotoResult });
      else if ('gotoMajor' in t.dataset) app.gotoList({ major: t.dataset.gotoMajor });
      else if ('gotoAssignee' in t.dataset) app.gotoList({ assignee: t.dataset.gotoAssignee });
      else if ('gotoWarn' in t.dataset) app.gotoList({ warn: true });
    });

    // 画面幅が PC / スマホで切り替わったら描画し直す
    mq.addEventListener ? mq.addEventListener('change', () => app.render()) : mq.addListener(() => app.render());

    // 表以外にフォーカスがあるときの Ctrl+Z
    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || TR.grid.isActive()) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
      if (U.$('.modal-backdrop') || S.view !== 'list') return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); app.undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); app.redo(); }
    });
  }

  /* ---------- 起動 ---------- */
  async function init() {
    bind();
    try {
      await TR.db.open();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      S.view = LS.get('view') === 'list' ? 'list' : 'dashboard';
      await refreshProjects();
      const last = LS.get('lastProject');
      await app.reloadProjects(last);
      app.setView(S.view);
    } catch (e) {
      console.error(e);
      ui.alert('起動に失敗しました：' + (e.message || e) + '\n\nプライベートブラウズでは保存できない場合があります。', 'エラー');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.TR);
