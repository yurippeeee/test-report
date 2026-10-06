/* プロジェクトZIPの保存・読み込み / Excel＋エビデンスZIP出力 */
(function (TR) {
  'use strict';
  const U = TR.util;
  const ui = TR.ui;

  const FORMAT = 'test-report-project';
  const FORMAT_VERSION = 1;

  function cleanItem(it) {
    const o = {};
    ['id', 'no', 'major', 'minor', 'precondition', 'steps', 'expected', 'actual', 'result', 'assignee', 'date', 'note', 'updatedAt'].forEach((k) => { o[k] = it[k] == null ? '' : it[k]; });
    o.evidence = (it.evidence || []).slice();
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
      for (const id of ids) {
        const rec = await TR.db.getImage(id);
        if (!rec) continue;
        const file = `images/${id}.${U.extFromType(rec.type, rec.name)}`;
        zip.file(file, rec.blob);
        images.push({ id, name: rec.name, type: rec.type, width: rec.width, height: rec.height, createdAt: rec.createdAt, file });
      }
      const json = {
        format: FORMAT,
        version: FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        project: { id: p.id, name: p.name, meta: p.meta, createdAt: p.createdAt, updatedAt: p.updatedAt, items: p.items.map(cleanItem) },
        images,
      };
      zip.file('project.json', JSON.stringify(json, null, 2));
      zip.file('README.txt', `評価仕様書兼報告書アプリのプロジェクトファイルです。\nアプリのメニュー「プロジェクトを読み込み（.zip）」から開いてください。\n\nプロジェクト：${p.name}\n保存日時：${U.formatDateTime(json.exportedAt)}\n項目数：${p.items.length}\n画像数：${images.length}\n`);
      b.update('圧縮中…');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
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

    const b2 = ui.busy('画像を取り込み中…');
    try {
      const prefix = (() => {
        const pj = zip.file(/(^|\/)project\.json$/)[0];
        return pj ? pj.name.replace(/project\.json$/, '') : '';
      })();
      const idMap = {};
      const recs = [];
      const pid = asCopy ? U.uid() : src.id;
      let n = 0;
      for (const im of json.images || []) {
        n++;
        b2.update(`画像を取り込み中… ${n} / ${json.images.length}`);
        const zf = zip.file(prefix + im.file) || zip.file(im.file);
        if (!zf) continue;
        const raw = await zf.async('blob');
        const blob = new Blob([raw], { type: im.type || U.typeFromExt(im.file) });
        const info = await U.makeThumb(blob);
        const newId = asCopy ? U.uid() : im.id;
        idMap[im.id] = newId;
        recs.push({ id: newId, projectId: pid, name: im.name, type: blob.type, blob, thumb: info.thumb, width: info.width, height: info.height, createdAt: im.createdAt || new Date().toISOString() });
      }
      if (existing && !asCopy) await TR.db.deleteProject(existing.id);
      // 画像は少しずつ保存（大きなトランザクションを避ける）
      for (let i = 0; i < recs.length; i += 20) await TR.db.putImages(recs.slice(i, i + 20));
      const p = {
        id: pid,
        name: asCopy ? `${src.name}（コピー）` : src.name,
        meta: Object.assign({ system: '', version: '', period: '', author: '', org: '', summary: '' }, src.meta || {}),
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
      ui.toast(`「${p.name}」を読み込みました（${p.items.length} 項目・画像 ${recs.length} 枚）`, 'success', 4000);
    } finally { b2.close(); }
  }

  /* ---------- Excel ＋ エビデンスフォルダ（.zip） ---------- */
  async function exportExcelZip(p) {
    const b = ui.busy('Excel を作成中…');
    try {
      const [XLSX, JSZip] = await Promise.all([TR.libs.xlsx(), TR.libs.jszip()]);
      const zip = new JSZip();
      const base = `${U.safeName(p.name)}_報告書`;
      const root = zip.folder(base);
      const items = p.items;

      // エビデンスを書き出し、各行の相対パスを得る
      const usedDirs = new Set();
      const paths = [];
      let maxEv = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        let dir = U.safeName(it.no, `row${i + 1}`);
        if (usedDirs.has(dir)) dir = `${dir}_${i + 1}`;
        usedDirs.add(dir);
        const list = [];
        for (let k = 0; k < (it.evidence || []).length; k++) {
          const rec = await TR.db.getImage(it.evidence[k]);
          if (!rec) continue;
          const fname = `${dir}_${U.pad(list.length + 1)}.${U.extFromType(rec.type, rec.name)}`;
          const rel = `evidence/${dir}/${fname}`;
          root.file(rel, rec.blob);
          list.push({ rel, name: rec.name });
        }
        maxEv = Math.max(maxEv, list.length);
        paths.push(list);
        b.update(`エビデンスを収集中… ${i + 1} / ${items.length}`);
      }

      const headers = ['ID', '大項目', '小項目', '前提条件', '手順', '期待結果', '実績', '判定', '担当', '実施日', 'エビデンス数', '備考'];
      for (let k = 1; k <= Math.max(1, maxEv); k++) headers.push(`エビデンス${k}`);
      const aoa = [headers];
      items.forEach((it, i) => {
        const row = [it.no, it.major, it.minor, it.precondition, it.steps, it.expected, it.actual, it.result, it.assignee, it.date, paths[i].length, it.note];
        for (let k = 0; k < Math.max(1, maxEv); k++) row.push(paths[i][k] ? paths[i][k].rel.split('/').pop() : '');
        aoa.push(row);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // 相対ハイパーリンク
      const evCol0 = 12;
      items.forEach((it, i) => {
        paths[i].forEach((pth, k) => {
          const addr = XLSX.utils.encode_cell({ r: i + 1, c: evCol0 + k });
          if (ws[addr]) { ws[addr].l = { Target: pth.rel, Tooltip: pth.name || pth.rel }; }
        });
      });
      ws['!cols'] = [8, 14, 22, 24, 36, 32, 32, 8, 10, 11, 8, 24].map((w) => ({ wch: w }))
        .concat(Array.from({ length: Math.max(1, maxEv) }, () => ({ wch: 22 })));
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: items.length, c: headers.length - 1 } }) };

      // サマリシート
      const s = TR.summarize(items);
      const m = p.meta || {};
      const sum = [
        ['評価報告書'],
        [],
        ['プロジェクト', p.name],
        ['対象システム', m.system || ''],
        ['バージョン', m.version || ''],
        ['実施期間', m.period || ''],
        ['作成者', m.author || ''],
        ['組織', m.org || ''],
        ['出力日', U.today()],
        [],
        ['判定', '件数', '割合'],
        ...TR.RESULTS.map((r) => [r, s.counts[r] || 0, s.total ? (s.counts[r] || 0) / s.total : 0]),
        ['合計', s.total, 1],
        [],
        ['進捗率', s.progress],
        ['OK率（実施済に対する）', s.okRate],
        ['エビデンス未添付（実施済）', s.noEvidenceDone],
        ['OKなのにエビデンスなし', s.okNoEvidence],
        [],
        ['大項目', '件数', 'OK', 'NG', '保留', '未実施', '進捗率'],
        ...Array.from(TR.groupBy(items, 'major').entries()).map(([k, list]) => {
          const g = TR.summarize(list);
          return [k, g.total, g.counts.OK, g.counts.NG, g.counts['保留'], g.counts['未実施'], g.progress];
        }),
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(sum);
      ws2['!cols'] = [{ wch: 26 }, { wch: 30 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];
      // パーセント表示
      Object.keys(ws2).forEach((addr) => {
        if (addr[0] === '!') return;
        const c = XLSX.utils.decode_cell(addr);
        const v = ws2[addr];
        const pctCell = (c.c === 2 && c.r >= 11 && c.r <= 15) || (c.c === 1 && (c.r === 17 || c.r === 18)) || (c.c === 6 && c.r >= 23);
        if (pctCell && typeof v.v === 'number') v.z = '0.0%';
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws2, 'サマリ');
      XLSX.utils.book_append_sheet(wb, ws, '評価一覧');
      wb.Props = { Title: `${p.name} 評価報告書`, Author: m.author || '' };
      const xbuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      root.file(`${U.safeName(p.name)}_評価報告書.xlsx`, xbuf);
      root.file('はじめにお読みください.txt',
        'この ZIP を展開（解凍）してから Excel ファイルを開いてください。\n' +
        '「評価一覧」シートの「エビデンス1〜」列のリンクから、evidence フォルダ内の画像を開けます。\n' +
        'Excel ファイルと evidence フォルダの位置関係を変えないでください。\n');
      b.update('圧縮中…');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
      U.download(blob, `${base}_${U.nowStamp()}.zip`);
      ui.toast('Excel＋エビデンスを出力しました', 'success');
    } finally { b.close(); }
  }

  TR.exporter = { saveProjectZip, loadProjectZip, exportExcelZip };
})(window.TR);
