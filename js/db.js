/* IndexedDB 永続化（プロジェクト / エビデンス画像） */
(function (TR) {
  'use strict';

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
      t.onabort = () => reject(t.error || new Error('トランザクションが中断されました（容量不足の可能性があります）'));
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
  });

  /* ---------- 画像 ObjectURL キャッシュ ---------- */
  const thumbUrls = new Map();
  const fullUrls = new Map();
  const meta = new Map();

  TR.imgCache = {
    async thumb(id) {
      if (thumbUrls.has(id)) return thumbUrls.get(id);
      const rec = await DB.getImage(id);
      if (!rec) return '';
      meta.set(id, { name: rec.name, type: rec.type, width: rec.width, height: rec.height });
      const url = URL.createObjectURL(rec.thumb || rec.blob);
      thumbUrls.set(id, url);
      return url;
    },
    async full(id) {
      if (fullUrls.has(id)) return fullUrls.get(id);
      const rec = await DB.getImage(id);
      if (!rec) return '';
      meta.set(id, { name: rec.name, type: rec.type, width: rec.width, height: rec.height });
      const url = URL.createObjectURL(rec.blob);
      fullUrls.set(id, url);
      return url;
    },
    meta(id) { return meta.get(id); },
    async info(id) {
      if (!meta.has(id)) await TR.imgCache.thumb(id);
      return meta.get(id) || { name: '' };
    },
    forget(id) {
      if (thumbUrls.has(id)) { URL.revokeObjectURL(thumbUrls.get(id)); thumbUrls.delete(id); }
      if (fullUrls.has(id)) { URL.revokeObjectURL(fullUrls.get(id)); fullUrls.delete(id); }
      meta.delete(id);
    },
    /** <img data-thumb="id"> / <img data-full="id"> に src を流し込む */
    hydrate(root) {
      TR.util.$$('img[data-thumb]:not([src])', root).forEach(async (el) => {
        el.src = await TR.imgCache.thumb(el.dataset.thumb);
      });
      TR.util.$$('img[data-full]:not([src])', root).forEach(async (el) => {
        el.src = await TR.imgCache.full(el.dataset.full);
      });
    },
  };

  /** File/Blob からエビデンス画像レコードを作成して保存し、id を返す */
  TR.addImageBlob = async function (projectId, blob, name) {
    const type = blob.type || TR.util.typeFromExt(name || '');
    const info = await TR.util.makeThumb(blob);
    const rec = {
      id: TR.util.uid(),
      projectId,
      name: name || `evidence_${TR.util.nowStamp()}.${TR.util.extFromType(type)}`,
      type,
      blob,
      thumb: info.thumb,
      width: info.width,
      height: info.height,
      createdAt: new Date().toISOString(),
    };
    await DB.putImage(rec);
    return rec.id;
  };
})(window.TR);
