/* プロジェクトZIPの保存・読み込み（チーム間の受け渡し用） */
(function (TR) {
  'use strict';
  const U = TR.util;
  const ui = TR.ui;

  const FORMAT = 'test-report-project';
  const FORMAT_VERSION = 2;
  const ITEM_KEYS = ['id', 'no', 'major', 'minor', 'precondition', 'steps', 'expected', 'actual', 'result', 'naReason', 'naNote', 'naRef', 'assignee', 'date', 'note', 'updatedAt'];

  function cleanItem(it) {
    const o = {};
    ITEM_KEYS.forEach((k) => { o[k] = it[k] == null ? '' : String(it[k]); });
    o.evidence = Array.isArray(it.evidence) ? it.evidence.map(String) : [];
    o.aiFields = Array.isArray(it.aiFields) ? it.aiFields.filter((k) => typeof k === 'string') : [];
    return o;
  }

  /* ---------- プロジェクト保存（.zip） ---------- */
  async function saveProjectZip(p) {
    const b = ui.busy('ZIP を作成中…');
    try {
      const JSZip = await TR.libs.jszip();
      const zip = new JSZip();
      const images = [];
      const ids = p.items.flatMap((it) => it.evidence || []);
      let n = 0;
      for (const id of ids) {
        n++;
        b.update(`エビデンスを収集中… ${n} / ${ids.length}`);
        const rec = await TR.db.getImage(id);
        if (!rec) continue;
        const e = {
          id, kind: rec.kind || 'image', name: rec.name, type: rec.type, width: rec.width, height: rec.height,
          duration: rec.duration || 0, url: rec.url || '', createdAt: rec.createdAt,
        };
        if (rec.blob) {
          e.file = `images/${id}.${U.extFromType(rec.type, rec.name)}`;
          zip.file(e.file, rec.blob);
        }
        if (rec.thumb) {
          e.thumbFile = `thumbs/${id}.jpg`;
          zip.file(e.thumbFile, rec.thumb);
        }
        if (rec.frames && rec.frames.length) {
          e.frameFiles = rec.frames.map((f, i) => {
            const path = `frames/${id}_${i + 1}.jpg`;
            zip.file(path, f);
            return path;
          });
        }
        images.push(e);
      }
      const json = {
        format: FORMAT,
        version: FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        project: {
          id: p.id, name: p.name, meta: p.meta, snippets: p.snippets || [],
          createdAt: p.createdAt, updatedAt: p.updatedAt, items: p.items.map(cleanItem),
        },
        images,
      };
      zip.file('project.json', JSON.stringify(json, null, 2));
      zip.file('README.txt', `評価仕様書兼報告書アプリのプロジェクトファイルです。\nアプリのメニュー「プロジェクトを読み込み（.zip）」から開いてください。\n\nプロジェクト：${p.name}\n保存日時：${U.formatDateTime(json.exportedAt)}\n項目数：${p.items.length}\nエビデンス数：${images.length}\n`);
      b.update('圧縮中…');
      // 画像・動画は圧縮済みなので STORE（無圧縮）で高速化
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      U.download(blob, `${U.safeName(p.name)}_${U.nowStamp()}.zip`);
      ui.toast('プロジェクトを保存しました', 'success');
    } finally { b.close(); }
  }

  /* ---------- プロジェクト読み込み ---------- */
  async function loadProjectZip(file) {
    const b = ui.busy('ZIP を読み込み中…');
    let json, zip;
    try {
      const JSZip = await TR.libs.jszip();
      zip = await JSZip.loadAsync(await U.readAsArrayBuffer(file));
      const pj = zip.file('project.json') || zip.file(/(^|\/)project\.json$/)[0];
      if (!pj) throw new Error('project.json が見つかりません。このアプリで保存したZIPを選んでください。');
      json = JSON.parse(await pj.async('string'));
      if (json.format !== FORMAT || !json.project) throw new Error('対応していないファイル形式です。');
    } finally { b.close(); }

    const src = json.project;
    const existing = await TR.db.getProject(src.id);
    let asCopy = false;
    if (existing) {
      const v = await ui.modal({
        title: '同じプロジェクトが存在します',
        body: `<p>「${U.esc(existing.name)}」（最終更新 ${U.formatDateTime(existing.updatedAt)}）がすでにあります。</p>
               <p>読み込むファイルの最終更新：${U.formatDateTime(src.updatedAt)}</p>
               <p class="muted small">上書きすると、ブラウザ内の現在の内容はファイルの内容に置き換わります。</p>`,
        buttons: [{ label: 'キャンセル', value: null }, { label: '別プロジェクトとして読み込む', value: 'copy' }, { label: '上書きする', value: 'overwrite', cls: 'btn-danger' }],
      });
      if (!v) return;
      asCopy = v === 'copy';
    }

    const b2 = ui.busy('エビデンスを取り込み中…');
    try {
      const pj = zip.file(/(^|\/)project\.json$/)[0];
      const prefix = pj ? pj.name.replace(/project\.json$/, '') : '';
      const get = (path) => (path ? zip.file(prefix + path) || zip.file(path) : null);
      const idMap = {};
      const recs = [];
      const pid = asCopy ? U.uid() : src.id;
      let n = 0;
      for (const im of json.images || []) {
        n++;
        b2.update(`エビデンスを取り込み中… ${n} / ${json.images.length}`);
        // ZIP の中身は他人が作ったものかもしれないので、種類・形式・URL を検証してから取り込む
        const kind = ['image', 'video', 'link'].includes(im.kind) ? im.kind : 'image';
        const newId = asCopy ? U.uid() : String(im.id);
        const type = kind === 'link' ? 'text/uri-list' : U.safeMime(im.type, im.file || im.name);
        const rec = {
          id: newId, projectId: pid, kind, name: String(im.name || ''), type, width: +im.width || 0, height: +im.height || 0,
          duration: +im.duration || 0, url: kind === 'link' ? U.safeUrl(im.url) : '', createdAt: String(im.createdAt || new Date().toISOString()),
        };
        if (kind === 'link' && !rec.url) rec.name = `${rec.name}（無効な URL：${String(im.url || '').slice(0, 80)}）`;
        const zf = get(im.file);
        if (zf) rec.blob = new Blob([await zf.async('blob')], { type });
        else if (kind !== 'link') continue;
        const tf = kind === 'link' && !rec.url ? null : get(im.thumbFile);
        if (tf) rec.thumb = new Blob([await tf.async('blob')], { type: 'image/jpeg' });
        if (im.frameFiles) {
          rec.frames = [];
          for (const f of im.frameFiles) { const ff = get(f); if (ff) rec.frames.push(new Blob([await ff.async('blob')], { type: 'image/jpeg' })); }
        }
        if (!rec.thumb) {
          // 旧形式（v1）：サムネイルを再生成
          if (kind === 'video') {
            const info = await U.videoInfo(rec.blob);
            rec.frames = info ? info.frames : [];
            rec.duration = info ? info.duration : rec.duration;
            rec.thumb = await U.makeVideoThumb(rec.frames[0], rec.duration);
          } else if (kind === 'link') {
            rec.thumb = await U.makeLinkThumb(rec.name, rec.url);
          } else {
            const info = await U.makeThumb(rec.blob);
            rec.thumb = info.thumb; rec.width = info.width; rec.height = info.height;
          }
        }
        idMap[im.id] = newId;
        recs.push(rec);
      }
      if (existing && !asCopy) await TR.db.deleteProject(existing.id);
      for (let i = 0; i < recs.length; i += 10) await TR.db.putImages(recs.slice(i, i + 10));
      const p = {
        id: pid,
        name: asCopy ? `${src.name}（コピー）` : String(src.name || '無題'),
        meta: (() => {
          const m = { system: '', version: '', period: '', author: '', org: '', summary: '' };
          Object.keys(m).forEach((k) => { if (src.meta && src.meta[k] != null) m[k] = String(src.meta[k]); });
          return m;
        })(),
        snippets: (Array.isArray(src.snippets) ? src.snippets : []).map((s) => ({ id: String(s.id || U.uid()), title: String(s.title || ''), text: String(s.text || '') })),
        createdAt: src.createdAt || new Date().toISOString(),
        updatedAt: src.updatedAt || new Date().toISOString(),
        items: (src.items || []).map((it) => {
          const o = Object.assign(TR.newItem(), cleanItem(it));
          if (asCopy) o.id = U.uid();
          if (!TR.RESULTS.includes(o.result)) o.result = U.normalizeResult(o.result);
          o.evidence = (it.evidence || []).map((id) => idMap[id]).filter(Boolean);
          return o;
        }),
      };
      await TR.db.putProject(p);
      await TR.app.reloadProjects(p.id);
      ui.toast(`「${p.name}」を読み込みました（${p.items.length} 項目・エビデンス ${recs.length} 件）`, 'success', 4000);
    } finally { b2.close(); }
  }

  TR.exporter = { saveProjectZip, loadProjectZip };
})(window.TR);
