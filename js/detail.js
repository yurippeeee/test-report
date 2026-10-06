/* 詳細パネル：項目の編集とエビデンス管理 */
(function (TR) {
  'use strict';
  const U = TR.util;
  const ui = TR.ui;

  let curId = null;
  const panel = () => U.$('#detail');

  const D = (TR.detail = {});

  D.currentId = () => curId;
  D.currentItem = () => (curId && TR.state.project ? TR.state.project.items.find((x) => x.id === curId) : null);
  D.isOpen = () => !panel().hidden;

  function item() { return D.currentItem(); }

  function fieldHtml(f, it) {
    if (f.key === 'result') return '';
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
    const cls = f.key === 'no' || f.key === 'assignee' || f.key === 'date' ? 'field half' : 'field';
    return `<label class="${cls}"><span>${f.label}</span>${input}</label>`;
  }

  function datalists() {
    const items = TR.state.project.items;
    return ['major', 'minor', 'assignee'].map((k) => {
      const vals = Array.from(new Set(items.map((x) => x[k]).filter(Boolean)));
      return `<datalist id="dl-${k}">${vals.map((v) => `<option value="${U.esc(v)}">`).join('')}</datalist>`;
    }).join('');
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
    const items = TR.app.filtered();
    const pos = items.findIndex((x) => x.id === it.id);
    const fields = TR.FIELDS;
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
        <div id="evWarn" class="alert" ${TR.app.isWarn(it) ? '' : 'hidden'}>⚠ 判定が OK ですがエビデンスが添付されていません。</div>

        <div class="result-seg" role="radiogroup" aria-label="判定">
          ${TR.RESULTS.map((r, i) => `<button type="button" role="radio" aria-checked="${it.result === r}" class="seg-btn r-${TR.RESULT_CLASS[r]} ${it.result === r ? 'on' : ''}" data-result="${r}" title="${r}（キー ${i + 1}）">${r}</button>`).join('')}
        </div>

        <form class="form-grid detail-form" autocomplete="off" onsubmit="return false">
          ${fields.map((f) => fieldHtml(f, it)).join('')}
        </form>
        ${datalists()}

        <section class="ev-section">
          <h3>エビデンス <span class="muted small">(${(it.evidence || []).length}枚)</span></h3>
          <div class="drop" id="dropZone" tabindex="0">
            <div class="drop-msg">
              <strong>Ctrl+V で貼り付け</strong> ／ ここへドラッグ＆ドロップ ／
              <button type="button" class="btn btn-sm" data-pick>ファイルを選択</button>
              <button type="button" class="btn btn-sm only-touch" data-camera>📷 撮影</button>
            </div>
          </div>
          <div class="ev-grid" id="evGrid">${evidenceHtml(it)}</div>
        </section>

        <div class="detail-foot">
          <span class="muted small">更新：${U.formatDateTime(it.updatedAt)}　自動保存されます</span>
          <button type="button" class="btn btn-danger btn-sm" data-delete>この項目を削除</button>
        </div>
      </div>`;
    TR.imgCache.hydrate(el);
    fillEvNames(el, it);
    U.$$('textarea[data-autosize]', el).forEach(autosize);
    if (focusFirst) {
      const f = U.$('[name="minor"]', el) || U.$('[name="no"]', el);
      setTimeout(() => f && f.focus(), 50);
    }
  }

  async function fillEvNames(el, it) {
    for (const id of it.evidence || []) {
      const info = await TR.imgCache.info(id);
      const span = U.$(`[data-ev-name="${CSS.escape(id)}"]`, el);
      if (span) { span.textContent = info.name || ''; span.title = info.name || ''; }
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
  }

  function refreshMeta(it) {
    const el = panel();
    U.$('#evWarn', el).hidden = !TR.app.isWarn(it);
    U.$$('[data-result]', el).forEach((b) => {
      const on = b.dataset.result === it.result;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on);
    });
    const d = U.$('[name="date"]', el);
    if (d && document.activeElement !== d) d.value = it.date || '';
    const t = U.$('.detail-title strong', el);
    if (t) t.textContent = it.no || '(IDなし)';
  }

  /* ---------- エビデンス追加 ---------- */
  D.addFiles = async function (files) {
    const it = item();
    if (!it) return;
    const imgs = files.filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name || ''));
    if (!imgs.length) { ui.toast('画像ファイルを指定してください', 'error'); return; }
    const pid = TR.state.project.id;
    let n = (it.evidence || []).length;
    for (const f of imgs) {
      n++;
      let name = f.name;
      if (!name || /^image\.(png|jpe?g)$/i.test(name)) {
        name = `${U.safeName(it.no || 'evidence')}_${U.pad(n)}_${U.nowStamp()}.${U.extFromType(f.type, name)}`;
      }
      const id = await TR.addImageBlob(pid, f, name);
      it.evidence = it.evidence || [];
      it.evidence.push(id);
    }
    if (it.result === '未実施') {
      // エビデンスがある＝実施した可能性が高いので日付だけ補完（判定は人が決める）
      if (!it.date) it.date = U.today();
    }
    touched(it);
    await TR.app.save(true);
    if (curId === it.id) render();
    ui.toast(`エビデンスを ${imgs.length} 枚追加しました`, 'success');
  };

  async function removeEvidence(it, id) {
    if (!(await ui.confirm('このエビデンス画像を削除しますか？', '削除', true))) return;
    it.evidence = it.evidence.filter((x) => x !== id);
    await TR.db.deleteImages([id]);
    touched(it);
    render();
  }

  /* ---------- 開閉 ---------- */
  D.open = function (id, focusFirst) {
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
    el.scrollTop = 0;
    const body = U.$('.detail-body', el);
    if (body) body.scrollTop = 0;
  };

  D.close = function () {
    curId = null;
    panel().hidden = true;
    U.$('#detailBackdrop').hidden = true;
    document.body.classList.remove('detail-open');
    U.$$('#itemsBody tr.selected').forEach((r) => r.classList.remove('selected'));
  };

  D.refreshIf = function (id) { if (curId === id) refreshMeta(item()); };

  function nav(d) {
    const items = TR.app.filtered();
    const pos = items.findIndex((x) => x.id === curId);
    const next = items[pos + d];
    if (next) D.open(next.id);
  }

  /* ---------- イベント ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const el = panel();

    U.$('#detailBackdrop').addEventListener('click', D.close);

    el.addEventListener('input', (e) => {
      const it = item();
      const t = e.target;
      if (!it || !t.name) return;
      it[t.name] = t.value;
      if (t.tagName === 'TEXTAREA') autosize(t);
      if (t.name === 'no') refreshMeta(it);
      touched(it);
    });

    el.addEventListener('click', async (e) => {
      const it = item();
      if (!it) return;
      const t = e.target.closest('button, img');
      if (!t) return;
      if (t.matches('[data-close]')) return D.close();
      if (t.dataset.nav) return nav(+t.dataset.nav);
      if (t.dataset.result) {
        TR.app.setResult(it, t.dataset.result);
        refreshMeta(it);
        TR.app.updateRow(it);
        return;
      }
      if (t.matches('[data-today]')) {
        it.date = U.today();
        U.$('[name="date"]', el).value = it.date;
        return touched(it);
      }
      if (t.matches('[data-pick]')) {
        const files = await ui.pickFile('image/*', true);
        if (files.length) D.addFiles(files);
        return;
      }
      if (t.matches('[data-camera]')) {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
        inp.onchange = () => inp.files.length && D.addFiles(Array.from(inp.files));
        inp.click();
        return;
      }
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
          [it.evidence[i], it.evidence[j]] = [it.evidence[j], it.evidence[i]];
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
      D.addFiles(Array.from(e.dataTransfer.files || []));
    });
    // パネル外へのドロップでブラウザが画像を開いてしまうのを防ぐ
    window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
    window.addEventListener('drop', (e) => { if (isFileDrag(e) && !el.contains(e.target)) e.preventDefault(); });

    // Ctrl+V 貼り付け（パネル表示中ならどこでも）
    document.addEventListener('paste', (e) => {
      if (!D.isOpen() || U.$('.modal-backdrop')) return;
      const files = [];
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const ci of items) {
        if (ci.kind === 'file' && /^image\//.test(ci.type)) {
          const f = ci.getAsFile();
          if (f) files.push(f);
        }
      }
      if (!files.length) return; // テキストは通常どおり貼り付け
      e.preventDefault();
      D.addFiles(files);
    });

    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
      if (!D.isOpen() || ui.lightboxOpen() || U.$('.modal-backdrop')) return;
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if (e.key === 'Escape') {
        if (inField) document.activeElement.blur(); else D.close();
        return;
      }
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); nav(e.key === 'ArrowDown' ? 1 : -1); return; }
      if (inField || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = ['1', '2', '3', '4'].indexOf(e.key);
      if (n >= 0) {
        const it = item();
        TR.app.setResult(it, TR.RESULTS[n]);
        refreshMeta(it);
        TR.app.updateRow(it);
      } else if (e.key === 'j') nav(1);
      else if (e.key === 'k') nav(-1);
    });
  });
})(window.TR);
