/* 詳細パネル：項目の編集とエビデンス（画像・動画・リンク）管理 */
(function (TR) {
  'use strict';
  const U = TR.util;
  const ui = TR.ui;

  const BIG_VIDEO = 100 * 1024 * 1024; // これを超える動画はリンク登録を推奨

  let curId = null;
  const panel = () => U.$('#detail');

  const D = (TR.detail = {});

  D.currentId = () => curId;
  D.currentItem = () => (curId && TR.state.project ? TR.state.project.items.find((x) => x.id === curId) : null);
  D.isOpen = () => !panel().hidden;

  function item() { return D.currentItem(); }

  const SNIP_FIELDS = ['precondition', 'steps', 'expected'];

  function fieldHtml(f, it) {
    if (f.key === 'result' || f.panel === false) return '';
    const v = it[f.key] || '';
    let input;
    if (f.multiline) {
      input = `<textarea name="${f.key}" rows="${f.key === 'steps' ? 4 : 2}" data-autosize>${U.esc(v)}</textarea>`;
    } else if (f.key === 'date') {
      input = `<div class="date-row"><input type="date" name="date" value="${U.esc(v)}"><button type="button" class="btn btn-sm btn-ghost" data-today>今日</button></div>`;
    } else {
      const list = (f.key === 'major' || f.key === 'assignee' || f.key === 'minor') ? ` list="dl-${f.key}"` : '';
      input = `<input name="${f.key}" value="${U.esc(v)}"${list} autocomplete="off">`;
    }
    let cls = f.key === 'no' || f.key === 'assignee' || f.key === 'date' ? 'field half' : 'field';
    if (it.aiFields && it.aiFields.includes(f.key)) cls += ' ai';
    const snip = SNIP_FIELDS.includes(f.key) ? `<button type="button" class="snip-btn" data-snip="${f.key}" title="共通手順・他の項目から挿入">📋</button>` : '';
    return `<label class="${cls}"><span>${f.label}${snip}</span>${input}</label>`;
  }

  function datalists() {
    const items = TR.state.project.items;
    return ['major', 'minor', 'assignee'].map((k) => {
      const vals = Array.from(new Set(items.map((x) => x[k]).filter(Boolean)));
      return `<datalist id="dl-${k}">${vals.map((v) => `<option value="${U.esc(v)}">`).join('')}</datalist>`;
    }).join('');
  }

  function naHtml(it) {
    return `<div class="na-box" ${it.result === '対象外' ? '' : 'hidden'}>
      <div class="na-head">対象外の理由 <span class="req">必須</span></div>
      <div class="na-reasons">${TR.NA_REASONS.map((r) => `<label class="chk"><input type="radio" name="naReason" value="${U.esc(r)}" ${it.naReason === r ? 'checked' : ''}> ${U.esc(r)}</label>`).join('')}</div>
      <label class="field"><span>補足</span><input name="naNote" value="${U.esc(it.naNote || '')}" placeholder="例：IE11 はサポート終了のため"></label>
      <label class="field na-ref" ${it.naReason === '他項目で確認済み' ? '' : 'hidden'}><span>確認済みの項目 ID</span><input name="naRef" value="${U.esc(it.naRef || '')}" placeholder="例：TC-012"></label>
    </div>`;
  }

  function evidenceHtml(it) {
    const ev = it.evidence || [];
    return ev.map((id, i) => `
      <figure class="ev" data-ev="${U.esc(id)}">
        <img data-thumb="${U.esc(id)}" alt="エビデンス${i + 1}" data-ev-open="${i}">
        <figcaption><span class="ev-name" data-ev-name="${U.esc(id)}"></span></figcaption>
        <div class="ev-tools">
          <button type="button" data-ev-move="-1" title="前へ" ${i === 0 ? 'disabled' : ''}>◀</button>
          <button type="button" data-ev-move="1" title="後ろへ" ${i === ev.length - 1 ? 'disabled' : ''}>▶</button>
          <button type="button" data-ev-del title="削除" class="del">🗑</button>
        </div>
      </figure>`).join('');
  }

  function render(focusFirst) {
    const it = item();
    const el = panel();
    if (!it) { D.close(); return; }
    const items = TR.app.viewItems();
    const pos = items.findIndex((x) => x.id === it.id);
    el.innerHTML = `
      <div class="detail-head">
        <div class="detail-title">
          <strong>${U.esc(it.no || '(IDなし)')}</strong>
          <span class="muted">${pos >= 0 ? `${pos + 1} / ${items.length}` : ''}</span>
        </div>
        <div class="detail-nav">
          <button class="icon-btn" data-nav="-1" title="前の項目 (Alt+↑)" ${pos <= 0 ? 'disabled' : ''}>▲</button>
          <button class="icon-btn" data-nav="1" title="次の項目 (Alt+↓)" ${pos < 0 || pos >= items.length - 1 ? 'disabled' : ''}>▼</button>
          <button class="icon-btn" data-close title="閉じる (Esc)">✕</button>
        </div>
      </div>
      <div class="detail-body">
        <div id="evWarn" class="alert" hidden></div>
        <div id="aiBanner" class="alert alert-ai" hidden>🤖 取り込んだ内容が未確認です（色付きの欄）。確認したら
          <button type="button" class="btn btn-sm" data-reviewed>✓ 確認済みにする</button></div>

        <div class="result-seg" role="radiogroup" aria-label="判定">
          ${TR.RESULTS.map((r, i) => `<button type="button" role="radio" aria-checked="${it.result === r}" class="seg-btn r-${TR.RESULT_CLASS[r]} ${it.result === r ? 'on' : ''}" data-result="${r}" title="${r}（キー ${i + 1}）">${r}</button>`).join('')}
        </div>
        ${naHtml(it)}

        <section class="ev-section">
          <h3>エビデンス <span class="muted small">(${(it.evidence || []).length}件)</span></h3>
          <div class="drop" id="dropZone" tabindex="0">
            <div class="drop-msg">
              <span class="hide-touch"><strong>Ctrl+V で貼り付け</strong> ／ ドラッグ＆ドロップ ／</span>
              <button type="button" class="btn btn-sm" data-pick>📁 ファイル</button>
              <button type="button" class="btn btn-sm only-touch" data-camera>📷 撮影</button>
              <button type="button" class="btn btn-sm" data-link title="共有ドライブなどに置いた大きな動画">🔗 リンク</button>
            </div>
            <div class="drop-note muted small">画像・動画（MP4 推奨）。100MB を超える動画は共有ドライブに置いて「リンク」で登録してください。</div>
          </div>
          <div class="ev-grid" id="evGrid">${evidenceHtml(it)}</div>
        </section>

        <form class="form-grid detail-form" autocomplete="off">
          ${TR.FIELDS.map((f) => fieldHtml(f, it)).join('')}
        </form>
        ${datalists()}

        <div class="detail-foot">
          <span class="muted small">更新：${U.formatDateTime(it.updatedAt)}　自動保存されます</span>
          <button type="button" class="btn btn-danger btn-sm" data-delete>この項目を削除</button>
        </div>
      </div>`;
    TR.imgCache.hydrate(el);
    fillEvNames(el, it);
    U.$$('textarea[data-autosize]', el).forEach(autosize);
    refreshMeta(it);
    if (focusFirst) {
      const f = U.$('[name="minor"]', el) || U.$('[name="no"]', el);
      setTimeout(() => f && f.focus(), 50);
    }
  }

  async function fillEvNames(el, it) {
    for (const id of it.evidence || []) {
      const info = await TR.imgCache.info(id);
      const span = U.$(`[data-ev-name="${CSS.escape(id)}"]`, el);
      if (!span) continue;
      let label = info.name || '';
      if (info.kind === 'video') label = `🎬 ${label}${info.duration ? `（${U.fmtDuration(info.duration)}）` : ''}`;
      if (info.kind === 'link') label = `🔗 ${label}`;
      span.textContent = label;
      span.title = info.kind === 'link' ? info.url : label;
    }
  }

  function autosize(t) {
    t.style.height = 'auto';
    t.style.height = Math.min(400, t.scrollHeight + 2) + 'px';
  }

  function touched(it) {
    it.updatedAt = new Date().toISOString();
    TR.app.save();
    TR.app.updateRow(it);
    TR.app.afterChange();
  }

  function refreshMeta(it) {
    const el = panel();
    if (!it || el.hidden) return;
    const w = TR.warnOf(it);
    const warn = U.$('#evWarn', el);
    warn.hidden = !w;
    warn.textContent = w ? `⚠ ${w}` : '';
    U.$('#aiBanner', el).hidden = !TR.isReview(it);
    U.$$('[data-result]', el).forEach((b) => {
      const on = b.dataset.result === it.result;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on);
    });
    const na = U.$('.na-box', el);
    if (na) {
      na.hidden = it.result !== '対象外';
      U.$$('input[name=naReason]', na).forEach((r) => { r.checked = r.value === it.naReason; });
      U.$('.na-ref', na).hidden = it.naReason !== '他項目で確認済み';
      const note = U.$('[name=naNote]', na);
      if (document.activeElement !== note) note.value = it.naNote || '';
    }
    const d = U.$('[name="date"]', el);
    if (d && document.activeElement !== d) d.value = it.date || '';
    const t = U.$('.detail-title strong', el);
    if (t) t.textContent = it.no || '(IDなし)';
  }
  D.refreshMeta = () => refreshMeta(item());
  D.rerender = () => { if (D.isOpen() && item()) render(); };

  /* ---------- エビデンス追加 ---------- */
  D.addFilesTo = async function (it, files) {
    if (!it) return;
    const list = files.filter((f) => U.isImage(f.type, f.name) || U.isVideo(f.type, f.name));
    if (!list.length) { ui.toast('画像または動画ファイルを指定してください', 'error'); return; }
    const big = list.filter((f) => U.isVideo(f.type, f.name) && f.size > BIG_VIDEO);
    if (big.length && !(await ui.confirm(`${big.map((f) => `${f.name}（${U.fmtSize(f.size)}）`).join('\n')}\n\nサイズが大きい動画です。ブラウザの容量や受け渡しの ZIP が重くなるため、共有ドライブ等に置いて「🔗 リンク」で登録するのがおすすめです。\nこのまま追加しますか？`, '追加する'))) return;
    const pid = TR.state.project.id;
    const b = ui.busy('エビデンスを追加中…');
    const ids = [];
    try {
      let n = (it.evidence || []).length;
      for (const f of list) {
        n++;
        b.update(`エビデンスを追加中… ${ids.length + 1} / ${list.length}${U.isVideo(f.type, f.name) ? '（動画を解析中）' : ''}`);
        let name = f.name;
        if (!name || /^image\.(png|jpe?g)$/i.test(name)) {
          name = `${U.safeName(it.no || 'evidence')}_${U.pad(n)}_${U.nowStamp()}.${U.extFromType(f.type, name)}`;
        }
        ids.push(await TR.addEvidenceFile(pid, f, name));
      }
    } catch (e) {
      console.error(e);
      ui.alert('保存できませんでした：' + (e.message || e) + '\nブラウザの保存容量が不足している可能性があります。', 'エラー');
    } finally { b.close(); }
    if (!ids.length) return;
    TR.app.mutate(() => {
      it.evidence = (it.evidence || []).concat(ids);
      if (!it.date && it.result !== '対象外') it.date = U.today();
    });
    touched(it);
    if (curId === it.id) render();
    const vids = list.filter((f) => U.isVideo(f.type, f.name)).length;
    ui.toast(`エビデンスを ${ids.length} 件追加しました${vids ? `（うち動画 ${vids} 件）` : ''}`, 'success');
  };
  D.addFiles = (files) => D.addFilesTo(item(), files);

  async function addLink(it) {
    let out = null;
    const v = await ui.modal({
      title: 'リンクをエビデンスに追加',
      body: `<p class="muted small">大きな動画などを共有ドライブ（SharePoint / Google ドライブ等）に置き、その URL を登録します。報告書には URL が記載されます。</p>
        <label class="field"><span>URL</span><input name="url" type="url" placeholder="https://..."></label>
        <label class="field"><span>表示名</span><input name="title" placeholder="例：LED 点滅確認（30秒）"></label>`,
      buttons: [{ label: 'キャンセル', value: null }, { label: '追加', value: 'ok', cls: 'btn-primary' }],
      onButton(val, el) {
        if (val !== 'ok') return true;
        const url = U.$('[name=url]', el).value.trim();
        if (!url) { ui.toast('URL を入力してください', 'error'); return false; }
        if (!U.safeUrl(url)) { ui.toast('http:// または https:// で始まる URL を入力してください', 'error'); return false; }
        out = { url, title: U.$('[name=title]', el).value.trim() };
        return true;
      },
    });
    if (v !== 'ok') return;
    const id = await TR.addEvidenceLink(TR.state.project.id, out.url, out.title);
    TR.app.mutate(() => { it.evidence = (it.evidence || []).concat(id); });
    touched(it);
    render();
  }

  async function removeEvidence(it, id) {
    TR.app.mutate(() => { it.evidence = it.evidence.filter((x) => x !== id); });
    touched(it);
    render();
    ui.toast('エビデンスを外しました（Ctrl+Z で元に戻せます）');
  }

  /** 共通手順・他項目からの挿入 */
  async function pickSnippet(it, key) {
    const p = TR.state.project;
    const label = (TR.FIELDS.find((f) => f.key === key) || {}).label;
    const cands = [];
    (p.snippets || []).forEach((s) => cands.push({ group: '共通手順', title: s.title, text: s.text }));
    const seen = new Set();
    p.items.forEach((x) => {
      if (x === it || !x[key] || seen.has(x[key])) return;
      seen.add(x[key]);
      cands.push({ group: `他の項目の${label}`, title: `${x.no} ${x.minor || ''}`, text: x[key] });
    });
    if (!cands.length) { ui.toast('挿入できる候補がありません（メニュー「共通手順の管理」で登録できます）'); return; }
    let chosen = null;
    const v = await ui.modal({
      title: `${label}に挿入`,
      wide: true,
      body: `<input class="snip-q" type="search" placeholder="絞り込み">
        <div class="snip-pick">${cands.map((c, i) => `<button class="snip-cand" data-i="${i}"><span class="snip-g">${U.esc(c.group)}</span><b>${U.esc(c.title)}</b><span class="pre">${U.esc(c.text)}</span></button>`).join('')}</div>`,
      buttons: [{ label: 'キャンセル', value: null }],
      onOpen(el, close) {
        U.$('.snip-q', el).addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase();
          U.$$('.snip-cand', el).forEach((b) => { b.hidden = q && !b.textContent.toLowerCase().includes(q); });
        });
        el.addEventListener('click', (e) => {
          const b = e.target.closest('.snip-cand');
          if (b) { chosen = cands[+b.dataset.i]; close('ok'); }
        });
      },
    });
    if (v !== 'ok' || !chosen) return;
    const ta = U.$(`[name="${key}"]`, panel());
    TR.app.mutate(() => {
      const cur = it[key] || '';
      it[key] = cur.trim() ? cur.replace(/\n*$/, '') + '\n' + chosen.text : chosen.text;
    });
    if (ta) { ta.value = it[key]; autosize(ta); }
    touched(it);
  }

  /* ---------- 開閉 ---------- */
  D.open = function (id, focusFirst, keepFocus) {
    curId = id;
    const el = panel();
    el.hidden = false;
    U.$('#detailBackdrop').hidden = false;
    document.body.classList.add('detail-open');
    render(focusFirst);
    U.$$('#itemsBody tr.selected').forEach((r) => r.classList.remove('selected'));
    const tr = U.$(`#itemsBody tr[data-id="${CSS.escape(id)}"]`);
    if (tr) {
      tr.classList.add('selected');
      tr.scrollIntoView({ block: 'nearest' });
    }
    if (!keepFocus && !TR.app.isMobile()) TR.grid.selectItem(id);
    const body = U.$('.detail-body', el);
    if (body) body.scrollTop = 0;
    if (keepFocus) TR.grid.focus();
  };

  D.close = function () {
    const was = D.isOpen();
    curId = null;
    panel().hidden = true;
    U.$('#detailBackdrop').hidden = true;
    document.body.classList.remove('detail-open');
    U.$$('#itemsBody tr.selected').forEach((r) => r.classList.remove('selected'));
    if (was && TR.state.view === 'list' && !TR.app.isMobile()) TR.grid.focus();
  };

  D.refreshIf = function (id) { if (curId === id) refreshMeta(item()); };

  function nav(d) {
    const items = TR.app.viewItems();
    const pos = items.findIndex((x) => x.id === curId);
    const next = items[pos + d];
    if (next) D.open(next.id);
  }

  async function setResult(it, r) {
    if (r === '対象外') {
      // パネル内で理由を入力してもらう
      TR.app.mutate(() => TR.app.setField(it, 'result', r));
      touched(it);
      refreshMeta(it);
      const first = U.$('.na-box input[name=naReason]', panel());
      if (first && !it.naReason) first.focus();
      return;
    }
    TR.app.mutate(() => TR.app.setField(it, 'result', r));
    touched(it);
    refreshMeta(it);
  }

  /* ---------- イベント ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const el = panel();

    U.$('#detailBackdrop').addEventListener('click', D.close);
    el.addEventListener('submit', (e) => e.preventDefault());

    // 入力の開始ごとに「元に戻す」用の履歴を1つ残す
    el.addEventListener('focusin', (e) => {
      if (e.target.matches('input[name], textarea[name]') && e.target.name !== 'naReason') TR.history.save();
    });

    el.addEventListener('input', (e) => {
      const it = item();
      const t = e.target;
      if (!it || !t.name || t.name === 'naReason') return;
      if (t.name === 'date') it.date = t.value;
      else it[t.name] = t.value;
      if (TR.isReview(it) && it.aiFields.includes(t.name)) {
        TR.touchField(it, t.name);
        const lab = t.closest('.field');
        if (lab) lab.classList.remove('ai');
        refreshMeta(it);
      }
      if (t.tagName === 'TEXTAREA') autosize(t);
      if (t.name === 'no' || t.name === 'naNote') refreshMeta(it);
      touched(it);
    });

    el.addEventListener('change', (e) => {
      const it = item();
      if (!it || e.target.name !== 'naReason') return;
      TR.app.mutate(() => {
        it.naReason = e.target.value;
        if (it.naReason !== '他項目で確認済み') it.naRef = '';
      });
      refreshMeta(it);
      touched(it);
      if (it.naReason === '他項目で確認済み') U.$('[name=naRef]', el).focus();
    });

    el.addEventListener('click', async (e) => {
      const it = item();
      if (!it) return;
      const t = e.target.closest('button, img');
      if (!t) return;
      if (t.matches('[data-close]')) return D.close();
      if (t.matches('[data-reviewed]')) {
        TR.app.mutate(() => { it.aiFields = []; });
        touched(it);
        render();
        return;
      }
      if (t.dataset.nav) return nav(+t.dataset.nav);
      if (t.dataset.result) return setResult(it, t.dataset.result);
      if (t.dataset.snip) { e.preventDefault(); return pickSnippet(it, t.dataset.snip); }
      if (t.matches('[data-today]')) {
        TR.app.mutate(() => { it.date = U.today(); });
        U.$('[name="date"]', el).value = it.date;
        return touched(it);
      }
      if (t.matches('[data-pick]')) {
        const files = await ui.pickFile('image/*,video/*', true);
        if (files.length) D.addFilesTo(it, files);
        return;
      }
      if (t.matches('[data-camera]')) {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*,video/*'; inp.capture = 'environment';
        inp.onchange = () => inp.files.length && D.addFilesTo(it, Array.from(inp.files));
        inp.click();
        return;
      }
      if (t.matches('[data-link]')) return addLink(it);
      if (t.matches('[data-delete]')) {
        if (await TR.app.deleteItem(it)) D.close();
        return;
      }
      const fig = t.closest('[data-ev]');
      if (fig) {
        const id = fig.dataset.ev;
        if (t.dataset.evOpen != null) {
          ui.lightbox(it.evidence.map((x, i) => ({ id: x, caption: `${it.no}  エビデンス${i + 1}  ${(TR.imgCache.meta(x) || {}).name || ''}` })), +t.dataset.evOpen);
        } else if (t.matches('[data-ev-del]')) {
          removeEvidence(it, id);
        } else if (t.dataset.evMove) {
          const i = it.evidence.indexOf(id);
          const j = i + +t.dataset.evMove;
          if (j < 0 || j >= it.evidence.length) return;
          TR.app.mutate(() => { [it.evidence[i], it.evidence[j]] = [it.evidence[j], it.evidence[i]]; });
          touched(it);
          render();
        }
      }
    });

    // ドラッグ＆ドロップ（パネル全体で受け付け）
    let dragDepth = 0;
    const isFileDrag = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    el.addEventListener('dragenter', (e) => { if (!isFileDrag(e)) return; e.preventDefault(); dragDepth++; el.classList.add('dragging'); });
    el.addEventListener('dragover', (e) => { if (!isFileDrag(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    el.addEventListener('dragleave', (e) => { if (!isFileDrag(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) el.classList.remove('dragging'); });
    el.addEventListener('drop', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepth = 0;
      el.classList.remove('dragging');
      D.addFilesTo(item(), Array.from(e.dataTransfer.files || []));
    });
    // パネル外へのドロップでブラウザがファイルを開いてしまうのを防ぐ
    window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
    window.addEventListener('drop', (e) => { if (isFileDrag(e) && !el.contains(e.target)) e.preventDefault(); });

    // Ctrl+V 貼り付け（パネル表示中ならどこでも。表にフォーカスがあるときは表側で処理）
    document.addEventListener('paste', (e) => {
      if (!D.isOpen() || U.$('.modal-backdrop')) return;
      const files = [];
      for (const ci of (e.clipboardData && e.clipboardData.items) || []) {
        if (ci.kind === 'file') { const f = ci.getAsFile(); if (f) files.push(f); }
      }
      if (!files.length) return; // テキストは通常どおり貼り付け
      e.preventDefault();
      D.addFilesTo(item(), files);
    });

    // キーボードショートカット（パネル内にフォーカスがあるとき）
    document.addEventListener('keydown', (e) => {
      if (!D.isOpen() || ui.lightboxOpen() || U.$('.modal-backdrop')) return;
      if (TR.grid.isActive()) return; // 表の操作を優先
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if (e.key === 'Escape') {
        if (inField) document.activeElement.blur(); else D.close();
        return;
      }
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); nav(e.key === 'ArrowDown' ? 1 : -1); return; }
      if (inField || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (n >= 0) setResult(item(), TR.RESULTS[n]);
      else if (e.key === 'j') nav(1);
      else if (e.key === 'k') nav(-1);
    });
  });
})(window.TR);
