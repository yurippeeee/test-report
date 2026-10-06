/* IndexedDB 永続化（プロジェクト / エビデンス：画像・動画・リンク） */
(function (TR) {
  'use strict';
  const U = TR.util;

  const DB_NAME = 'test-report-app';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('このブラウザは IndexedDB に対応していません。'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('images')) {
          const s = db.createObjectStore('images', { keyPath: 'id' });
          s.createIndex('projectId', 'projectId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('データベースが他のタブで使用中です。他のタブを閉じてください。'));
    });
    return dbPromise;
  }

  function reqP(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let result;
      Promise.resolve(fn(t)).then((r) => { result = r; }, reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('保存が中断されました（ブラウザの保存容量が不足している可能性があります）'));
    });
  }

  const DB = (TR.db = {
    open,

    listProjects() {
      return tx(['projects'], 'readonly', (t) => reqP(t.objectStore('projects').getAll()));
    },
    getProject(id) {
      return tx(['projects'], 'readonly', (t) => reqP(t.objectStore('projects').get(id)));
    },
    putProject(p) {
      return tx(['projects'], 'readwrite', (t) => { t.objectStore('projects').put(p); });
    },
    async deleteProject(id) {
      const imgs = await DB.listImageKeys(id);
      await tx(['projects', 'images'], 'readwrite', (t) => {
        t.objectStore('projects').delete(id);
        const s = t.objectStore('images');
        imgs.forEach((k) => s.delete(k));
      });
      imgs.forEach((k) => TR.imgCache.forget(k));
    },

    putImage(rec) {
      return tx(['images'], 'readwrite', (t) => { t.objectStore('images').put(rec); });
    },
    putImages(recs) {
      return tx(['images'], 'readwrite', (t) => { const s = t.objectStore('images'); recs.forEach((r) => s.put(r)); });
    },
    getImage(id) {
      return tx(['images'], 'readonly', (t) => reqP(t.objectStore('images').get(id)));
    },
    deleteImages(ids) {
      ids.forEach((k) => TR.imgCache.forget(k));
      return tx(['images'], 'readwrite', (t) => { const s = t.objectStore('images'); ids.forEach((k) => s.delete(k)); });
    },
    listImageKeys(projectId) {
      return tx(['images'], 'readonly', (t) => reqP(t.objectStore('images').index('projectId').getAllKeys(projectId)));
    },

    /** どの項目からも参照されていないエビデンスを削除（元に戻す用に残していたもの） */
    async cleanupOrphans(project) {
      const used = new Set(project.items.flatMap((it) => it.evidence || []));
      const keys = await DB.listImageKeys(project.id);
      const orphans = keys.filter((k) => !used.has(k));
      if (orphans.length) await DB.deleteImages(orphans);
      return orphans.length;
    },
  });

  /* ---------- エビデンス ObjectURL キャッシュ ---------- */
  const thumbUrls = new Map();
  const fullUrls = new Map();
  const frameUrls = new Map();
  const meta = new Map();

  function setMeta(rec) {
    const m = {
      kind: rec.kind || 'image', name: rec.name, type: rec.type, width: rec.width, height: rec.height,
      duration: rec.duration || 0, url: rec.url || '', size: rec.blob ? rec.blob.size : 0,
      frameCount: (rec.frames || []).length,
    };
    meta.set(rec.id, m);
    return m;
  }

  TR.imgCache = {
    async thumb(id) {
      if (thumbUrls.has(id)) return thumbUrls.get(id);
      const rec = await DB.getImage(id);
      if (!rec) return '';
      setMeta(rec);
      const src = rec.thumb || rec.blob;
      if (!src) return '';
      const url = URL.createObjectURL(src);
      thumbUrls.set(id, url);
      return url;
    },
    async full(id) {
      if (fullUrls.has(id)) return fullUrls.get(id);
      const rec = await DB.getImage(id);
      if (!rec) return '';
      setMeta(rec);
      if (!rec.blob) return '';
      const url = URL.createObjectURL(rec.blob);
      fullUrls.set(id, url);
      return url;
    },
    /** 動画の静止画（4コマ）URL 配列 */
    async frames(id) {
      if (frameUrls.has(id)) return frameUrls.get(id);
      const rec = await DB.getImage(id);
      if (!rec) return [];
      setMeta(rec);
      const urls = (rec.frames || []).map((b) => URL.createObjectURL(b));
      frameUrls.set(id, urls);
      return urls;
    },
    meta(id) { return meta.get(id); },
    async info(id) {
      if (!meta.has(id)) {
        const rec = await DB.getImage(id);
        if (!rec) return { kind: 'image', name: '' };
        setMeta(rec);
      }
      return meta.get(id);
    },
    forget(id) {
      if (thumbUrls.has(id)) { URL.revokeObjectURL(thumbUrls.get(id)); thumbUrls.delete(id); }
      if (fullUrls.has(id)) { URL.revokeObjectURL(fullUrls.get(id)); fullUrls.delete(id); }
      if (frameUrls.has(id)) { frameUrls.get(id).forEach((u) => URL.revokeObjectURL(u)); frameUrls.delete(id); }
      meta.delete(id);
    },
    /** <img data-thumb="id"> / <img data-full="id"> / <img data-frame="id:n"> に src を流し込む */
    hydrate(root) {
      U.$$('img[data-thumb]:not([src])', root).forEach(async (el) => {
        el.src = await TR.imgCache.thumb(el.dataset.thumb);
      });
      U.$$('img[data-full]:not([src])', root).forEach(async (el) => {
        el.src = await TR.imgCache.full(el.dataset.full);
      });
      U.$$('img[data-frame]:not([src])', root).forEach(async (el) => {
        const [id, n] = el.dataset.frame.split(':');
        const urls = await TR.imgCache.frames(id);
        if (urls[+n]) el.src = urls[+n];
      });
    },
  };

  /** ファイル（画像・動画）をエビデンスとして保存し、id を返す */
  TR.addEvidenceFile = async function (projectId, blob, name) {
    const type = blob.type || U.typeFromExt(name || '');
    const rec = {
      id: U.uid(),
      projectId,
      kind: 'image',
      name: name || `evidence_${U.nowStamp()}.${U.extFromType(type)}`,
      type,
      blob,
      createdAt: new Date().toISOString(),
    };
    if (U.isVideo(type, name)) {
      rec.kind = 'video';
      const info = await U.videoInfo(blob);
      rec.duration = info ? info.duration : 0;
      rec.width = info ? info.width : 0;
      rec.height = info ? info.height : 0;
      rec.frames = info ? info.frames.filter(Boolean) : [];
      rec.thumb = await U.makeVideoThumb(rec.frames[0], rec.duration);
    } else {
      const info = await U.makeThumb(blob);
      rec.thumb = info.thumb;
      rec.width = info.width;
      rec.height = info.height;
    }
    await DB.putImage(rec);
    return rec.id;
  };

  /** リンク（大きな動画の保管先など）をエビデンスとして保存 */
  TR.addEvidenceLink = async function (projectId, url, title) {
    const rec = {
      id: U.uid(),
      projectId,
      kind: 'link',
      name: title || url,
      url,
      type: 'text/uri-list',
      thumb: await U.makeLinkThumb(title || url, url),
      createdAt: new Date().toISOString(),
    };
    await DB.putImage(rec);
    return rec.id;
  };

  /** 旧名（互換用） */
  TR.addImageBlob = TR.addEvidenceFile;

  /**
   * 納品物で使うエビデンスの相対パス（PDF の表記と閲覧用 HTML の evidence フォルダで共通）
   * @returns Map<id, {path, kind, name, ext}>
   */
  TR.evidencePaths = async function (project) {
    const map = new Map();
    const usedDirs = new Set();
    for (let i = 0; i < project.items.length; i++) {
      const it = project.items[i];
      let dir = U.safeName(it.no, `row${i + 1}`);
      if (usedDirs.has(dir)) dir = `${dir}_${i + 1}`;
      usedDirs.add(dir);
      let k = 0;
      for (const id of it.evidence || []) {
        const m = await TR.imgCache.info(id);
        if (m.kind === 'link') { map.set(id, { path: '', kind: 'link', name: m.name, url: m.url }); continue; }
        k++;
        const ext = U.extFromType(m.type, m.name);
        map.set(id, { path: `evidence/${dir}/${dir}_${U.pad(k)}.${ext}`, kind: m.kind, name: m.name, ext });
      }
    }
    return map;
  };
})(window.TR);
