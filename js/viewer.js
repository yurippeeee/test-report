/* 閲覧用 HTML の出力
 *  - 納品パッケージ（ZIP）：HTML ＋ evidence フォルダ。動画もその場で再生できる
 *  - 単体 HTML：画像を埋め込んだ 1 ファイル（動画は静止画のみ）
 */
(function (TR) {
  'use strict';
  const U = TR.util;
  const ui = TR.ui;

  const VIEWER_CSS = `
:root{--bg:#f6f7f9;--fg:#1f2937;--muted:#6b7280;--line:#e5e7eb;--card:#fff;--pri:#1e3a8a;--ok:#15803d;--ng:#b91c1c;--hold:#b45309;--todo:#6b7280;--na:#475569}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 "Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI","Yu Gothic",Meiryo,sans-serif}
header{background:var(--pri);color:#fff;padding:16px 20px}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;opacity:.85;font-size:13px}
main{max-width:1400px;margin:0 auto;padding:16px}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
.stat{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:8px 14px;cursor:pointer;min-width:84px;text-align:left;font:inherit;color:inherit}
.stat b{display:block;font-size:22px}.stat.on{outline:2px solid var(--pri)}
.stat.ok b{color:var(--ok)}.stat.ng b{color:var(--ng)}.stat.hold b{color:var(--hold)}.stat.todo b{color:var(--todo)}.stat.na b{color:var(--na)}
.prog{font-size:13px;color:var(--muted)}.prog b{color:var(--fg);font-size:16px}
.bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:#e5e7eb;margin:4px 0 14px}.bar span{display:block}
.s-ok{background:#22c55e}.s-ng{background:#ef4444}.s-hold{background:#f59e0b}.s-todo{background:#cbd5e1}.s-na{background:repeating-linear-gradient(45deg,#94a3b8 0 4px,#cbd5e1 4px 8px)}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;align-items:center}
.filters select,.filters input{font:inherit;padding:6px 8px;border:1px solid #d1d5db;border-radius:8px;background:#fff;min-width:0}
.filters input{flex:1 1 180px}.count{color:var(--muted);font-size:13px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
thead th{background:#f3f4f6;font-size:12px;color:#374151;white-space:nowrap}
tr.row{cursor:pointer}tr.row:hover{background:#f8fafc}tr.row.open{background:#eef2ff}
.badge{display:inline-block;min-width:3.2em;text-align:center;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:700;color:#fff;white-space:nowrap}
.b-ok{background:var(--ok)}.b-ng{background:var(--ng)}.b-hold{background:var(--hold)}.b-todo{background:#9ca3af}.b-na{background:#fff;color:var(--na);border:1px dashed var(--na)}
.na{font-size:12px;color:var(--na)}
.thumbs{display:flex;gap:4px;flex-wrap:wrap;align-items:center}.thumbs img{width:56px;height:40px;object-fit:cover;border:1px solid var(--line);border-radius:4px;cursor:zoom-in;background:#fff}
.warn{color:#b45309;font-size:12px;font-weight:700}.clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.detail td{background:#fafafa;padding:14px}
.kv{display:grid;grid-template-columns:8em 1fr;gap:4px 12px;margin-bottom:10px}.kv dt{color:var(--muted);font-size:12px;padding-top:2px}.kv dd{margin:0;white-space:pre-wrap;word-break:break-word}
.evs{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.evs figure{margin:0;background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px}
.evs img{width:100%;height:150px;object-fit:contain;cursor:zoom-in;display:block}.evs figcaption{font-size:11px;color:var(--muted);word-break:break-all}
.evs a.lnk{display:block;padding:10px;background:#eef2ff;border-radius:6px;color:var(--pri);word-break:break-all;font-weight:700}
.lb{position:fixed;inset:0;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;z-index:10}
.lb[hidden],[hidden]{display:none!important}.lb img,.lb video{max-width:94vw;max-height:84vh;object-fit:contain;background:#000}
.lb .msg{position:fixed;bottom:16px;left:0;right:0;text-align:center;color:#fde68a;font-size:13px}
.lb .cap{position:fixed;top:10px;left:16px;right:60px;color:#fff;font-size:13px}
.lb button{position:fixed;background:rgba(255,255,255,.15);color:#fff;border:0;font-size:28px;width:48px;height:48px;border-radius:24px;cursor:pointer}
.lb .x{top:8px;right:10px;font-size:20px}.lb .pv{left:10px;top:50%}.lb .nx{right:10px;top:50%}
footer{color:var(--muted);font-size:12px;text-align:center;padding:20px}
@media (max-width:760px){
 thead{display:none}table,tbody,tr,td{display:block;width:100%}
 tr.row{border-bottom:1px solid var(--line);padding:8px 10px;display:grid;grid-template-columns:auto 1fr auto;gap:2px 8px}
 tr.row td{border:0;padding:0}
 tr.row td.c-no{font-weight:700}tr.row td.c-major{grid-column:2;color:var(--muted);font-size:12px}tr.row td.c-res{grid-row:1;grid-column:3}
 tr.row td.c-minor{grid-column:1/4}tr.row td.c-exp{grid-column:1/4;font-size:12px;color:#4b5563}
 tr.row td.c-asg,tr.row td.c-date{display:inline;font-size:12px;color:var(--muted)}tr.row td.c-ev{grid-column:1/4}
 .kv{grid-template-columns:1fr}.kv dt{padding-top:6px}
}
@media print{.filters,.lb{display:none!important}header{background:none;color:#000}}
`;

  /* 閲覧用 HTML 内で実行されるスクリプト（文字列化して埋め込む） */
  function viewerMain() {
    var D = JSON.parse(document.getElementById('data').textContent);
    var RES = ['OK', 'NG', '保留', '未実施', '対象外'];
    var CLS = { 'OK': 'ok', 'NG': 'ng', '保留': 'hold', '未実施': 'todo', '対象外': 'na' };
    var $ = function (s) { return document.querySelector(s); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var badge = function (r) { return '<span class="badge b-' + (CLS[r] || 'todo') + '">' + esc(r) + '</span>'; };
    var dur = function (s) { if (!s) return ''; s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
    var F = { major: '', result: '', assignee: '', q: '' };
    var openId = null;

    function naText(it) {
      if (it.result !== '対象外') return '';
      var s = [it.naReason, it.naNote].filter(Boolean).join('：');
      if (it.naRef) s += '（' + it.naRef + ' で確認）';
      return s;
    }
    function uniq(k) { var s = []; D.items.forEach(function (it) { var v = it[k] || '（未設定）'; if (s.indexOf(v) < 0) s.push(v); }); return s; }
    function fill(sel, label, vals) { sel.innerHTML = '<option value="">' + label + '：すべて</option>' + vals.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join(''); }

    function filtered() {
      var q = F.q.toLowerCase();
      return D.items.filter(function (it) {
        if (F.major && (it.major || '（未設定）') !== F.major) return false;
        if (F.result && it.result !== F.result) return false;
        if (F.assignee && (it.assignee || '（未設定）') !== F.assignee) return false;
        if (q) {
          var h = [it.no, it.major, it.minor, it.precondition, it.steps, it.expected, it.actual, it.assignee, it.date, it.note, naText(it)].join('\n').toLowerCase();
          if (h.indexOf(q) < 0) return false;
        }
        return true;
      });
    }

    function stats() {
      var c = { 'OK': 0, 'NG': 0, '保留': 0, '未実施': 0, '対象外': 0 };
      D.items.forEach(function (it) { c[it.result] = (c[it.result] || 0) + 1; });
      var t = D.items.length, target = t - c['対象外'], done = c.OK + c.NG + c['保留'];
      var html = '<button class="stat ' + (F.result === '' ? 'on' : '') + '" data-r=""><span>全項目</span><b>' + t + '</b></button>';
      RES.forEach(function (r) { html += '<button class="stat ' + CLS[r] + (F.result === r ? ' on' : '') + '" data-r="' + r + '"><span>' + r + '</span><b>' + c[r] + '</b></button>'; });
      $('#stats').innerHTML = html;
      $('#prog').innerHTML = '進捗 <b>' + (target ? (done / target * 100).toFixed(1) : '0.0') + '%</b>（実施済 ' + done + ' / 対象 ' + target + ' 件' + (c['対象外'] ? '・対象外 ' + c['対象外'] + ' 件を除く' : '') + '）　OK率 <b>' + (done ? (c.OK / done * 100).toFixed(1) : '0.0') + '%</b>';
      $('#bar').innerHTML = t ? RES.map(function (r) { return c[r] ? '<span class="s-' + CLS[r] + '" style="width:' + (c[r] / t * 100) + '%" title="' + r + ' ' + c[r] + '"></span>' : ''; }).join('') : '';
    }

    function evFig(it, k, i) {
      var e = D.ev[k] || {};
      if (e.kind === 'link') return '<figure>' + (/^https?:\/\//i.test(e.url || '') ? '<a class="lnk" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">🔗 ' + esc(e.name) + '</a>' : '<span class="lnk">🔗 ' + esc(e.name) + '</span>') + '<figcaption>エビデンス' + (i + 1) + '　' + esc(e.url) + '</figcaption></figure>';
      var cap = e.kind === 'video' ? '▶ 動画 ' + dur(e.duration) + '　' : '';
      return '<figure><img src="' + esc(e.thumb || e.src) + '" data-it="' + esc(it.id) + '" data-i="' + i + '" alt=""><figcaption>エビデンス' + (i + 1) + '　' + cap + esc(e.path || e.name || '') + '</figcaption></figure>';
    }

    function detail(it) {
      var kv = [['前提条件', it.precondition], ['手順', it.steps], ['期待結果', it.expected]];
      if (it.result === '対象外') kv.push(['対象外の理由', naText(it)]); else kv.push(['実績', it.actual]);
      kv.push(['担当', it.assignee], ['実施日', it.date], ['備考', it.note]);
      var evs = (it.evidence || []).map(function (k, i) { return evFig(it, k, i); }).join('');
      return '<tr class="detail"><td colspan="8"><dl class="kv">' + kv.map(function (p) { return '<dt>' + p[0] + '</dt><dd>' + esc(p[1] || '-') + '</dd>'; }).join('') + '</dl>' +
        (evs ? '<div class="evs">' + evs + '</div>' : (it.result === '対象外' ? '' : '<p class="' + (it.result === 'OK' ? 'warn' : '') + '">エビデンスなし</p>')) + '</td></tr>';
    }

    function render() {
      stats();
      var list = filtered();
      $('#count').textContent = list.length + ' / ' + D.items.length + ' 件';
      $('#rows').innerHTML = list.map(function (it) {
        var ev = it.evidence || [];
        var th = ev.slice(0, 3).map(function (k, i) { var e = D.ev[k] || {}; return '<img src="' + esc(e.thumb || e.src || '') + '" data-it="' + esc(it.id) + '" data-i="' + i + '" alt="">'; }).join('');
        if (ev.length > 3) th += '<small>+' + (ev.length - 3) + '</small>';
        if (!ev.length && it.result === 'OK') th += '<span class="warn">⚠ 未添付</span>';
        var na = it.result === '対象外' ? '<div class="na">' + esc(naText(it)) + '</div>' : '';
        var row = '<tr class="row' + (openId === it.id ? ' open' : '') + '" data-id="' + esc(it.id) + '">' +
          '<td class="c-no">' + esc(it.no) + '</td><td class="c-major">' + esc(it.major) + '</td><td class="c-minor">' + esc(it.minor) + '</td>' +
          '<td class="c-exp"><div class="clamp">' + esc(it.expected) + '</div>' + na + '</td><td class="c-res">' + badge(it.result) + '</td>' +
          '<td class="c-asg">' + esc(it.assignee) + '</td><td class="c-date">' + esc(it.date) + '</td><td class="c-ev"><div class="thumbs">' + th + '</div></td></tr>';
        return row + (openId === it.id ? detail(it) : '');
      }).join('') || '<tr><td colspan="8" style="text-align:center;color:#6b7280;padding:24px">該当する項目がありません</td></tr>';
    }

    var lb = { list: [], i: 0 };
    function lbShow() {
      var k = lb.list[lb.i]; var e = D.ev[k.key] || {};
      var img = $('#lbImg'), vid = $('#lbVid'), msg = $('#lbMsg');
      vid.pause(); vid.removeAttribute('src'); img.hidden = vid.hidden = msg.hidden = true;
      if (e.kind === 'video' && e.src) { vid.hidden = false; vid.src = e.src; vid.play().catch(function () {}); }
      else if (e.kind === 'video') { img.hidden = false; img.src = e.thumb; msg.hidden = false; msg.textContent = 'この版には動画が含まれていません（納品パッケージ版の HTML で再生できます）'; }
      else { img.hidden = false; img.src = e.src || e.thumb; }
      $('#lbCap').textContent = k.cap + '  ' + (e.path || e.name || '') + '  (' + (lb.i + 1) + ' / ' + lb.list.length + ')';
      $('.lb .pv').hidden = $('.lb .nx').hidden = lb.list.length < 2;
      $('#lb').hidden = false;
    }
    function lbClose() { var v = $('#lbVid'); v.pause(); v.removeAttribute('src'); $('#lb').hidden = true; }
    function lbMove(d) { lb.i = (lb.i + d + lb.list.length) % lb.list.length; lbShow(); }

    document.body.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('#lb')) {
        if (t.closest('.x') || t.id === 'lb') lbClose();
        else if (t.closest('.pv')) lbMove(-1);
        else if (t.closest('.nx')) lbMove(1);
        return;
      }
      if (t.tagName === 'IMG' && t.dataset.it) {
        var it = D.items.filter(function (x) { return x.id === t.dataset.it; })[0];
        var keys = it.evidence.filter(function (k) { return (D.ev[k] || {}).kind !== 'link'; });
        var key = it.evidence[+t.dataset.i];
        lb.list = keys.map(function (k) { return { key: k, cap: it.no + '  エビデンス' + (it.evidence.indexOf(k) + 1) }; });
        lb.i = Math.max(0, keys.indexOf(key)); lbShow(); return;
      }
      if (t.closest('a')) return;
      var s = t.closest('.stat');
      if (s) { F.result = s.dataset.r; $('#fResult').value = F.result; render(); return; }
      var r = t.closest('tr.row');
      if (r) { openId = openId === r.dataset.id ? null : r.dataset.id; render(); }
    });
    document.addEventListener('keydown', function (e) {
      if ($('#lb').hidden) return;
      if (e.key === 'Escape') lbClose();
      if (e.key === 'ArrowRight' && document.activeElement !== $('#lbVid')) lbMove(1);
      if (e.key === 'ArrowLeft' && document.activeElement !== $('#lbVid')) lbMove(-1);
    });
    fill($('#fMajor'), '大項目', uniq('major'));
    fill($('#fResult'), '判定', RES);
    fill($('#fAssignee'), '担当', uniq('assignee'));
    $('#fMajor').onchange = function () { F.major = this.value; render(); };
    $('#fResult').onchange = function () { F.result = this.value; render(); };
    $('#fAssignee').onchange = function () { F.assignee = this.value; render(); };
    $('#fQ').oninput = function () { F.q = this.value; render(); };
    render();
  }

  function buildHtml(p, data) {
    const m = p.meta || {};
    const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    const metaLine = [m.system, m.version, m.period, m.org].filter(Boolean).map(U.esc).join(' ／ ');
    return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: 'self' file:; media-src 'self' file: blob: data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${U.esc(p.name)} - 評価報告書（閲覧用）</title>
<style>${VIEWER_CSS}</style></head>
<body>
<header><h1>${U.esc(p.name)}</h1><p>${metaLine ? metaLine + '　｜　' : ''}出力日時：${U.esc(U.formatDateTime(data.exportedAt))}　（閲覧用）</p></header>
<main>
${m.summary ? `<p>${U.escBr(m.summary)}</p>` : ''}
<div class="stats" id="stats"></div><div class="prog" id="prog"></div><div class="bar" id="bar"></div>
<div class="filters"><select id="fMajor"></select><select id="fResult"></select><select id="fAssignee"></select><input id="fQ" type="search" placeholder="キーワード検索"><span class="count" id="count"></span></div>
<table><thead><tr><th>ID</th><th>大項目</th><th>小項目</th><th>期待結果</th><th>判定</th><th>担当</th><th>実施日</th><th>エビデンス</th></tr></thead><tbody id="rows"></tbody></table>
</main>
<footer>行をクリックすると詳細を表示します。画像・動画をクリックすると拡大／再生します。</footer>
<div class="lb" id="lb" hidden><div class="cap" id="lbCap"></div><button class="x" aria-label="閉じる">✕</button><button class="pv" aria-label="前">‹</button><img id="lbImg" alt=""><video id="lbVid" controls playsinline hidden></video><div class="msg" id="lbMsg" hidden></div><button class="nx" aria-label="次">›</button></div>
<script type="application/json" id="data">${json}</script>
<script>(${viewerMain.toString()})();</script>
</body></html>`;
  }

  /** 閲覧用データを組み立てる。mode: 'package' | 'single' */
  async function collect(p, mode, files, b) {
    const paths = await TR.evidencePaths(p);
    const ev = {};
    const ids = p.items.flatMap((it) => it.evidence || []);
    let n = 0;
    for (const id of ids) {
      n++;
      b.update(`エビデンスを収集中… ${n} / ${ids.length}`);
      const rec = await TR.db.getImage(id);
      if (!rec) continue;
      const pth = paths.get(id) || {};
      const e = { kind: rec.kind || 'image', name: rec.name, duration: rec.duration || 0, url: U.safeUrl(rec.url), path: pth.path || '' };
      if (rec.thumb) e.thumb = await U.blobToDataURL(rec.thumb);
      if (e.kind !== 'link' && rec.blob) {
        if (mode === 'package') {
          e.src = pth.path;
          files.push({ path: pth.path, blob: rec.blob });
        } else if (e.kind === 'image') {
          e.src = await U.blobToDataURL(rec.blob);
        }
      }
      ev[id] = e;
    }
    return {
      name: p.name,
      meta: p.meta || {},
      exportedAt: new Date().toISOString(),
      items: p.items.map((it) => ({
        id: it.id, no: it.no, major: it.major, minor: it.minor, precondition: it.precondition, steps: it.steps,
        expected: it.expected, actual: it.actual, result: it.result, naReason: it.naReason || '', naNote: it.naNote || '', naRef: it.naRef || '',
        assignee: it.assignee, date: it.date, note: it.note,
        evidence: (it.evidence || []).filter((id) => ev[id]),
      })),
      ev,
    };
  }

  async function exportPackage(p) {
    const b = ui.busy('納品パッケージを作成中…');
    try {
      const JSZip = await TR.libs.jszip();
      const files = [];
      const data = await collect(p, 'package', files, b);
      const zip = new JSZip();
      const base = `${U.safeName(p.name)}_評価報告書`;
      const root = zip.folder(base);
      root.file('報告書_閲覧用.html', buildHtml(p, data));
      files.forEach((f) => root.file(f.path, f.blob));
      root.file('はじめにお読みください.txt',
        `${p.name} 評価報告書\n\n` +
        '■ 内容\n' +
        '・報告書_閲覧用.html … ブラウザで開くと、項目の絞り込み・エビデンスの拡大・動画の再生ができます（オフライン可）。\n' +
        '・evidence フォルダ … エビデンスの原本（画像・動画）。項目 ID ごとのフォルダに入っています。\n' +
        '・製本用 PDF … 本フォルダに同梱してください（PDF 内の「evidence/...」の記載がこのフォルダの各ファイルに対応します）。\n\n' +
        '■ ご注意\n' +
        '・ZIP は必ず展開（解凍）してから HTML を開いてください。ZIP の中から直接開くと画像・動画が表示されません。\n' +
        '・HTML と evidence フォルダの位置関係を変えないでください。\n');
      b.update('圧縮中…');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (m) => b.update(`圧縮中… ${Math.round(m.percent)}%`));
      U.download(blob, `${base}_${U.nowStamp()}.zip`);
      ui.toast('納品パッケージ（ZIP）を出力しました。製本用 PDF を同じフォルダに入れて納品してください。', 'success', 6000);
    } finally { b.close(); }
  }

  async function exportSingle(p) {
    const b = ui.busy('HTML を作成中…');
    try {
      const data = await collect(p, 'single', [], b);
      U.download(new Blob([buildHtml(p, data)], { type: 'text/html;charset=utf-8' }), `${U.safeName(p.name)}_閲覧用_${U.nowStamp()}.html`);
      ui.toast('閲覧用 HTML を出力しました', 'success');
    } finally { b.close(); }
  }

  async function start(p) {
    const hasVideo = (await Promise.all(p.items.flatMap((it) => it.evidence || []).map((id) => TR.imgCache.info(id)))).some((m) => m.kind === 'video');
    const v = await ui.modal({
      title: '閲覧用 HTML の出力',
      body: `<div class="chk-list">
        <label class="chk opt"><input type="radio" name="mode" value="package" checked>
          <span><b>納品パッケージ（ZIP）</b>　おすすめ<br><span class="muted small">HTML ＋ evidence フォルダ。動画もブラウザ上で再生できます。製本用 PDF を同じフォルダに入れて納品します。</span></span></label>
        <label class="chk opt"><input type="radio" name="mode" value="single">
          <span><b>単体 HTML（1ファイル）</b><br><span class="muted small">画像を埋め込んだ 1 ファイル。メールで送りやすい反面、${hasVideo ? '<b>動画は再生できません</b>（静止画のみ）' : '動画は再生できません'}。</span></span></label>
      </div>`,
      buttons: [{ label: 'キャンセル', value: null }, { label: '出力', value: 'ok', cls: 'btn-primary' }],
      onButton(val, el) { start.mode = U.$('input[name=mode]:checked', el).value; return true; },
    });
    if (v !== 'ok') return;
    if (start.mode === 'single') await exportSingle(p);
    else await exportPackage(p);
  }

  TR.viewer = { start, exportPackage, exportSingle };
})(window.TR);
