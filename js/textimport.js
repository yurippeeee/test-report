/* テキスト（AI の出力など）から取り込み
 *  - AI 用の指示文を作ってコピー（API は使わない。claude.ai 等に貼って使う）
 *  - Markdown の表 / タブ区切り / CSV を貼り付け → 見出し名で列を対応付け → 追加 or 空欄だけ補完
 *  - 取り込んだセルには「要確認」の印（aiFields）を付ける
 */
(function (TR) {
  'use strict';
  const U = TR.util;
  const ui = TR.ui;

  const OUT_COLS = ['no', 'major', 'minor', 'precondition', 'steps', 'expected', 'note'];
  const FILL_KEYS = ['major', 'minor', 'precondition', 'steps', 'expected', 'note'];
  const ASPECTS = [
    ['正常系', true], ['異常系（エラー処理・入力チェック）', true], ['境界値', true], ['画面表示・文言', true],
    ['権限・ロール', false], ['状態遷移・操作順序', false], ['互換性（ブラウザ・端末）', false], ['性能・負荷', false], ['セキュリティ', false],
  ];
  const label = (k) => (TR.FIELDS.find((f) => f.key === k) || {}).label || k;

  /* ---------- 指示文 ---------- */
  const mdCell = (v) => String(v || '').replace(/\|/g, '｜').replace(/\r?\n/g, '<br>');
  const mdRow = (cells) => `| ${cells.map(mdCell).join(' | ')} |`;
  const mdHeader = () => mdRow(OUT_COLS.map(label)) + '\n' + mdRow(OUT_COLS.map(() => '---'));

  function formatRules(extra) {
    return [
      '# 出力形式（厳守）',
      '- Markdown の表だけを出力し、表の前後に説明文を書かないこと',
      `- 見出しは次のとおり（列の順番・名前を変えない）：${mdRow(OUT_COLS.map(label))}`,
      '- 1 行に 1 つの確認項目。期待結果は「何がどうなること」と確認できる形で具体的に書く',
      '- 手順は「1. 」「2. 」と番号を付ける。セル内の改行は <br> と書く',
      '- セルの中で「|」を使わない',
      ...extra,
    ].join('\n');
  }

  function examples(p) {
    const ex = p.items.filter((it) => it.minor && it.steps && it.expected).slice(0, 2);
    if (!ex.length) return '';
    return '\n\n# 書き方の例（既存の項目。粒度と文体をそろえること）\n' + mdHeader() + '\n' + ex.map((it) => mdRow(OUT_COLS.map((k) => it[k]))).join('\n');
  }

  function snippetsText(p) {
    const sn = p.snippets || [];
    if (!sn.length) return '';
    return '\n\n# 共通の前提条件・手順（当てはまる場合はこの表現をそのまま使う）\n' + sn.map((s) => `- ${s.title}：${s.text.replace(/\n/g, ' ／ ')}`).join('\n');
  }

  function buildNewPrompt(p, o) {
    const majors = Array.from(new Set(p.items.map((it) => it.major).filter(Boolean)));
    const next = TR.nextNo(p.items);
    const target = o.spec.trim() || '【ここに対象の仕様・画面・機能の説明を貼り付けてください】';
    return [
      'あなたはソフトウェアの評価（テスト）仕様書を作成する QA エンジニアです。',
      '次の対象について、評価項目の一覧を作成してください。',
      '',
      '# 対象',
      target,
      '',
      '# 観点（漏れなく洗い出すこと）',
      ...o.aspects.map((a) => `- ${a}`),
      '',
      formatRules([
        `- ID は ${next} から連番にする`,
        majors.length ? `- 大項目は、当てはまるものがあれば既存の名前を使う：${majors.join('、')}` : '- 大項目は機能・画面の単位でまとめる',
        o.count ? `- 件数の目安：${o.count} 件程度` : '',
        '- 前提条件が不要な場合は空欄にする',
      ].filter(Boolean)),
    ].join('\n') + snippetsText(p) + examples(p);
  }

  function fillTargets(p) {
    const sel = TR.app.isMobile() ? [] : TR.grid.selectedItems();
    const blank = (it) => it.minor && (!it.precondition || !it.steps || !it.expected);
    const src = sel.length > 1 ? sel : TR.app.viewItems();
    return { items: src.filter(blank), fromSelection: sel.length > 1 };
  }

  function buildFillPrompt(p, items, spec) {
    return [
      'あなたはソフトウェアの評価（テスト）仕様書を作成する QA エンジニアです。',
      '次の評価項目の空欄（前提条件・手順・期待結果）を埋めてください。',
      '',
      '# ルール',
      '- ID・大項目・小項目は変更しないこと',
      '- すでに入力されているセルは、そのまま同じ内容を出力すること',
      '- 対象の項目すべてを、同じ順番で出力すること',
      '',
      formatRules([]),
      '',
      '# 対象の仕様',
      (spec || '').trim() || '【必要に応じて仕様・画面の説明を貼り付けてください】',
      '',
      '# 対象の項目',
      mdHeader(),
      ...items.map((it) => mdRow(OUT_COLS.map((k) => it[k]))),
    ].join('\n') + snippetsText(p) + examples(p);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ---------- 貼り付けの解析 ---------- */
  function splitMdRow(line) {
    let t = line.trim().replace(/^\|/, '');
    if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
    const cells = [];
    let cur = '';
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
      if (t[i] === '|') { cells.push(cur); cur = ''; continue; }
      cur += t[i];
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  }

  const cleanCell = (v) => String(v == null ? '' : v)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/^\*\*(.*)\*\*$/s, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  function parse(text) {
    let t = String(text || '').replace(/\r\n?/g, '\n');
    t = t.replace(/^\s*```[^\n]*$/gm, ''); // コードブロックの囲みを除去
    const lines = t.split('\n');
    let fmt, rows;
    if (lines.filter((l) => l.trim().startsWith('|')).length >= 2) {
      fmt = 'Markdown の表';
      rows = lines.filter((l) => l.trim().startsWith('|')).map(splitMdRow)
        .filter((cells) => !cells.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
    } else if (t.includes('\t')) {
      fmt = 'タブ区切り';
      rows = U.parseDelimited(t.trim(), '\t');
    } else {
      fmt = 'CSV（カンマ区切り）';
      rows = U.parseDelimited(t.trim(), ',');
    }
    rows = rows.map((r) => r.map(cleanCell)).filter((r) => r.some((c) => c));
    if (!rows.length) return { fmt, rows: [], map: {}, header: false };
    const guess = TR.importer.guessMapping(rows[0]);
    const mapped = Object.keys(guess).filter((k) => guess[k] != null);
    if (mapped.length >= 2) return { fmt, rows, map: guess, header: true };
    // 見出しなし：標準の並び（ID / 大項目 / 小項目 / 前提条件 / 手順 / 期待結果 / 備考）とみなす
    const map = {};
    OUT_COLS.forEach((k, i) => { map[k] = i; });
    return { fmt, rows, map, header: false };
  }

  function toItems(parsed) {
    if (!parsed.rows.length) return [];
    return TR.importer.buildItems(parsed.rows, parsed.header ? 0 : -1, parsed.map, { fillDown: true, autoNo: false });
  }

  /** 追加する場合の計画（ID の重複は振り直し） */
  function planAppend(p, items, renumber) {
    const used = new Set(p.items.map((x) => x.no).filter(Boolean));
    const pool = p.items.slice();
    return items.map((it) => {
      const orig = it.no;
      if (!it.no || (renumber && used.has(it.no))) it.no = TR.nextNo(pool);
      used.add(it.no);
      pool.push(it);
      return { it, renamed: orig && orig !== it.no ? orig : '' };
    });
  }

  /** 空欄だけ補完する場合の計画 */
  function planFill(p, items) {
    const byNo = new Map();
    p.items.forEach((x) => { if (x.no && !byNo.has(x.no)) byNo.set(x.no, x); });
    return items.map((src) => {
      const dst = byNo.get(src.no);
      if (!dst) return { src, dst: null, keys: [] };
      const keys = FILL_KEYS.filter((k) => !String(dst[k] || '').trim() && String(src[k] || '').trim());
      return { src, dst, keys };
    });
  }

  const short = (v, n = 40) => { const s = String(v || '').replace(/\n/g, ' ／ '); return s.length > n ? s.slice(0, n) + '…' : s; };

  function previewHtml(parsed, mode, plan) {
    if (!parsed.rows.length) return '<p class="muted small">ここに結果を貼り付けると、取り込み内容を確認できます。</p>';
    const mapInfo = OUT_COLS.concat(['result', 'assignee', 'date']).filter((k) => parsed.map[k] != null).map(label).join('・');
    const head = `<p class="small"><b>${U.esc(parsed.fmt)}</b>として読み取りました。${parsed.header ? `見出しから列を対応付け：${U.esc(mapInfo)}` : '見出しがないため、ID・大項目・小項目・前提条件・手順・期待結果・備考の順とみなしました。'}</p>`;
    if (mode === 'fill') {
      const ok = plan.filter((x) => x.dst && x.keys.length);
      const none = plan.filter((x) => !x.dst);
      const same = plan.filter((x) => x.dst && !x.keys.length);
      return head + `<p class="small">空欄を埋める項目：<b>${ok.length}</b> 件（${ok.reduce((s, x) => s + x.keys.length, 0)} セル）
        ${same.length ? `／ 埋める空欄なし：${same.length} 件` : ''}${none.length ? `／ <span class="warn-ic">ID が一致しない：${none.length} 件（${U.esc(none.slice(0, 5).map((x) => x.src.no || '(IDなし)').join('、'))}${none.length > 5 ? '…' : ''}）は取り込みません</span>` : ''}</p>
        <div class="table-scroll"><table class="preview"><thead><tr><th>ID</th><th>小項目</th><th>埋めるセル</th><th>内容（抜粋）</th></tr></thead><tbody>
        ${ok.slice(0, 8).map((x) => `<tr><td>${U.esc(x.dst.no)}</td><td>${U.esc(short(x.dst.minor, 20))}</td><td>${x.keys.map(label).join('、')}</td><td>${U.esc(short(x.src[x.keys[0]]))}</td></tr>`).join('')}
        </tbody></table></div>${ok.length > 8 ? `<p class="muted small">…ほか ${ok.length - 8} 件</p>` : ''}`;
    }
    const renamed = plan.filter((x) => x.renamed);
    return head + `<p class="small"><b>${plan.length}</b> 件を一覧の末尾に追加します${renamed.length ? `（既存と重複する ID ${renamed.length} 件は振り直し）` : ''}。</p>
      <div class="table-scroll"><table class="preview"><thead><tr>${['ID', '大項目', '小項目', '前提条件', '手順', '期待結果'].map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
      ${plan.slice(0, 8).map(({ it, renamed: rn }) => `<tr><td>${U.esc(it.no)}${rn ? `<br><small class="muted">元:${U.esc(rn)}</small>` : ''}</td><td>${U.esc(short(it.major, 16))}</td><td>${U.esc(short(it.minor, 24))}</td><td>${U.esc(short(it.precondition, 24))}</td><td>${U.esc(short(it.steps))}</td><td>${U.esc(short(it.expected))}</td></tr>`).join('')}
      </tbody></table></div>${plan.length > 8 ? `<p class="muted small">…ほか ${plan.length - 8} 件</p>` : ''}`;
  }

  /* ---------- 画面 ---------- */
  async function start() {
    const p = TR.state.project;
    const ft = fillTargets(p);
    // 表で複数行を選んでいて、その中に空欄のある行があれば「補完」から始める
    const st = { mode: ft.fromSelection && ft.items.length ? 'fill' : 'new', parsed: { rows: [], map: {} }, plan: [] };

    const body = `
      <div class="ti-mode">
        <label class="chk opt"><input type="radio" name="tiMode" value="new" ${st.mode === 'new' ? 'checked' : ''}>
          <span><b>新しく項目を洗い出す</b><br><span class="muted small">仕様の説明から、評価項目の雛形をまとめて作ります。</span></span></label>
        <label class="chk opt"><input type="radio" name="tiMode" value="fill" ${st.mode === 'fill' ? 'checked' : ''}>
          <span><b>空欄を補完する</b><br><span class="muted small">小項目まで書いた行の前提条件・手順・期待結果を埋めます（入力済みのセルは変更しません）。</span></span></label>
      </div>

      <h3 class="sub">① 指示文を AI に渡す</h3>
      <label class="field"><span>対象の仕様・説明（任意。書いておくと AI の精度が上がります。空欄なら AI 側で貼り付けます）</span>
        <textarea id="tiSpec" rows="4" placeholder="例：会員登録画面。メールアドレス・パスワード（8〜32文字、英数記号）・氏名を入力し、確認画面を経て登録。登録後に確認メールを送信…"></textarea></label>
      <div class="ti-new" ${st.mode === 'new' ? '' : 'hidden'}>
        <div class="ti-aspects">${ASPECTS.map(([a, on]) => `<label class="chk"><input type="checkbox" name="aspect" value="${U.esc(a)}" ${on ? 'checked' : ''}> ${U.esc(a)}</label>`).join('')}</div>
        <label class="field ti-count"><span>件数の目安（任意）</span><input id="tiCount" type="number" min="1" placeholder="例：30"></label>
      </div>
      <div class="ti-fill" ${st.mode === 'fill' ? '' : 'hidden'}>
        <p class="small">対象：<b>${ft.items.length}</b> 件（${ft.fromSelection ? '表で選択した行のうち' : '表示中の行のうち'}、小項目があり前提条件・手順・期待結果のどれかが空欄のもの）${ft.items.length > 80 ? '<br><span class="warn-ic">件数が多いため、80 件ずつに分けて行うのがおすすめです（表で行を選択してから開くと対象を絞れます）</span>' : ''}</p>
      </div>
      <div class="ti-copy">
        <button type="button" class="btn btn-primary" data-copy>📋 指示文をコピー</button>
        <span class="muted small">→ claude.ai などに貼り付け → 出力された表をコピーして ② に貼り付け</span>
      </div>
      <details class="ti-prompt"><summary class="small">指示文の内容を確認・編集する</summary><textarea id="tiPrompt" rows="10" spellcheck="false"></textarea></details>

      <h3 class="sub">② 結果を貼り付ける</h3>
      <textarea id="tiPaste" rows="6" placeholder="AI の出力（Markdown の表）や、Excel からコピーした表をそのまま貼り付けます"></textarea>
      <div class="import-opts">
        <label class="chk"><input type="checkbox" id="tiMark" checked> 取り込んだセルに「要確認」の印を付ける（確認したら右クリック →「確認済みにする」）</label>
        <label class="chk ti-new" ${st.mode === 'new' ? '' : 'hidden'}><input type="checkbox" id="tiRenum" checked> 既存と重複する ID は振り直す</label>
      </div>
      <div id="tiPreview"></div>`;

    const v = await ui.modal({
      title: '🤖 AI で雛形を作成・補完（テキストから取り込み）',
      wide: true,
      sticky: true,
      body,
      buttons: [{ label: 'キャンセル', value: null }, { label: '取り込む', value: 'ok', cls: 'btn-primary' }],
      onOpen(el) {
        let promptEdited = false;
        const opts = () => ({
          spec: U.$('#tiSpec', el).value,
          aspects: U.$$('input[name=aspect]:checked', el).map((c) => c.value),
          count: U.$('#tiCount', el).value,
        });
        const refreshPrompt = () => {
          if (promptEdited) return;
          U.$('#tiPrompt', el).value = st.mode === 'fill' ? buildFillPrompt(p, ft.items.slice(0, 80), opts().spec) : buildNewPrompt(p, opts());
        };
        const refreshPreview = () => {
          st.parsed = parse(U.$('#tiPaste', el).value);
          const items = toItems(st.parsed);
          st.plan = st.mode === 'fill' ? planFill(p, items) : planAppend(p, items, U.$('#tiRenum', el).checked);
          U.$('#tiPreview', el).innerHTML = previewHtml(st.parsed, st.mode, st.plan);
        };
        el.addEventListener('change', (e) => {
          if (e.target.name === 'tiMode') {
            st.mode = e.target.value;
            U.$$('.ti-new', el).forEach((x) => { x.hidden = st.mode !== 'new'; });
            U.$('.ti-fill', el).hidden = st.mode !== 'fill';
            promptEdited = false;
            refreshPrompt();
            refreshPreview();
          } else if (e.target.name === 'aspect') refreshPrompt();
          else if (e.target.id === 'tiRenum') refreshPreview();
        });
        U.$('#tiSpec', el).addEventListener('input', refreshPrompt);
        U.$('#tiCount', el).addEventListener('input', refreshPrompt);
        U.$('#tiPrompt', el).addEventListener('input', () => { promptEdited = true; });
        U.$('#tiPaste', el).addEventListener('input', U.debounce(refreshPreview, 150));
        U.$('[data-copy]', el).addEventListener('click', async () => {
          refreshPrompt();
          if (st.mode === 'fill' && !ft.items.length) { ui.toast('補完の対象になる行がありません', 'error'); return; }
          const ok = await copyText(U.$('#tiPrompt', el).value);
          if (ok) ui.toast('指示文をコピーしました。AI に貼り付けてください', 'success', 3500);
          else { U.$('.ti-prompt', el).open = true; U.$('#tiPrompt', el).select(); ui.toast('自動コピーできませんでした。表示された指示文をコピーしてください', 'error', 4000); }
        });
        refreshPrompt();
        refreshPreview();
      },
      onButton(val, el) {
        if (val !== 'ok') return true;
        const usable = st.mode === 'fill' ? st.plan.filter((x) => x.dst && x.keys.length) : st.plan;
        if (!usable.length) { ui.toast(st.parsed.rows.length ? '取り込める行がありません（プレビューを確認してください）' : '② に結果を貼り付けてください', 'error'); return false; }
        st.mark = U.$('#tiMark', el).checked;
        return true;
      },
    });
    if (v !== 'ok') return;
    apply(p, st);
  }

  function apply(p, st) {
    const mark = st.mark;
    if (st.mode === 'fill') {
      const targets = st.plan.filter((x) => x.dst && x.keys.length);
      TR.app.mutate(() => targets.forEach(({ src, dst, keys }) => {
        keys.forEach((k) => { dst[k] = src[k]; });
        if (mark) dst.aiFields = Array.from(new Set((dst.aiFields || []).concat(keys)));
        dst.updatedAt = new Date().toISOString();
      }));
      TR.app.gotoList(TR.state.filters);
      ui.toast(`${targets.length} 件の空欄（${targets.reduce((s, x) => s + x.keys.length, 0)} セル）を補完しました`, 'success', 4000);
      return;
    }
    const items = st.plan.map((x) => x.it);
    TR.app.mutate(() => items.forEach((it) => {
      if (mark) it.aiFields = OUT_COLS.concat(['result', 'assignee', 'date']).filter((k) => k !== 'no' && it[k] && !(k === 'result' && it[k] === '未実施'));
      p.items.push(it);
      TR.app.pin(it);
    }));
    TR.app.gotoList(TR.state.filters);
    items.forEach((it) => TR.app.pin(it));
    TR.app.render();
    if (!TR.app.isMobile()) TR.grid.selectItem(items[0].id);
    ui.toast(`${items.length} 件を追加しました（色付きのセルは未確認）`, 'success', 4000);
  }

  TR.textImport = { start, _test: { parse, toItems, planAppend, planFill, buildNewPrompt, buildFillPrompt } };
})(window.TR);
