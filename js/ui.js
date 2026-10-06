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

  async function lbShow() {
    const it = lb.list[lb.idx];
    const img = U.$('#lbImg');
    img.removeAttribute('src');
    img.src = it.src || (await TR.imgCache.full(it.id));
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
  function lbClose() { U.$('#lightbox').hidden = true; }

  document.addEventListener('DOMContentLoaded', () => {
    const box = U.$('#lightbox');
    box.addEventListener('click', (e) => {
      const a = e.target.closest('[data-lb]');
      if (a) { e.stopPropagation(); if (a.dataset.lb === 'close') lbClose(); else lbMove(a.dataset.lb === 'next' ? 1 : -1); return; }
      if (e.target.id !== 'lbImg') lbClose();
    });
    U.$('#lbImg').addEventListener('click', () => U.$('#lbImg').classList.toggle('zoom'));
    document.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'Escape') { e.stopPropagation(); lbClose(); }
      else if (e.key === 'ArrowRight') lbMove(1);
      else if (e.key === 'ArrowLeft') lbMove(-1);
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
