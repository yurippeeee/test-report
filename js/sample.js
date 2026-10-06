/* サンプルデータ（動作確認用） */
(function (TR) {
  'use strict';

  /** 画面キャプチャ風のダミー画像を生成 */
  function mockScreenshot(title, lines, accent) {
    return new Promise((resolve) => {
      const c = document.createElement('canvas');
      c.width = 960; c.height = 600;
      const g = c.getContext('2d');
      g.fillStyle = '#f3f4f6'; g.fillRect(0, 0, 960, 600);
      // ブラウザ枠
      g.fillStyle = '#e5e7eb'; g.fillRect(0, 0, 960, 44);
      ['#ef4444', '#f59e0b', '#22c55e'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(22 + i * 22, 22, 7, 0, Math.PI * 2); g.fill(); });
      g.fillStyle = '#fff'; g.fillRect(100, 10, 760, 24);
      g.fillStyle = '#6b7280'; g.font = '14px sans-serif'; g.fillText('https://example.com/app', 112, 27);
      // ヘッダ
      g.fillStyle = accent; g.fillRect(0, 44, 960, 64);
      g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.fillText(title, 32, 86);
      // カード
      g.fillStyle = '#fff'; g.fillRect(160, 150, 640, 380);
      g.strokeStyle = '#d1d5db'; g.strokeRect(160, 150, 640, 380);
      g.fillStyle = '#111827'; g.font = '22px sans-serif';
      lines.forEach((t, i) => g.fillText(t, 200, 210 + i * 56));
      g.fillStyle = accent; g.fillRect(200, 450, 200, 48);
      g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.fillText('OK', 285, 481);
      g.fillStyle = '#9ca3af'; g.font = '13px sans-serif';
      g.fillText('サンプル画像 ' + new Date().toLocaleString('ja-JP'), 16, 586);
      c.toBlob((b) => resolve(b), 'image/png');
    });
  }

  /** LED 点滅のサンプル動画（MediaRecorder 非対応なら null） */
  function ledVideo() {
    return new Promise((resolve) => {
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return resolve(null);
      const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const type = types.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } });
      if (!type) return resolve(null);
      const c = document.createElement('canvas');
      c.width = 480; c.height = 320;
      const g = c.getContext('2d');
      const draw = (t) => {
        const on = Math.floor(t / 250) % 2 === 0;
        g.fillStyle = '#111827'; g.fillRect(0, 0, 480, 320);
        g.fillStyle = '#374151'; g.fillRect(120, 70, 240, 180);
        g.fillStyle = '#9ca3af'; g.font = '16px sans-serif'; g.fillText('通知ユニット', 190, 110);
        g.fillStyle = on ? '#22c55e' : '#14532d';
        g.beginPath(); g.arc(240, 175, 26, 0, Math.PI * 2); g.fill();
        if (on) { g.fillStyle = 'rgba(34,197,94,.25)'; g.beginPath(); g.arc(240, 175, 48, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#e5e7eb'; g.font = '14px sans-serif'; g.fillText('サンプル動画：LED 2Hz 点滅  ' + (t / 1000).toFixed(1) + 's', 16, 300);
      };
      let rec;
      try {
        const stream = c.captureStream(24);
        rec = new MediaRecorder(stream, { mimeType: type });
      } catch (e) { return resolve(null); }
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: type.split(';')[0] }) : null);
      const t0 = performance.now();
      draw(0);
      rec.start(250);
      const iv = setInterval(() => {
        const t = performance.now() - t0;
        draw(t);
        if (t > 3000) { clearInterval(iv); rec.stop(); }
      }, 40);
      setTimeout(() => { if (rec.state !== 'inactive') { clearInterval(iv); rec.stop(); } }, 6000);
    });
  }

  TR.createSampleProject = async function () {
    const p = TR.newProject('【サンプル】会員サイト 結合テスト');
    p.meta = {
      system: '会員サイト（Webアプリ）',
      version: 'v1.2.0',
      period: '2026/10/01 〜 2026/10/10',
      author: '品質保証チーム',
      org: '株式会社サンプル',
      summary: '会員サイトの主要機能について結合テストを実施した結果を報告します。',
    };
    const rows = [
      ['TC-001', 'ログイン', '正常ログイン', '会員登録済みのアカウントがあること', '1. ログイン画面を開く\n2. メールアドレスとパスワードを入力\n3. 「ログイン」を押下', 'マイページに遷移し、氏名が表示されること', 'マイページに遷移し、氏名が表示された', 'OK', '佐藤', '2026-10-01', '', ['マイページ', ['ようこそ 山田 太郎 さん', '最終ログイン: 2026/10/01 10:12'], '#2563eb']],
      ['TC-002', 'ログイン', 'パスワード誤り', '会員登録済みのアカウントがあること', '1. ログイン画面を開く\n2. 誤ったパスワードを入力\n3. 「ログイン」を押下', 'エラーメッセージ「メールアドレスまたはパスワードが違います」が表示されること', '想定どおりのエラーメッセージが表示された', 'OK', '佐藤', '2026-10-01', '', ['ログイン', ['メールアドレスまたはパスワードが', '違います'], '#dc2626']],
      ['TC-003', 'ログイン', 'アカウントロック', '同一アカウントで4回連続ログイン失敗していること', '1. 誤ったパスワードで5回目のログインを行う', 'アカウントがロックされ、ロック通知メールが送信されること', 'ロックはされたが、通知メールが送信されなかった', 'NG', '鈴木', '2026-10-02', '不具合 #128 で起票済み', ['ログイン', ['アカウントがロックされました', '（メール未着）'], '#dc2626']],
      ['TC-004', '会員登録', '必須項目チェック', 'なし', '1. 会員登録画面を開く\n2. 何も入力せず「確認」を押下', '各必須項目にエラーが表示されること', '全必須項目にエラーが表示された', 'OK', '鈴木', '2026-10-02', '', null],
      ['TC-005', '会員登録', '確認メール送信', 'メールサーバが稼働していること', '1. 正しい情報で会員登録を行う', '登録したアドレス宛てに確認メールが届くこと', '', '保留', '高橋', '2026-10-03', '検証環境のメールサーバ停止中のため保留', null],
      ['TC-006', '検索', 'キーワード検索', '商品データが登録されていること', '1. 検索ボックスに「りんご」と入力\n2. 検索ボタンを押下', '「りんご」を含む商品が一覧表示されること', '3件表示された', 'OK', '高橋', '2026-10-03', '', ['検索結果', ['「りんご」の検索結果 3件', '・青森りんご  ・りんごジュース', '・りんごジャム'], '#16a34a']],
      ['TC-007', '検索', '該当なし', '', '1. 存在しないキーワードで検索', '「該当する商品はありません」と表示されること', '', '未実施', '高橋', '', '', null],
      ['TC-008', '帳票出力', 'CSV ダウンロード', '管理者でログインしていること', '1. 会員一覧画面を開く\n2. 「CSV出力」を押下', 'UTF-8(BOM付き) の CSV がダウンロードされること', '', '未実施', '', '', '', null],
      ['TC-009', '端末連携', '新着通知の LED 点滅', '通知ユニットが接続されていること', '1. 管理画面からテスト通知を送信\n2. 通知ユニットの LED を確認', 'LED が緑色で 2Hz 点滅すること', '緑色で約 2Hz の点滅を確認', 'OK', '鈴木', '2026-10-04', '', null],
      ['TC-010', '表示確認', 'Internet Explorer 11 での表示', '', '1. IE11 でトップページを開く', 'レイアウトが崩れないこと', '', '対象外', '', '', '', null],
    ];
    for (const r of rows) {
      const it = TR.newItem(r[0]);
      Object.assign(it, {
        major: r[1], minor: r[2], precondition: r[3], steps: r[4], expected: r[5],
        actual: r[6], result: r[7], assignee: r[8], date: r[9], note: r[10],
      });
      if (r[11]) {
        const blob = await mockScreenshot(r[11][0], r[11][1], r[11][2]);
        it.evidence.push(await TR.addEvidenceFile(p.id, blob, `${r[0]}_画面.png`));
      }
      p.items.push(it);
    }
    p.items[9].naReason = '今回のリリース対象外';
    p.items[9].naNote = 'IE11 はサポート終了のため';
    p.snippets = [
      { id: TR.util.uid(), title: 'ログイン済み', text: '一般会員アカウントでログインしていること' },
      { id: TR.util.uid(), title: 'ログイン手順', text: '1. ログイン画面を開く\n2. メールアドレスとパスワードを入力\n3. 「ログイン」を押下' },
    ];
    const vid = await ledVideo();
    if (vid) p.items[8].evidence.push(await TR.addEvidenceFile(p.id, vid, `TC-009_LED点滅.${TR.util.extFromType(vid.type)}`));
    // 2枚目のエビデンス例
    const extra = await mockScreenshot('受信メール', ['件名: アカウントロックのお知らせ', '→ 受信されず'], '#6b7280');
    p.items[2].evidence.push(await TR.addEvidenceFile(p.id, extra, 'TC-003_メール.png'));
    await TR.db.putProject(p);
    return p;
  };
})(window.TR);
