/* アプリ本体：状態管理・ダッシュボード・一覧・メニュー */
(function (TR) {
  'use strict';
  const U = TR.util;
  const ui = TR.ui;

  const S = (TR.state = {
    projects: [],
    project: null,
    view: 'dashboard',
    filters: { major: '', result: '', assignee: '', q: '', warn: false },
  });

  const LS = {
    get(k) { try { return localStorage.getItem('tr.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('tr.' + k, v); } catch (e) { /* noop */ } },
  };

  const app = (TR.app = {});

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
    S.project = p;
    S.filters = { major: '', result: '', assignee: '', q: '', warn: false };
    LS.set('lastProject', id);
    TR.detail.close();
    renderProjectSelect();
    app.render();
  };

  app.reloadProjects = async function (selectId) {
    await refreshProjects();
    if (!S.projects.length) {
      const p = await TR.createSampleProject();
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

  /* ---------- フィルタ ---------- */
  app.filtered = function () {
    const f = S.filters;
    const q = f.q.trim().toLowerCase();
    return S.project.items.filter((it) => {
      if (f.major && (it.major || '（未設定）') !== f.major) return false;
      if (f.result && it.result !== f.result) return false;
      if (f.assignee && (it.assignee || '（未設定）') !== f.assignee) return false;
      if (f.warn && !app.isWarn(it)) return false;
      if (q) {
        const hay = TR.FIELDS.map((fd) => it[fd.key] || '').join('\n').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  };

  app.isWarn = (it) => it.result === 'OK' && !(it.evidence && it.evidence.length);

  function uniq(key) {
    const set = new Set(S.project.items.map((it) => it[key] || '（未設定）'));
    return Array.from(set);
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

  /* ---------- 一覧 ---------- */
  function rowHtml(it) {
    const ev = it.evidence || [];
    const warn = app.isWarn(it);
    const thumbs = ev.slice(0, 3).map((id, i) => `<img class="thumb" data-thumb="${U.esc(id)}" data-ev-idx="${i}" alt="エビデンス${i + 1}" loading="lazy">`).join('');
    const more = ev.length > 3 ? `<span class="more">+${ev.length - 3}</span>` : '';
    const sel = TR.detail.currentId() === it.id ? ' selected' : '';
    return `<tr data-id="${U.esc(it.id)}" class="${warn ? 'warn' : ''}${sel}" tabindex="0">
      <td class="c-no" data-label="ID">${U.esc(it.no)}</td>
      <td class="c-major" data-label="大項目">${U.esc(it.major)}</td>
      <td class="c-minor" data-label="小項目">${U.esc(it.minor)}</td>
      <td class="c-exp" data-label="期待結果"><div class="clamp">${U.esc(it.expected)}</div></td>
      <td class="c-res" data-label="判定"><button class="badge-btn" data-quick="${U.esc(it.id)}" title="クリックで判定を変更">${ui.badge(it.result)}</button></td>
      <td class="c-asg" data-label="担当">${U.esc(it.assignee)}</td>
      <td class="c-date" data-label="実施日">${U.esc(it.date)}</td>
      <td class="c-ev" data-label="エビデンス"><div class="thumbs">${thumbs}${more}${warn ? '<span class="warn-ic" title="OKなのにエビデンスがありません">⚠ 未添付</span>' : (!ev.length ? '<span class="muted">—</span>' : '')}</div></td>
    </tr>`;
  }

  app.renderList = function () {
    if (!S.project) return;
    renderFilters();
    const items = app.filtered();
    const body = U.$('#itemsBody');
    body.innerHTML = items.map(rowHtml).join('');
    TR.imgCache.hydrate(body);
    U.$('#listCount').textContent = `${items.length} / ${S.project.items.length} 件`;
    const empty = U.$('#listEmpty');
    if (!S.project.items.length) {
      empty.hidden = false;
      empty.innerHTML = '項目がありません。「＋ 項目を追加」または、メニューの「Excel 仕様書を取り込み」から始めてください。';
    } else if (!items.length) {
      empty.hidden = false;
      empty.textContent = '条件に一致する項目がありません。';
    } else empty.hidden = true;
  };

  /** 1行だけ差し替え（詳細パネル編集時） */
  app.updateRow = function (it) {
    const tr = U.$(`#itemsBody tr[data-id="${CSS.escape(it.id)}"]`);
    if (!tr) return;
    const tmp = document.createElement('tbody');
    tmp.innerHTML = rowHtml(it);
    const nr = tmp.firstElementChild;
    tr.replaceWith(nr);
    TR.imgCache.hydrate(nr);
  };

  /* ---------- 判定の素早い変更 ---------- */
  app.setResult = function (it, result) {
    if (it.result === result) return;
    it.result = result;
    if (result !== '未実施' && !it.date) it.date = U.today();
    it.updatedAt = new Date().toISOString();
    app.save();
  };

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
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      app.setResult(it, b.dataset.r);
      closeQuick();
      app.updateRow(it);
      TR.detail.refreshIf(it.id);
      ui.toast(`${it.no || '項目'} を「${it.result}」にしました`);
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
    const warnItems = p.items.filter(app.isWarn);
    const ngItems = p.items.filter((it) => it.result === 'NG');
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
          <div class="progress-nums"><strong>${TR.pct(s.progress)}</strong> <span class="muted">（実施済 ${s.done} / ${s.total} 件）</span>　OK率 <strong>${TR.pct(s.okRate)}</strong></div>
        </div>
        ${stackBar(s.counts, s.total)}
        <div class="legend">${TR.RESULTS.map((r) => `<span><i class="dot seg-${TR.RESULT_CLASS[r]}"></i>${r} ${s.counts[r] || 0}</span>`).join('')}</div>
      </div>

      <div class="grid2">
        <div class="card ${s.noEvidenceDone ? 'card-warn' : ''}">
          <h3>エビデンス未添付</h3>
          <div class="big-num">${s.noEvidenceDone}<small> 件</small></div>
          <p class="muted small">実施済（OK / NG / 保留）でエビデンスが1枚もない項目。未実施を含めると ${s.noEvidenceAll} 件。</p>
          ${s.okNoEvidence ? `<div class="alert">⚠ <strong>OKなのにエビデンスなし：${s.okNoEvidence} 件</strong>
            <ul class="item-links">${warnItems.slice(0, 8).map(itemLink).join('')}</ul>
            ${warnItems.length > 8 ? `<button class="link" data-goto-warn>…すべて表示</button>` : ''}</div>` : '<p class="ok-msg">✓ OK項目はすべてエビデンス添付済みです</p>'}
        </div>
        <div class="card">
          <h3>NG 項目</h3>
          <div class="big-num r-ng">${ngItems.length}<small> 件</small></div>
          ${ngItems.length ? `<ul class="item-links">${ngItems.slice(0, 10).map(itemLink).join('')}</ul>` : '<p class="muted">NG はありません</p>'}
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
    app.render();
  };

  app.render = function () {
    if (!S.project) return;
    if (S.view === 'dashboard') app.renderDashboard();
    else app.renderList();
  };

  app.gotoList = function (filters) {
    S.filters = Object.assign({ major: '', result: '', assignee: '', q: '', warn: false }, filters);
    app.setView('list');
  };

  /* ---------- 項目追加・削除 ---------- */
  app.addItem = function () {
    const items = S.project.items;
    const it = TR.newItem(TR.nextNo(items));
    // 絞り込み中の大項目・担当を引き継ぐ
    const cur = TR.detail.currentItem();
    it.major = S.filters.major && S.filters.major !== '（未設定）' ? S.filters.major : (cur ? cur.major : (items.length ? items[items.length - 1].major : ''));
    if (S.filters.assignee && S.filters.assignee !== '（未設定）') it.assignee = S.filters.assignee;
    const idx = cur ? items.indexOf(cur) + 1 : items.length;
    items.splice(idx, 0, it);
    app.save();
    if (S.view !== 'list') app.setView('list'); else app.renderList();
    TR.detail.open(it.id, true);
  };

  app.deleteItem = async function (it) {
    if (!(await ui.confirm(`項目「${it.no} ${it.minor || ''}」を削除しますか？\nエビデンス画像も削除されます。`, '削除', true))) return false;
    const items = S.project.items;
    items.splice(items.indexOf(it), 1);
    if (it.evidence && it.evidence.length) await TR.db.deleteImages(it.evidence);
    await app.save(true);
    app.render();
    ui.toast('削除しました');
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
      if (!(await ui.confirm(`プロジェクト「${p.name}」を削除しますか？\n項目とエビデンス画像はすべて削除され、元に戻せません。\n（必要なら先に「プロジェクトを保存（.zip）」でバックアップしてください）`, '削除する', true))) return;
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
    'file-save': () => TR.exporter.saveProjectZip(S.project),
    async 'file-open'() {
      const [f] = await ui.pickFile('.zip,application/zip');
      if (f) await TR.exporter.loadProjectZip(f);
    },
    'import-excel': () => TR.importer.start(),
    'out-pdf': () => TR.report.start(),
    'out-html': () => TR.viewer.exportHtml(S.project),
    'out-excel': () => TR.exporter.exportExcelZip(S.project),
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
      app.renderList();
    };
    ['#fMajor', '#fResult', '#fAssignee', '#fWarn'].forEach((s) => U.$(s).addEventListener('change', onFilter));
    U.$('#fQuery').addEventListener('input', U.debounce(onFilter, 200));
    U.$('#fClear').addEventListener('click', () => { S.filters = { major: '', result: '', assignee: '', q: '', warn: false }; app.renderList(); });
    U.$('#addItemBtn').addEventListener('click', app.addItem);

    // 一覧のクリック
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
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('tr[data-id]')) TR.detail.open(e.target.dataset.id);
    });

    // ダッシュボードのクリック
    U.$('#view-dashboard').addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.open) { app.gotoList({}); TR.detail.open(t.dataset.open); }
      else if ('gotoResult' in t.dataset) app.gotoList({ result: t.dataset.gotoResult });
      else if ('gotoMajor' in t.dataset) app.gotoList({ major: t.dataset.gotoMajor });
      else if ('gotoAssignee' in t.dataset) app.gotoList({ assignee: t.dataset.gotoAssignee });
      else if ('gotoWarn' in t.dataset) app.gotoList({ warn: true });
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
