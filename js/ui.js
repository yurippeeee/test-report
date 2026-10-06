/* 汎用 UI 部品：トースト / モーダル / ライトボックス */
(function (TR) {
  'use strict';
  const U = TR.util;
  const ui = (TR.ui = {});

  /* ---------- トースト ---------- */
  let toastTimer;
  ui.toast = function (msg, type = 'info', ms = 2800) {
    const el = U.$('#toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, ms);
  };

  /* ---------- モーダル ---------- */
  /**
   * @param {object} o
   *  title, body(HTML), buttons:[{label,value,cls}], wide,
   *  onOpen(el), onButton(value, el) → false を返すと閉じない
   * @returns Promise<value|null>
   */
  ui.modal = function (o) {
    return new Promise((resolve) => {
      const root = U.$('#modalRoot');
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      const buttons = o.buttons || [{ label: 'OK', value: true, cls: 'btn-primary' }];
      wrap.innerHTML = `
        <div class="modal ${o.wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${U.esc(o.title || '')}">
          <div class="modal-head"><h2>${U.esc(o.title || '')}</h2><button class="icon-btn" data-close aria-label="閉じる">✕</button></div>
          <div class="modal-body">${o.body || ''}</div>
          <div class="modal-foot">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-btn="${i}">${U.esc(b.label)}</button>`).join('')}</div>
        </div>`;
      root.appendChild(wrap);
      const prevFocus = document.activeElement;
      const close = (val) => {
        wrap.remove();
        document.removeEventListener('keydown', onKey, true);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape' && U.$('#modalRoot').lastElementChild === wrap) { e.stopPropagation(); close(null); }
      };
      document.addEventListener('keydown', onKey, true);
      wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) wrap.dataset.downOutside = '1'; else delete wrap.dataset.downOutside; });
      wrap.addEventListener('click', async (e) => {
        if (e.target === wrap && wrap.dataset.downOutside && !o.sticky) return close(null);
        if (e.target.closest('[data-close]')) return close(null);
        const b = e.target.closest('[data-btn]');
        if (b) {
          const btn = buttons[+b.dataset.btn];
          if (o.onButton) {
            const r = await o.onButton(btn.value, wrap);
            if (r === false) return;
          }
          close(btn.value);
        }
      });
      if (o.onOpen) o.onOpen(wrap, close);
      const first = U.$('input,select,textarea', wrap) || U.$('.modal-foot .btn-primary', wrap);
      if (first) setTimeout(() => first.focus(), 30);
    });
  };

  ui.confirm = function (msg, okLabel = 'OK', danger = false) {
    return ui.modal({
      title: '確認',
      body: `<p class="pre">${U.esc(msg)}</p>`,
      buttons: [{ label: 'キャンセル', value: false }, { label: okLabel, value: true, cls: danger ? 'btn-danger' : 'btn-primary' }],
    }).then((v) => !!v);
  };

  ui.alert = function (msg, title = 'お知らせ') {
    return ui.modal({ title, body: `<p class="pre">${U.esc(msg)}</p>` });
  };

  /** 処理中表示 */
  ui.busy = function (msg) {
    const el = document.createElement('div');
    el.className = 'busy';
    el.innerHTML = `<div class="busy-box"><div class="spinner"></div><div class="busy-msg">${U.esc(msg)}</div></div>`;
    document.body.appendChild(el);
    return {
      update(m) { U.$('.busy-msg', el).textContent = m; },
      close() { el.remove(); },
    };
  };

  /* ---------- ライトボックス ---------- */
  const lb = { list: [], idx: 0 };

  function lbStopVideo() {
    const vid = U.$('#lbVideo');
    try { vid.pause(); } catch (e) { /* noop */ }
    vid.removeAttribute('src');
    try { vid.load(); } catch (e) { /* noop */ }
  }

  async function lbShow() {
    const it = lb.list[lb.idx];
    const img = U.$('#lbImg'), vid = U.$('#lbVideo'), link = U.$('#lbLink');
    lbStopVideo();
    img.removeAttribute('src');
    img.classList.remove('zoom');
    img.hidden = vid.hidden = link.hidden = true;
    const m = it.id ? await TR.imgCache.info(it.id) : { kind: it.kind || 'image', name: it.caption, url: it.url };
    if (m.kind === 'video') {
      vid.hidden = false;
      vid.src = it.src || (await TR.imgCache.full(it.id));
      vid.play().catch(() => {});
    } else if (m.kind === 'link') {
      link.hidden = false;
      link.innerHTML = `<div class="lb-link-ic">🔗</div><div class="lb-link-title">${U.esc(m.name || '')}</div>
        <div class="lb-link-url">${U.esc(m.url || '')}</div>
        <a class="btn btn-primary" href="${U.esc(m.url || '#')}" target="_blank" rel="noopener">リンク先を開く</a>`;
    } else {
      img.hidden = false;
      img.src = it.src || (await TR.imgCache.full(it.id));
    }
    U.$('#lbCaption').textContent = `${it.caption || ''}  (${lb.idx + 1} / ${lb.list.length})`;
    const multi = lb.list.length > 1;
    U.$('.lb-prev').hidden = !multi;
    U.$('.lb-next').hidden = !multi;
  }

  ui.lightbox = function (list, index = 0) {
    if (!list.length) return;
    lb.list = list;
    lb.idx = index;
    U.$('#lightbox').hidden = false;
    lbShow();
  };
  ui.lightboxOpen = () => !U.$('#lightbox').hidden;

  function lbMove(d) {
    lb.idx = (lb.idx + d + lb.list.length) % lb.list.length;
    lbShow();
  }
  function lbClose() { lbStopVideo(); U.$('#lightbox').hidden = true; }

  document.addEventListener('DOMContentLoaded', () => {
    const box = U.$('#lightbox');
    box.addEventListener('click', (e) => {
      const a = e.target.closest('[data-lb]');
      if (a) { e.stopPropagation(); if (a.dataset.lb === 'close') lbClose(); else lbMove(a.dataset.lb === 'next' ? 1 : -1); return; }
      if (e.target.closest('#lbImg, #lbVideo, #lbLink')) return;
      lbClose();
    });
    U.$('#lbImg').addEventListener('click', () => U.$('#lbImg').classList.toggle('zoom'));
    document.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'Escape') { e.stopPropagation(); lbClose(); }
      else if (e.key === 'ArrowRight' && document.activeElement !== U.$('#lbVideo')) lbMove(1);
      else if (e.key === 'ArrowLeft' && document.activeElement !== U.$('#lbVideo')) lbMove(-1);
    }, true);
    // スワイプ
    let sx = null;
    box.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', (e) => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50 && lb.list.length > 1) lbMove(dx < 0 ? 1 : -1);
      sx = null;
    });
  });

  /* ---------- 判定バッジ ---------- */
  ui.badge = function (result, extra = '') {
    const r = TR.RESULTS.includes(result) ? result : '未実施';
    return `<span class="badge b-${TR.RESULT_CLASS[r]} ${extra}">${U.esc(r)}</span>`;
  };

  /** 対象外の理由を入力（キャンセル時 null） */
  ui.askNaReason = function (cur = {}, count = 1) {
    let out = null;
    return ui.modal({
      title: count > 1 ? `対象外の理由（${count} 件に設定）` : '対象外の理由',
      body: `
        <p class="muted small">実施しない理由を選んでください（報告書に記載されます）。</p>
        <div class="na-reasons">${TR.NA_REASONS.map((r, i) => `<label class="chk"><input type="radio" name="naReason" value="${U.esc(r)}" ${cur.naReason === r || (!cur.naReason && i === 0) ? 'checked' : ''}> ${U.esc(r)}</label>`).join('')}</div>
        <label class="field"><span>補足（任意）</span><input name="naNote" value="${U.esc(cur.naNote || '')}" placeholder="例：IE11 はサポート終了のため"></label>
        <label class="field na-ref"><span>確認済みの項目 ID</span><input name="naRef" value="${U.esc(cur.naRef || '')}" placeholder="例：TC-012"></label>`,
      buttons: [{ label: 'キャンセル', value: null }, { label: '設定', value: 'ok', cls: 'btn-primary' }],
      onOpen(el) {
        const sync = () => { U.$('.na-ref', el).hidden = U.$('input[name=naReason]:checked', el).value !== '他項目で確認済み'; };
        el.addEventListener('change', sync);
        sync();
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.isComposing && e.target.tagName === 'INPUT') { e.preventDefault(); U.$('.modal-foot .btn-primary', el).click(); }
        });
      },
      onButton(v, el) {
        if (v !== 'ok') return true;
        const r = U.$('input[name=naReason]:checked', el).value;
        out = { naReason: r, naNote: U.$('[name=naNote]', el).value.trim(), naRef: r === '他項目で確認済み' ? U.$('[name=naRef]', el).value.trim() : '' };
        return true;
      },
    }).then((v) => (v === 'ok' ? out : null));
  };

  /** ファイル選択ダイアログ */
  ui.pickFile = function (accept, multiple = false) {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = accept;
      inp.multiple = multiple;
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', () => { resolve(Array.from(inp.files || [])); inp.remove(); });
      inp.click();
    });
  };
})(window.TR);
