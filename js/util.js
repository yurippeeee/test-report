/* 共通ユーティリティ・定数 */
window.TR = window.TR || {};
(function (TR) {
  'use strict';

  const U = (TR.util = {});

  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  U.uid = function () {
    if (window.crypto && crypto.randomUUID) {
      try { return crypto.randomUUID(); } catch (e) { /* file:// 等 */ }
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  };

  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /** 改行を <br> にしてエスケープ */
  U.escBr = (s) => U.esc(s).replace(/\n/g, '<br>');

  U.pad = (n, w = 2) => String(n).padStart(w, '0');

  U.today = function () {
    const d = new Date();
    return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
  };

  U.nowStamp = function () {
    const d = new Date();
    return `${d.getFullYear()}${U.pad(d.getMonth() + 1)}${U.pad(d.getDate())}_${U.pad(d.getHours())}${U.pad(d.getMinutes())}`;
  };

  U.formatDateTime = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return `${d.getFullYear()}/${U.pad(d.getMonth() + 1)}/${U.pad(d.getDate())} ${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
  };

  /** Excel 等から来た日付らしき値を YYYY-MM-DD に正規化 */
  U.normalizeDate = function (v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) {
      return `${v.getFullYear()}-${U.pad(v.getMonth() + 1)}-${U.pad(v.getDate())}`;
    }
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      // Excel シリアル値
      const d = new Date(Math.round((v - 25569) * 86400000));
      return `${d.getUTCFullYear()}-${U.pad(d.getUTCMonth() + 1)}-${U.pad(d.getUTCDate())}`;
    }
    const s = String(v).trim();
    const m = s.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
    if (m) return `${m[1]}-${U.pad(m[2])}-${U.pad(m[3])}`;
    return s;
  };

  U.debounce = function (fn, ms) {
    let t;
    const wrapped = function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
    wrapped.flush = function (...args) { clearTimeout(t); fn.apply(this, args); };
    return wrapped;
  };

  /** ファイル名に使えない文字を置換 */
  U.safeName = function (s, fallback = 'untitled') {
    const r = String(s == null ? '' : s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, '_').replace(/^\.+/, '').trim();
    return r.slice(0, 80) || fallback;
  };

  U.extFromType = function (type, name) {
    const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg' };
    if (map[type]) return map[type];
    const m = String(name || '').match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : 'png';
  };

  U.typeFromExt = function (name) {
    const ext = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' })[ext.toLowerCase()] || 'application/octet-stream';
  };

  U.download = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  U.blobToDataURL = function (blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  };

  U.readAsArrayBuffer = function (file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(file);
    });
  };

  /** 画像Blob → {width,height,thumb(Blob)} */
  U.makeThumb = function (blob, max = 360) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        const scale = Math.min(1, max / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((t) => resolve({ width: w, height: h, thumb: t || blob }), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0, thumb: blob }); };
      img.src = url;
    });
  };

  /** CDN スクリプトの遅延読み込み（複数URLでフォールバック） */
  const scriptCache = {};
  U.loadLib = function (globalName, urls) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (scriptCache[globalName]) return scriptCache[globalName];
    scriptCache[globalName] = (async () => {
      for (const src of urls) {
        try {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => { s.remove(); reject(new Error(src)); };
            document.head.appendChild(s);
          });
          if (window[globalName]) return window[globalName];
        } catch (e) { /* 次のURLを試す */ }
      }
      delete scriptCache[globalName];
      throw new Error(`ライブラリ ${globalName} を読み込めませんでした。ネットワーク接続を確認してください。`);
    })();
    return scriptCache[globalName];
  };

  TR.libs = {
    xlsx: () => U.loadLib('XLSX', [
      'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    ]),
    jszip: () => U.loadLib('JSZip', [
      'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
      'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    ]),
  };

  /* ---------- 定数 ---------- */

  TR.RESULTS = ['OK', 'NG', '保留', '未実施'];
  TR.RESULT_CLASS = { OK: 'ok', NG: 'ng', '保留': 'hold', '未実施': 'todo' };
  TR.DONE_RESULTS = ['OK', 'NG', '保留'];

  /** 項目定義（標準構成）。aliases は Excel 取込時の列名推定に使用 */
  TR.FIELDS = [
    { key: 'no', label: 'ID', aliases: ['id', 'no', 'no.', '番号', '項番', 'テストid', 'ケースid', '試験番号', '#'] },
    { key: 'major', label: '大項目', aliases: ['大項目', '大分類', '機能', '機能名', 'カテゴリ', '分類', '画面'] },
    { key: 'minor', label: '小項目', aliases: ['小項目', '中項目', '小分類', '確認項目', 'テスト項目', '項目', '観点', 'テストケース', 'ケース名'] },
    { key: 'precondition', label: '前提条件', multiline: true, aliases: ['前提条件', '前提', '事前条件', '条件'] },
    { key: 'steps', label: '手順', multiline: true, aliases: ['手順', '操作手順', 'テスト手順', '操作', '実施手順'] },
    { key: 'expected', label: '期待結果', multiline: true, aliases: ['期待結果', '期待値', '期待する結果', '確認内容', '想定結果'] },
    { key: 'actual', label: '実績', multiline: true, aliases: ['実績', '実施結果', '結果詳細', '実際の結果', '実結果'] },
    { key: 'result', label: '判定', aliases: ['判定', '結果', '合否', 'ステータス', '状態', 'result'] },
    { key: 'assignee', label: '担当', aliases: ['担当', '担当者', '実施者', '試験者', 'テスター'] },
    { key: 'date', label: '実施日', aliases: ['実施日', '日付', '試験日', 'テスト日', '確認日'] },
    { key: 'note', label: '備考', multiline: true, aliases: ['備考', 'メモ', 'コメント', '補足', '不具合no', 'チケット'] },
  ];

  /** 判定の表記ゆれを吸収 */
  U.normalizeResult = function (v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (!s) return '未実施';
    if (['ok', '○', '〇', '◯', '合格', 'pass', 'passed', '済', 'good', 'o'].includes(s)) return 'OK';
    if (['ng', '×', '✕', '✖', 'x', '不合格', 'fail', 'failed', 'ng有', 'bad'].includes(s)) return 'NG';
    if (['保留', '△', 'pending', 'hold', 'skip', 'skipped', '保留中', 'ブロック', 'blocked', '-', '－'].includes(s)) return '保留';
    if (['未実施', '未', 'not run', 'todo', '未着手'].includes(s)) return '未実施';
    if (s.startsWith('ok')) return 'OK';
    if (s.startsWith('ng')) return 'NG';
    return '未実施';
  };

  /** 新しい空項目 */
  TR.newItem = function (no) {
    return {
      id: U.uid(), no: no || '', major: '', minor: '', precondition: '', steps: '', expected: '',
      actual: '', result: '未実施', assignee: '', date: '', evidence: [], note: '',
      updatedAt: new Date().toISOString(),
    };
  };

  TR.newProject = function (name) {
    const now = new Date().toISOString();
    return {
      id: U.uid(),
      name: name || '新しいプロジェクト',
      meta: { system: '', version: '', period: '', author: '', org: '', summary: '' },
      items: [],
      createdAt: now,
      updatedAt: now,
    };
  };

  /** 次の ID を推定（末尾の数字を+1、桁数維持） */
  TR.nextNo = function (items) {
    for (let i = items.length - 1; i >= 0; i--) {
      const m = String(items[i].no || '').match(/^(.*?)(\d+)(\D*)$/);
      if (m) {
        let max = 0;
        items.forEach((it) => {
          const mm = String(it.no || '').match(/^(.*?)(\d+)(\D*)$/);
          if (mm && mm[1] === m[1] && mm[3] === m[3]) max = Math.max(max, parseInt(mm[2], 10));
        });
        return m[1] + String(max + 1).padStart(m[2].length, '0') + m[3];
      }
    }
    return 'TC-' + String(items.length + 1).padStart(3, '0');
  };

  /** 集計 */
  TR.summarize = function (items) {
    const counts = { OK: 0, NG: 0, '保留': 0, '未実施': 0 };
    let noEvidenceDone = 0, okNoEvidence = 0, noEvidenceAll = 0;
    items.forEach((it) => {
      counts[it.result] = (counts[it.result] || 0) + 1;
      const hasEv = it.evidence && it.evidence.length > 0;
      if (!hasEv) noEvidenceAll++;
      if (!hasEv && TR.DONE_RESULTS.includes(it.result)) noEvidenceDone++;
      if (!hasEv && it.result === 'OK') okNoEvidence++;
    });
    const total = items.length;
    const done = counts.OK + counts.NG + counts['保留'];
    return {
      total, counts, done,
      progress: total ? done / total : 0,
      okRate: done ? counts.OK / done : 0,
      noEvidenceDone, okNoEvidence, noEvidenceAll,
    };
  };

  TR.groupBy = function (items, key) {
    const map = new Map();
    items.forEach((it) => {
      const k = it[key] || '（未設定）';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    });
    return map;
  };

  TR.pct = (v) => (Math.round(v * 1000) / 10).toFixed(1) + '%';
})(window.TR);
