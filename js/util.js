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
    const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
      'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v', 'video/ogg': 'ogv', 'video/3gpp': '3gp' };
    const base = String(type || '').split(';')[0];
    if (map[base]) return map[base];
    const m = String(name || '').match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : 'png';
  };

  /** 外部から来たリンク URL は http(s) のみ許可（javascript: 等を防ぐ）。不可なら '' */
  U.safeUrl = function (url) {
    const s = String(url || '').trim();
    return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
  };

  /** 外部から来た MIME タイプは画像・動画の形式だけ許可。不正なら拡張子から推定 */
  U.safeMime = function (type, name) {
    const t = String(type || '').toLowerCase().split(';')[0].trim();
    if (/^(image|video)\/[a-z0-9.+-]+$/.test(t) && t !== 'image/svg+xml') return t;
    const g = U.typeFromExt(name || '');
    return /^(image|video)\//.test(g) && g !== 'image/svg+xml' ? g : 'application/octet-stream';
  };

  U.typeFromExt = function (name) {
    const ext = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
      mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg', '3gp': 'video/3gpp' })[ext.toLowerCase()] || 'application/octet-stream';
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

  // JSZip はリポジトリ内に同梱（外部 CDN に依存しない）。
  // SheetJS は公式 CDN の 0.20.3 のみ（npm 公開版 0.18.5 は既知の脆弱性があるため使わない）。
  TR.libs = {
    xlsx: () => U.loadLib('XLSX', [
      'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    ]),
    jszip: () => U.loadLib('JSZip', [
      'vendor/jszip.min.js',
    ]),
  };

  /* ---------- 定数 ---------- */

  TR.RESULTS = ['OK', 'NG', '保留', '未実施', '対象外'];
  TR.RESULT_CLASS = { OK: 'ok', NG: 'ng', '保留': 'hold', '未実施': 'todo', '対象外': 'na' };
  TR.DONE_RESULTS = ['OK', 'NG', '保留'];
  TR.NA_REASONS = ['仕様変更により不要', '検証環境・機材なし', '他項目で確認済み', '今回のリリース対象外', 'その他'];

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
    { key: 'naNote', label: '対象外理由', panel: false, aliases: ['対象外理由', '除外理由', '理由', '実施しない理由'] },
    { key: 'assignee', label: '担当', aliases: ['担当', '担当者', '実施者', '試験者', 'テスター'] },
    { key: 'date', label: '実施日', aliases: ['実施日', '日付', '試験日', 'テスト日', '確認日'] },
    { key: 'note', label: '備考', multiline: true, aliases: ['備考', 'メモ', 'コメント', '補足', '不具合no', 'チケット'] },
  ];

  /** 判定の表記ゆれを吸収 */
  U.normalizeResult = function (v) {
    const s = String(v == null ? '' : v).normalize('NFKC').trim().toLowerCase();
    if (!s) return '未実施';
    if (['ok', '○', '〇', '◯', '合格', 'pass', 'passed', '済', 'good', 'o', '1'].includes(s)) return 'OK';
    if (['ng', '×', '✕', '✖', 'x', '不合格', 'fail', 'failed', 'ng有', 'bad', 'n', '2'].includes(s)) return 'NG';
    if (['保留', '△', 'pending', 'hold', '保留中', 'ブロック', 'blocked', 'h', '3'].includes(s)) return '保留';
    if (['対象外', 'n/a', 'na', '除外', '不要', '-', 'ー', '―', '—', '‐', 'skip', 'skipped', '対象外。', '5'].includes(s)) return '対象外';
    if (['未実施', '未', 'not run', 'todo', '未着手', '4'].includes(s)) return '未実施';
    if (s.startsWith('ok')) return 'OK';
    if (s.startsWith('ng')) return 'NG';
    if (s.startsWith('対象外')) return '対象外';
    return '未実施';
  };

  /** 新しい空項目 */
  TR.newItem = function (no) {
    return {
      id: U.uid(), no: no || '', major: '', minor: '', precondition: '', steps: '', expected: '',
      actual: '', result: '未実施', naReason: '', naNote: '', naRef: '', assignee: '', date: '', evidence: [], note: '',
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
      snippets: [],
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

  /** 対象外の理由（表示用） */
  TR.naText = function (it) {
    if (!it || it.result !== '対象外') return '';
    let s = [it.naReason, it.naNote].filter(Boolean).join('：');
    if (it.naRef) s += `（${it.naRef} で確認）`;
    return s;
  };

  /** 警告の種類（なければ空文字） */
  TR.warnOf = function (it) {
    if (it.result === 'OK' && !(it.evidence && it.evidence.length)) return 'OKなのにエビデンスなし';
    if (it.result === '対象外' && !it.naReason && !it.naNote) return '対象外の理由が未入力';
    return '';
  };

  /** 集計（対象外は進捗・OK率の分母から除く） */
  TR.summarize = function (items) {
    const counts = { OK: 0, NG: 0, '保留': 0, '未実施': 0, '対象外': 0 };
    let noEvidenceDone = 0, okNoEvidence = 0, noEvidenceAll = 0, naNoReason = 0;
    items.forEach((it) => {
      counts[it.result] = (counts[it.result] || 0) + 1;
      const hasEv = it.evidence && it.evidence.length > 0;
      if (it.result === '対象外') {
        if (!it.naReason && !it.naNote) naNoReason++;
        return;
      }
      if (!hasEv) noEvidenceAll++;
      if (!hasEv && TR.DONE_RESULTS.includes(it.result)) noEvidenceDone++;
      if (!hasEv && it.result === 'OK') okNoEvidence++;
    });
    const total = items.length;
    const target = total - counts['対象外'];
    const done = counts.OK + counts.NG + counts['保留'];
    return {
      total, target, counts, done,
      progress: target ? done / target : 0,
      okRate: done ? counts.OK / done : 0,
      noEvidenceDone, okNoEvidence, noEvidenceAll, naNoReason,
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

  /* ---------- 動画・リンクのエビデンス ---------- */

  U.isVideo = (type, name) => /^video\//.test(type || '') || /\.(mp4|m4v|mov|webm|ogv|3gp)$/i.test(name || '');
  U.isImage = (type, name) => /^image\//.test(type || '') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name || '');

  U.fmtDuration = function (sec) {
    if (!sec || !isFinite(sec)) return '';
    const s = Math.round(sec);
    return `${Math.floor(s / 60)}:${U.pad(s % 60)}`;
  };

  U.fmtSize = function (bytes) {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + 'GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + 'MB';
    return Math.max(1, Math.round(bytes / 1e3)) + 'KB';
  };

  function canvasToBlob(c, type = 'image/jpeg', q = 0.85) {
    return new Promise((resolve) => c.toBlob((b) => resolve(b), type, q));
  }

  /** 動画から再生時間と4コマの静止画を取り出す（失敗時 null） */
  U.videoInfo = function (blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.preload = 'auto';
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { v.removeAttribute('src'); v.load(); } catch (e) { /* noop */ }
        URL.revokeObjectURL(url);
        resolve(r);
      };
      const timer = setTimeout(() => finish(null), 20000);
      const seek = (t) => new Promise((res) => {
        const to = setTimeout(res, 4000);
        v.addEventListener('seeked', () => { clearTimeout(to); res(); }, { once: true });
        v.currentTime = t;
      });
      const grab = async (max) => {
        const w = v.videoWidth, h = v.videoHeight;
        const sc = Math.min(1, max / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.round(w * sc); c.height = Math.round(h * sc);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        return canvasToBlob(c);
      };
      v.addEventListener('loadedmetadata', async () => {
        try {
          let dur = v.duration;
          if (!isFinite(dur)) {
            // MediaRecorder 製の webm は duration が Infinity になるため末尾へシークして確定させる
            await new Promise((res) => {
              const to = setTimeout(res, 4000);
              v.addEventListener('durationchange', function h() {
                if (isFinite(v.duration)) { v.removeEventListener('durationchange', h); clearTimeout(to); res(); }
              });
              v.currentTime = 1e101;
            });
            dur = isFinite(v.duration) ? v.duration : 0;
          }
          if (!v.videoWidth) return finish(null);
          const times = dur > 0 ? [0.08, 0.36, 0.64, 0.92].map((p) => Math.min(p * dur, Math.max(0, dur - 0.05))) : [0];
          const frames = [];
          for (const t of times) {
            await seek(t);
            frames.push(await grab(640));
          }
          finish({ duration: dur, width: v.videoWidth, height: v.videoHeight, frames });
        } catch (e) {
          finish(null);
        }
      });
      v.addEventListener('error', () => finish(null));
      v.src = url;
    });
  };

  function loadImg(blob) {
    return new Promise((resolve) => {
      if (!blob) return resolve(null);
      const url = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      im.src = url;
    });
  }

  /** 動画のサムネイル（▶ と再生時間を焼き込み） */
  U.makeVideoThumb = async function (frameBlob, duration) {
    const im = await loadImg(frameBlob);
    const W = 360, H = im ? Math.round(360 * im.height / im.width) || 240 : 240;
    const c = document.createElement('canvas');
    c.width = W; c.height = Math.min(Math.max(H, 120), 480);
    const g = c.getContext('2d');
    g.fillStyle = '#1f2937'; g.fillRect(0, 0, c.width, c.height);
    if (im) g.drawImage(im, 0, 0, c.width, c.height);
    else { g.fillStyle = '#9ca3af'; g.font = '16px sans-serif'; g.fillText('動画（プレビュー不可）', 16, 28); }
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, c.width, c.height);
    const cx = c.width / 2, cy = c.height / 2;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx - 11, cy - 18); g.lineTo(cx + 19, cy); g.lineTo(cx - 11, cy + 18); g.closePath(); g.fill();
    const label = '▶ 動画' + (duration ? ' ' + U.fmtDuration(duration) : '');
    g.font = 'bold 18px sans-serif';
    const tw = g.measureText(label).width;
    g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(c.width - tw - 18, c.height - 34, tw + 12, 26);
    g.fillStyle = '#fff'; g.fillText(label, c.width - tw - 12, c.height - 15);
    return canvasToBlob(c);
  };

  /** リンクのサムネイル */
  U.makeLinkThumb = function (title, url) {
    const c = document.createElement('canvas');
    c.width = 360; c.height = 240;
    const g = c.getContext('2d');
    g.fillStyle = '#eef2ff'; g.fillRect(0, 0, 360, 240);
    g.strokeStyle = '#93c5fd'; g.lineWidth = 4; g.strokeRect(2, 2, 356, 236);
    g.font = '54px sans-serif'; g.fillText('🔗', 24, 82);
    g.fillStyle = '#1e3a8a'; g.font = 'bold 22px sans-serif';
    const wrap = (text, y, max, lines) => {
      let line = '', n = 0;
      for (const ch of String(text)) {
        if (g.measureText(line + ch).width > max) {
          g.fillText(line, 24, y + n * 28); line = ch; n++;
          if (n >= lines) return;
        } else line += ch;
      }
      if (line) g.fillText(line, 24, y + n * 28);
    };
    wrap(title || 'リンク', 130, 312, 2);
    g.fillStyle = '#4b5563'; g.font = '15px sans-serif';
    let host = url;
    try { host = new URL(url).host || url; } catch (e) { /* noop */ }
    g.fillText(String(host).slice(0, 40), 24, 214);
    return canvasToBlob(c);
  };

  /* ---------- 区切りテキスト ---------- */

  /** タブ/カンマ区切りを 2 次元配列に（"…" で囲まれたセル内の改行・区切り文字に対応） */
  U.parseDelimited = function (text, delim) {
    text = String(text).replace(/\r\n?/g, '\n');
    if (text.endsWith('\n')) text = text.slice(0, -1);
    const out = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += ch;
        continue;
      }
      if (ch === '"' && cell === '') { q = true; continue; }
      if (ch === delim) { row.push(cell); cell = ''; continue; }
      if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; continue; }
      cell += ch;
    }
    row.push(cell);
    out.push(row);
    return out;
  };

  /* ---------- 取り込み後の「要確認」印 ---------- */

  /** 取り込み（AI 等）で入った未確認のセルがあるか */
  TR.isReview = (it) => !!(it && it.aiFields && it.aiFields.length);

  /** 人が編集したセルは印を外す */
  TR.touchField = function (it, key) {
    if (it && it.aiFields && it.aiFields.includes(key)) it.aiFields = it.aiFields.filter((k) => k !== key);
  };
})(window.TR);
