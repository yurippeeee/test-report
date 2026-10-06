/* 製本用 PDF：印刷用レイアウトを生成し、ブラウザの印刷（PDF保存）で出力 */
(function (TR) {
  'use strict';
  const U = TR.util;
  const ui = TR.ui;

  const badge = (r) => ui.badge(r);

  function coverHtml(p, s, opts) {
    const m = p.meta || {};
    const row = (k, v) => v ? `<tr><th>${k}</th><td>${U.esc(v)}</td></tr>` : '';
    return `<section class="rp-page rp-cover">
      <div class="rp-cover-top">${U.esc(m.org || '')}</div>
      <div class="rp-cover-main">
        <div class="rp-cover-kind">評価仕様書 兼 報告書</div>
        <h1>${U.esc(p.name)}</h1>
        <table class="rp-cover-meta">
          ${row('対象システム', m.system)}
          ${row('バージョン', m.version)}
          ${row('実施期間', m.period)}
          ${row('作成者', m.author)}
          ${row('発行日', U.today().replace(/-/g, '/'))}
          ${row('対象項目数', `${s.total} 件${opts.filtered ? '（絞り込み結果）' : ''}`)}
        </table>
      </div>
      <table class="rp-stamp"><tr><th>承認</th><th>確認</th><th>作成</th></tr><tr><td></td><td></td><td></td></tr></table>
    </section>`;
  }

  function summaryHtml(p, items, s) {
    const m = p.meta || {};
    const bar = TR.RESULTS.map((r) => {
      const w = s.total ? (s.counts[r] || 0) / s.total * 100 : 0;
      return w ? `<span class="seg seg-${TR.RESULT_CLASS[r]}" style="width:${w}%"></span>` : '';
    }).join('');
    const groups = Array.from(TR.groupBy(items, 'major').entries()).map(([k, list]) => {
      const g = TR.summarize(list);
      return `<tr><th>${U.esc(k)}</th><td>${g.total}</td>${TR.RESULTS.map((r) => `<td>${g.counts[r] || 0}</td>`).join('')}<td>${TR.pct(g.progress)}</td></tr>`;
    }).join('');
    const ng = items.filter((it) => it.result === 'NG');
    const hold = items.filter((it) => it.result === '保留');
    const na = items.filter((it) => it.result === '対象外');
    const listOf = (arr) => arr.map((it) => `<tr><td class="nowrap">${U.esc(it.no)}</td><td>${U.esc(it.major)} › ${U.esc(it.minor)}</td><td>${U.escBr(it.actual || '')}</td><td>${U.escBr(it.note || '')}</td></tr>`).join('');
    return `<section class="rp-section rp-break">
      <h2>1. サマリ</h2>
      ${m.summary ? `<p class="rp-summary-text">${U.escBr(m.summary)}</p>` : ''}
      <div class="rp-kpis">
        <div><span>全項目</span><b>${s.total}</b></div>
        ${TR.RESULTS.map((r) => `<div class="k-${TR.RESULT_CLASS[r]}"><span>${r}</span><b>${s.counts[r] || 0}</b></div>`).join('')}
        <div><span>進捗率</span><b>${TR.pct(s.progress)}</b></div>
        <div><span>OK率</span><b>${TR.pct(s.okRate)}</b></div>
      </div>
      <div class="stack rp-stack">${bar}</div>
      <p class="rp-note">進捗率・OK率は対象外（${s.counts['対象外']} 件）を除く ${s.target} 件で算出。
        エビデンス未添付（実施済）：${s.noEvidenceDone} 件　／　OKなのにエビデンスなし：${s.okNoEvidence} 件</p>
      <h3>大項目別集計</h3>
      <table class="rp-table rp-center"><thead><tr><th>大項目</th><th>件数</th>${TR.RESULTS.map((r) => `<th>${r}</th>`).join('')}<th>進捗率</th></tr></thead><tbody>${groups}</tbody></table>
      ${ng.length ? `<h3>NG 項目</h3><table class="rp-table"><thead><tr><th>ID</th><th>項目</th><th>実績</th><th>備考</th></tr></thead><tbody>${listOf(ng)}</tbody></table>` : ''}
      ${hold.length ? `<h3>保留項目</h3><table class="rp-table"><thead><tr><th>ID</th><th>項目</th><th>実績</th><th>備考</th></tr></thead><tbody>${listOf(hold)}</tbody></table>` : ''}
      ${na.length ? `<h3>対象外項目（実施しない理由）</h3><table class="rp-table"><thead><tr><th>ID</th><th>項目</th><th>理由</th><th>備考</th></tr></thead><tbody>
        ${na.map((it) => `<tr><td class="nowrap">${U.esc(it.no)}</td><td>${U.esc(it.major)} › ${U.esc(it.minor)}</td><td>${U.esc(TR.naText(it)) || '<span class="rp-warn">理由未入力</span>'}</td><td>${U.escBr(it.note || '')}</td></tr>`).join('')}
        </tbody></table>` : ''}
    </section>`;
  }

  function listHtml(items) {
    return `<section class="rp-section rp-break">
      <h2>2. 評価項目一覧</h2>
      <table class="rp-table rp-list">
        <thead><tr><th>ID</th><th>大項目</th><th>小項目</th><th>期待結果</th><th>判定</th><th>担当</th><th>実施日</th><th>証跡</th></tr></thead>
        <tbody>${items.map((it) => `<tr>
          <td class="nowrap">${U.esc(it.no)}</td><td>${U.esc(it.major)}</td><td>${U.esc(it.minor)}</td>
          <td>${U.escBr(it.expected)}${it.result === '対象外' ? `<div class="rp-na">対象外：${U.esc(TR.naText(it))}</div>` : ''}</td>
          <td class="center">${badge(it.result)}</td>
          <td>${U.esc(it.assignee)}</td><td class="nowrap">${U.esc(it.date)}</td>
          <td class="center">${(it.evidence || []).length || (it.result === 'OK' ? '<span class="rp-warn">なし</span>' : '-')}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>`;
  }

  function evHtml(it, paths) {
    const ev = it.evidence || [];
    if (!ev.length) {
      if (it.result === '対象外') return '';
      return `<p class="rp-noev ${it.result === 'OK' ? 'rp-warn' : ''}">エビデンスなし</p>`;
    }
    const figs = ev.map((id, k) => {
      const p = paths.get(id) || { kind: 'image', path: '', name: '' };
      const m = TR.imgCache.meta(id) || {};
      if (p.kind === 'video') {
        const n = Math.max(1, m.frameCount || 0);
        return `<figure class="rp-ev rp-video">
          <div class="rp-frames">${Array.from({ length: n }, (_, i) => `<img data-frame="${U.esc(id)}:${i}" data-open="${U.esc(id)}" alt="">`).join('')}</div>
          <figcaption>エビデンス${k + 1}　<b>▶ 動画</b>${m.duration ? `（${U.fmtDuration(m.duration)}）` : ''}　<span class="rp-path">${U.esc(p.path)}</span>
            <span class="rp-hint">※ 静止画は動画から抜き出したもの。動画は閲覧用 HTML で再生できます。</span></figcaption>
        </figure>`;
      }
      if (p.kind === 'link') {
        return `<figure class="rp-ev rp-link"><figcaption>エビデンス${k + 1}　🔗 <b>${U.esc(p.name || '')}</b><br><span class="rp-path">${U.esc(p.url || '')}</span></figcaption></figure>`;
      }
      return `<figure class="rp-ev"><img data-full="${U.esc(id)}" data-open="${U.esc(id)}" alt=""><figcaption>エビデンス${k + 1}　<span class="rp-path">${U.esc(p.path)}</span></figcaption></figure>`;
    }).join('');
    return `<div class="rp-evs">${figs}</div>`;
  }

  function detailHtml(items, opts, paths) {
    const f = (label, v) => `<tr><th>${label}</th><td>${U.escBr(v || '')}</td></tr>`;
    return `<section class="rp-section rp-break">
      <h2>3. 評価項目詳細</h2>
      ${items.map((it, idx) => `
        <article class="rp-item ${opts.pageEach && idx > 0 ? 'rp-break' : ''}">
          <div class="rp-item-head">
            <span class="rp-item-no">${U.esc(it.no)}</span>
            <span class="rp-item-title">${U.esc(it.major)}${it.minor ? ' › ' + U.esc(it.minor) : ''}</span>
            ${badge(it.result)}
          </div>
          <table class="rp-table rp-kv">
            ${f('前提条件', it.precondition)}
            ${f('手順', it.steps)}
            ${f('期待結果', it.expected)}
            ${it.result === '対象外' ? `<tr><th>対象外の理由</th><td>${U.esc(TR.naText(it)) || '<span class="rp-warn">理由未入力</span>'}</td></tr>` : f('実績', it.actual)}
            <tr><th>担当 / 実施日</th><td>${U.esc(it.assignee || '-')} ／ ${U.esc(it.date || '-')}</td></tr>
            ${it.note ? f('備考', it.note) : ''}
          </table>
          ${evHtml(it, paths)}
        </article>`).join('')}
    </section>`;
  }

  async function build(opts) {
    const p = TR.state.project;
    const items = opts.filtered ? TR.app.filtered() : p.items;
    const s = TR.summarize(items);
    const b = ui.busy('報告書を作成中…');
    let paths;
    try { paths = await TR.evidencePaths(p); } finally { b.close(); }
    const root = U.$('#printRoot');
    root.innerHTML = `
      <div class="rp-toolbar no-print">
        <strong>製本用 PDF プレビュー</strong>
        <span class="muted small hide-sm">印刷ダイアログで「PDFに保存」を選びます（A4縦／余白：標準／背景のグラフィック：ON）</span>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-rp="print">🖨 印刷 / PDF保存</button>
        <button class="btn" data-rp="close">閉じる</button>
      </div>
      <div class="rp-doc">
        ${opts.cover ? coverHtml(p, s, opts) : ''}
        ${opts.summary ? summaryHtml(p, items, s) : ''}
        ${opts.list ? listHtml(items) : ''}
        ${opts.detail ? detailHtml(items, opts, paths) : ''}
      </div>`;
    let n = 0;
    U.$$('.rp-section > h2', root).forEach((h) => { n++; h.textContent = h.textContent.replace(/^\d+\./, n + '.'); });
    root.hidden = false;
    document.body.classList.add('report-mode');
    window.scrollTo(0, 0);
    TR.imgCache.hydrate(root);
  }

  function close() {
    const root = U.$('#printRoot');
    root.hidden = true;
    root.innerHTML = '';
    document.body.classList.remove('report-mode');
  }

  async function waitImages() {
    const imgs = U.$$('#printRoot img');
    await Promise.all(imgs.map((im) => new Promise((resolve) => {
      if (im.complete && im.getAttribute('src')) return resolve();
      const t = setTimeout(resolve, 8000);
      im.addEventListener('load', () => { clearTimeout(t); resolve(); }, { once: true });
      im.addEventListener('error', () => { clearTimeout(t); resolve(); }, { once: true });
    })));
  }

  async function doPrint() {
    const b = ui.busy('画像を準備中…');
    try { await waitImages(); } finally { b.close(); }
    window.print();
  }

  async function start() {
    const hasFilter = Object.values(TR.state.filters).some(Boolean);
    const v = await ui.modal({
      title: '製本用 PDF の作成',
      body: `
        <p class="muted small">印刷用のレイアウトを表示し、ブラウザの印刷機能で PDF に保存します。動画は数コマの静止画とファイル名で記載され、閲覧用 HTML の evidence フォルダと対応します。</p>
        ${TR.state.project.items.some(TR.isReview) ? `<div class="alert alert-ai">🤖 取り込み後に未確認の項目が ${TR.state.project.items.filter(TR.isReview).length} 件あります。内容を確認してから出力してください（一覧の「⚠ 要確認のみ」で絞り込めます）。</div>` : ''}
        <div class="chk-list">
          <label class="chk"><input type="checkbox" name="cover" checked> 表紙</label>
          <label class="chk"><input type="checkbox" name="summary" checked> サマリ（NG・保留・対象外の一覧を含む）</label>
          <label class="chk"><input type="checkbox" name="list" checked> 一覧</label>
          <label class="chk"><input type="checkbox" name="detail" checked> 各項目詳細（エビデンス付き）</label>
          <label class="chk"><input type="checkbox" name="pageEach"> 詳細は1項目ごとに改ページ</label>
          <label class="chk"><input type="checkbox" name="filtered" ${hasFilter ? '' : 'disabled'}> 一覧の現在の絞り込み結果のみ${hasFilter ? '' : '（絞り込みなし）'}</label>
        </div>`,
      buttons: [{ label: 'キャンセル', value: null }, { label: 'プレビューを表示', value: 'ok', cls: 'btn-primary' }],
      onButton(val, el) {
        if (val !== 'ok') return true;
        const o = {};
        U.$$('input[type=checkbox]', el).forEach((c) => { o[c.name] = c.checked; });
        start.opts = o;
        return true;
      },
    });
    if (v !== 'ok') return;
    await build(start.opts);
  }

  document.addEventListener('DOMContentLoaded', () => {
    U.$('#printRoot').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rp]');
      if (b) {
        if (b.dataset.rp === 'print') doPrint(); else close();
        return;
      }
      const img = e.target.closest('img[data-open]');
      if (img) {
        const ids = Array.from(new Set(U.$$('#printRoot img[data-open]').map((x) => x.dataset.open)));
        ui.lightbox(ids.map((id) => ({ id, caption: (TR.imgCache.meta(id) || {}).name || '' })), ids.indexOf(img.dataset.open));
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('report-mode') && !ui.lightboxOpen() && !U.$('.modal-backdrop')) close();
    });
  });

  TR.report = { start, build, close };
})(window.TR);
