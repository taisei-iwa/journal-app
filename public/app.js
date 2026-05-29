// ---- 設定 ----
const VAULT_NAME = 'journal';

// Claude_KB 育成用タグ。textarea 末尾にワンタップで挿入される。
// 週次レビュー時に kb-* サブエージェントが Grep で拾う。
const KB_TAGS = ['#kb-hyogu', '#kb-kakephoto', '#kb'];

// ---- 選択肢定義(集計しやすくするためのカテゴリ・タグ) ----
const BUSINESS_CATEGORIES = ['掛軸', '額', '屏風', '障子襖', '表具その他', 'かけフォト', '副業', 'その他'];
const LEARNING_TAGS = ['技術', '顧客対応', '経営', '材料', '段取り', 'その他'];
const REVIEW_TAGS = ['技術', '顧客対応', '経営', '材料', '段取り', '判断', 'その他'];
const CUSTOMER_ACTIVITY_TYPES = ['問合せ', '見積もり', '打合せ', '受注', '納品', 'アフター'];
// Apple 設計言語への移行で絵文字を廃止し、段階バーの SVG + 言葉ラベルに置換。
// Obsidian 保存時はラベル + n/5 で残す。
const ENERGY_LABELS = ['低', '弱', '中', '強', '高'];
const ARTIST_ERAS = ['江戸', '明治', '大正', '昭和', '平成', '令和', '不明'];
const ARTIST_FIELDS = ['書家', '画家', '茶人', 'その他'];

// ---- 状態 ----
const date = todayString();
let answers = {
  WORK: {
    // Daily Notes: 「最初から今日の仕事について書き出せる」ため、
    // did_work の既定値を 'y' にしておく。works ブロックが初回から表示される。
    // loadFromStorage で既存の保存があれば、そちらが優先される。
    did_work: 'y',
    works: [{}],
    customer_activities: [{}],
    artists: [{}],
    side_project: {},
    failure: { text: '', tags: [] },
    good: { text: '', tags: [] },
  },
};
let currentSection = 'WORK';

// ---- 日付ヘルパー ----
function todayString() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
function dayName(s) {
  return ['日', '月', '火', '水', '木', '金', '土'][new Date(s).getDay()];
}
function dayNameEn(s) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(s).getDay()];
}
function formatDateJP(s) {
  const [y, m, d] = s.split('-');
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}
function displayVal(v) {
  return v === 'y' ? 'あり' : v === 'n' ? 'なし' : (v && String(v).trim()) ? String(v).trim() : '—';
}
function splitLines(s) {
  return (s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}

// ---- localStorage ----
function persist() {
  localStorage.setItem(`journal-${date}`, JSON.stringify(answers));
}
function loadFromStorage() {
  const saved = localStorage.getItem(`journal-${date}`);
  if (!saved) return;
  answers = JSON.parse(saved);
  // 互換処理
  if (!answers.WORK) answers.WORK = {};
  if (!answers.WORK.works)               answers.WORK.works = [{}];
  if (!answers.WORK.customer_activities) answers.WORK.customer_activities = [{}];
  if (!answers.WORK.artists)             answers.WORK.artists = [{}];
  if (!answers.WORK.side_project)        answers.WORK.side_project = {};
  // 旧 failure: string → { text, tags }
  if (typeof answers.WORK.failure === 'string') {
    answers.WORK.failure = { text: answers.WORK.failure, tags: [] };
  }
  if (!answers.WORK.failure || typeof answers.WORK.failure !== 'object') {
    answers.WORK.failure = { text: '', tags: [] };
  }
  if (!answers.WORK.good || typeof answers.WORK.good !== 'object') {
    answers.WORK.good = { text: '', tags: [] };
  }
  if (!Array.isArray(answers.WORK.failure.tags)) answers.WORK.failure.tags = [];
  if (!Array.isArray(answers.WORK.good.tags))    answers.WORK.good.tags = [];
}

// ---- Obsidian URI生成 ----
function obsidianURI(filePath, content) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const encodedVault = encodeURIComponent(VAULT_NAME);
  const encodedContent = encodeURIComponent(content);
  return `obsidian://new?vault=${encodedVault}&file=${encodedPath}&content=${encodedContent}&overwrite=true`;
}

// ---- 共通: 入力ヘルパー ----
function autosize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
function attachFocusScroll(el) {
  el.addEventListener('focus', () => {
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
  });
}
function createKbChipRow(textarea) {
  const wrap = document.createElement('div');
  wrap.className = 'kb-chips';
  KB_TAGS.forEach(tag => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'kb-chip';
    chip.textContent = tag;
    chip.addEventListener('click', () => {
      const cur = textarea.value || '';
      if (cur.includes(tag)) return;
      const sep = cur.length === 0 || /[\s\n]$/.test(cur) ? '' : ' ';
      textarea.value = cur + sep + tag;
      textarea.dispatchEvent(new Event('input'));
      textarea.focus();
    });
    wrap.appendChild(chip);
  });
  return wrap;
}
function attachKbChips(textarea) {
  requestAnimationFrame(() => {
    if (textarea.parentNode) {
      textarea.insertAdjacentElement('afterend', createKbChipRow(textarea));
    }
  });
}
function makeInput(value, onChange, opts = {}) {
  const el = document.createElement(opts.tag || 'input');
  if (!opts.tag || opts.tag === 'input') el.type = opts.inputType || 'text';
  if (opts.tag === 'textarea') el.rows = opts.rows || 2;
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.min !== undefined) el.min = opts.min;
  el.value = value || '';
  let timer;
  const save = () => onChange(el.value);
  el.addEventListener('input', () => {
    if (opts.tag === 'textarea') autosize(el);
    clearTimeout(timer); timer = setTimeout(save, 800);
  });
  el.addEventListener('blur', save);
  attachFocusScroll(el);
  if (opts.tag === 'textarea') {
    requestAnimationFrame(() => autosize(el));
    attachKbChips(el);
  }
  return el;
}
function makeChip(label, selected, onClick, multi) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip' + (multi ? ' multi' : '') + (selected ? ' on' : '');
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}
function renderSingleChoiceChips(container, options, currentValue, onSelect) {
  const group = document.createElement('div');
  group.className = 'chips';
  let selected = currentValue || '';
  const chips = [];
  options.forEach(opt => {
    const chip = makeChip(opt, selected === opt, () => {
      selected = selected === opt ? '' : opt;
      chips.forEach(c => c.classList.toggle('on', c.dataset.value === selected));
      onSelect(selected);
    });
    chip.dataset.value = opt;
    chips.push(chip);
    group.appendChild(chip);
  });
  container.appendChild(group);
  return group;
}
function renderMultiChoiceChips(container, options, currentValues, onChange) {
  const values = Array.isArray(currentValues) ? [...currentValues] : [];
  const group = document.createElement('div');
  group.className = 'chips';
  options.forEach(opt => {
    const chip = makeChip(opt, values.includes(opt), () => {
      const idx = values.indexOf(opt);
      if (idx >= 0) values.splice(idx, 1); else values.push(opt);
      chip.classList.toggle('on', values.includes(opt));
      onChange([...values]);
    }, true);
    group.appendChild(chip);
  });
  container.appendChild(group);
  return group;
}

// ---- コンテンツ生成 ----
function generateJournalContent() {
  const w = answers.WORK || {};
  const works = (w.works || []).filter(wk => wk.content?.trim());
  const customers = (w.customer_activities || []).filter(c => c.name?.trim());
  const dateJP = formatDateJP(date);
  const day = dayNameEn(date);
  const lines = [
    '---', `date: ${date}`, `day: ${day}`, '---', '',
    `# ${dateJP}（${day}）`, '',
  ];

  // 今日(エネルギー)
  if (w.energy) {
    lines.push('## 今日', `- エネルギー: ${ENERGY_LABELS[w.energy - 1]} (${w.energy}/5)`, '');
  }

  // 仕事
  lines.push('## 仕事', `- 仕事: ${displayVal(w.did_work)}`);
  if (w.did_work === 'y') {
    works.forEach((wk, i) => {
      const prefix = works.length > 1 ? `- 仕事${i + 1}: ` : '- 内容: ';
      lines.push(`${prefix}${wk.content.trim()}`);
      if (wk.category) lines.push(`  - 事業: ${wk.category}`);
      if (wk.duration) lines.push(`  - 所要時間: ${wk.duration}分`);
      if (wk.learning?.trim()) {
        const tags = (wk.learning_tags || []).join(', ');
        lines.push(`  - 学び: ${wk.learning.trim()}${tags ? ` [${tags}]` : ''}`);
      }
    });
  }
  lines.push('');

  // 顧客活動
  lines.push('## 顧客活動', `- やり取り: ${displayVal(w.had_customer_contact)}`);
  if (w.had_customer_contact === 'y') {
    customers.forEach((c, i) => {
      const prefix = customers.length > 1 ? `- 活動${i + 1}: ` : '- 顧客: ';
      lines.push(`${prefix}${c.name.trim()}`);
      if (c.activity_type) lines.push(`  - 種別: ${c.activity_type}`);
      if (c.content?.trim()) lines.push(`  - 内容: ${c.content.trim()}`);
      if (c.price?.trim()) lines.push(`  - 金額: ${c.price.trim()}`);
    });
  }
  lines.push('');

  // 副業
  if (w.did_sideproject === 'y') {
    const sp = w.side_project || {};
    lines.push('## 副業(AI)');
    if (sp.content?.trim()) lines.push(`- 内容: ${sp.content.trim()}`);
    if (sp.progress) lines.push(`- 進捗: ${'★'.repeat(sp.progress)}${'☆'.repeat(5 - sp.progress)} (${sp.progress}/5)`);
    const nextItems = splitLines(sp.next_step);
    if (nextItems.length === 1) {
      lines.push(`- 次の一歩: ${nextItems[0]}`);
    } else if (nextItems.length > 1) {
      lines.push('- 次の一歩:');
      nextItems.forEach(it => lines.push(`  - ${it}`));
    }
    lines.push('');
  }

  // 振り返り
  const f = w.failure || { text: '', tags: [] };
  const g = w.good || { text: '', tags: [] };
  if ((f.text && f.text.trim()) || (g.text && g.text.trim())) {
    lines.push('## 振り返り');
    if (f.text?.trim()) {
      const tags = (f.tags || []).join(', ');
      lines.push(`- 失敗: ${f.text.trim()}${tags ? ` [${tags}]` : ''}`);
    }
    if (g.text?.trim()) {
      const tags = (g.tags || []).join(', ');
      lines.push(`- 良かったこと: ${g.text.trim()}${tags ? ` [${tags}]` : ''}`);
    }
    lines.push('');
  }

  // 計画
  if (w.tomorrow_plan?.trim()) {
    lines.push('## 計画', `- 明日の予定: ${w.tomorrow_plan.trim()}`, '');
  }

  // 作家
  const artists = (w.artists || []).filter(a => a.name?.trim());
  if (artists.length > 0) {
    lines.push('## 覚える作家');
    artists.forEach(a => {
      const meta = [a.era, a.field].filter(Boolean).join(' / ');
      lines.push(`- ${a.name.trim()}${meta ? ` (${meta})` : ''}`);
      if (a.memo?.trim()) lines.push(`  - ${a.memo.trim()}`);
    });
  }
  return lines.join('\n') + '\n';
}

function generateInsightContent() {
  const works = answers.WORK?.works || [];
  const items = works
    .filter(w => w.learning?.trim())
    .map(w => ({ text: w.learning.trim(), tags: (w.learning_tags || []).join(', '), category: w.category || '' }));
  if (items.length === 0) return null;
  const dateJP = formatDateJP(date);
  const day = dayNameEn(date);
  const lines = ['---', `date: ${date}`, 'tags: [気づき, 仕事]', '---', '', `# ${dateJP}（${day}）仕事の学び`, ''];
  items.forEach(it => {
    const meta = [it.category, it.tags].filter(Boolean).join(' / ');
    lines.push(`- ${it.text}${meta ? ` [${meta}]` : ''}`);
  });
  return lines.join('\n') + '\n';
}

function generateFailureContent() {
  const f = answers.WORK?.failure || {};
  if (!f.text?.trim()) return null;
  const dateJP = formatDateJP(date);
  const day = dayNameEn(date);
  const tags = (f.tags || []).join(', ');
  return ['---', `date: ${date}`, 'tags: [失敗, 仕事]', '---', '',
    `# ${dateJP}（${day}）失敗したこと`, '', `- ${f.text.trim()}${tags ? ` [${tags}]` : ''}`, ''].join('\n');
}

function generateGoodContent() {
  const g = answers.WORK?.good || {};
  if (!g.text?.trim()) return null;
  const dateJP = formatDateJP(date);
  const day = dayNameEn(date);
  const tags = (g.tags || []).join(', ');
  return ['---', `date: ${date}`, 'tags: [良かったこと, 仕事]', '---', '',
    `# ${dateJP}（${day}）良かったこと`, '', `- ${g.text.trim()}${tags ? ` [${tags}]` : ''}`, ''].join('\n');
}

function generateSideProjectContent() {
  const sp = answers.WORK?.side_project || {};
  if (!sp.content?.trim() && !sp.next_step?.trim()) return null;
  const dateJP = formatDateJP(date);
  const day = dayNameEn(date);
  const lines = ['---', `date: ${date}`, 'tags: [副業, AI]', '---', '', `# ${dateJP}（${day}）副業ログ`, ''];
  if (sp.content?.trim()) lines.push(`- 内容: ${sp.content.trim()}`);
  if (sp.progress) lines.push(`- 進捗: ${'★'.repeat(sp.progress)}${'☆'.repeat(5 - sp.progress)} (${sp.progress}/5)`);
  const nextItems = splitLines(sp.next_step);
  if (nextItems.length === 1) {
    lines.push(`- 次の一歩: ${nextItems[0]}`);
  } else if (nextItems.length > 1) {
    lines.push('- 次の一歩:');
    nextItems.forEach(it => lines.push(`  - ${it}`));
  }
  return lines.join('\n') + '\n';
}

function artistRow(yomi) {
  if (!yomi) return 'その他';
  const ch = yomi.trim()[0];
  const map = [
    ['あ行', 'あいうえおぁぃぅぇぉアイウエオァィゥェォ'],
    ['か行', 'かきくけこがぎぐげごカキクケコガギグゲゴ'],
    ['さ行', 'さしすせそざじずぜぞサシスセソザジズゼゾ'],
    ['た行', 'たちつてとだぢづでどタチツテトダヂヅデド'],
    ['な行', 'なにぬねのナニヌネノ'],
    ['は行', 'はひふへほばびぶべぼぱぴぷぺぽハヒフヘホバビブベボパピプペポ'],
    ['ま行', 'まみむめもマミムメモ'],
    ['や行', 'やゆよャュョヤユヨ'],
    ['ら行', 'らりるれろラリルレロ'],
    ['わ行', 'わをんワヲン'],
  ];
  for (const [row, chars] of map) {
    if (chars.includes(ch)) return row;
  }
  return 'その他';
}

function generateArtistContent(artist) {
  const name = artist.name.trim();
  const meta = [artist.era, artist.field].filter(Boolean).join(' / ');
  const lines = ['---', `name: ${name}`, 'tags: [作家]'];
  if (artist.era) lines.push(`era: ${artist.era}`);
  if (artist.field) lines.push(`field: ${artist.field}`);
  lines.push('---', '', `# ${name}${meta ? ` (${meta})` : ''}`, '');
  if (artist.memo?.trim()) lines.push(artist.memo.trim(), '');
  return lines.join('\n');
}

function artistFilePath(artist) {
  const row = artistRow(artist.yomi);
  return `作家/${row}/${artist.name.trim()}`;
}

function generateCustomerFileContent(activity) {
  const name = activity.name.trim();
  const dateJP = formatDateJP(date);
  const lines = ['---', `date: ${date}`, `customer: ${name}`, 'tags: [顧客]', '---', '',
    `# ${name} - ${dateJP}`, '', `## ${activity.activity_type || '活動'}`];
  if (activity.content?.trim()) lines.push(`- 内容: ${activity.content.trim()}`);
  if (activity.price?.trim()) lines.push(`- 金額: ${activity.price.trim()}`);
  lines.push('');
  return lines.join('\n');
}

// ---- ファイルパス ----
function journalPath()    { const [y, m] = date.split('-'); return `日誌/${y}-${m}/${date}`; }
function insightPath()    { return `気づき/${date}_仕事の学び`; }
function failurePath()    { return `失敗/${date}_失敗したこと`; }
function goodPath()       { return `気づき/${date}_良かったこと`; }
function sideProjectPath(){ return `副業/${date}`; }
function customerFilePath(name) { return `顧客/${name}_${date}`; }

// ---- 保存パネル ----
// 1 ファイル統合: generateJournalContent() に全要素(仕事/顧客/副業/振り返り/計画/作家)を
// 構造化 Markdown でまとめる。気づき/失敗/顧客/作家への振り分けは週次レビュー
// (Claude_KB の kb-* サブエージェント)が担当する。
function showSavePanel() {
  const apply = () => {
    document.getElementById('tab-nav').classList.add('hidden');
    document.getElementById('section-WORK').classList.add('hidden');
    const panel = document.getElementById('section-save');
    panel.classList.remove('hidden');

    const list = document.getElementById('save-buttons-list');
    list.innerHTML = '';

    addSaveLink(list, 'Obsidian で日誌を開く', journalPath(), generateJournalContent());

    // a11y: パネル表示後、最初の操作対象にフォーカスを移す
    // (キーボードユーザがヘッダーから Tab で辿らず済む)
    requestAnimationFrame(() => {
      const first = panel.querySelector('a, button');
      if (first) first.focus();
    });
  };

  // View Transitions: 入力 → 保存パネルの遷移を視覚的につなぐ
  if (document.startViewTransition) {
    document.startViewTransition(apply);
  } else {
    apply();
  }
}

function addSaveLink(container, label, filePath, content) {
  const savedKey = `saved-${date}-${filePath}`;
  const alreadySaved = localStorage.getItem(savedKey);
  const a = document.createElement('a');
  a.href = obsidianURI(filePath, content);
  a.className = 'save-link' + (alreadySaved ? ' done' : '');

  // a11y: ラベルと矢印を分離。矢印は装飾扱い(SR に読ませない)
  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  a.appendChild(labelSpan);

  const arrow = document.createElement('span');
  arrow.textContent = ' →';
  arrow.setAttribute('aria-hidden', 'true');
  a.appendChild(arrow);

  // a11y: ✓ は CSS の ::before で視覚化、SR には aria-label で状態を伝える
  a.setAttribute('aria-label', alreadySaved ? `保存済み: ${label}` : label);

  a.addEventListener('click', () => {
    localStorage.setItem(savedKey, '1');
    setTimeout(() => {
      a.classList.add('done');
      a.setAttribute('aria-label', `保存済み: ${label}`);
      // a11y: ライブ領域でアナウンス
      const announce = document.getElementById('sr-announce');
      if (announce) announce.textContent = '日誌を保存しました';
    }, 300);
  });
  container.appendChild(a);
  return a;
}

// ============================================================
//  Washi craft-futurism レンダリング層
//  セクション = アイコン + 明朝見出し + すりガラスカード。
//  データ構造 / 保存ロジック(上部)は一切変更していない。
// ============================================================

// ---- SVG パーツ ----
const TICK_SVG = '<svg class="tick" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLUS_SVG = '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 2v11M2 7.5h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const TRASH_SVG = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2.5 4h11M6 4V2.6h4V4M4 4l.6 9.4h6.8L12 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const SECTION_ICONS = {
  mood: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M4 18l4-6 4 3 4-7 4 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  work: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="13" rx="2.4" stroke="currentColor" stroke-width="2"/><path d="M8.5 7V5.5A1.5 1.5 0 0110 4h4a1.5 1.5 0 011.5 1.5V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  customer: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="2"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  side: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L12 15.6 7 18.8l1.2-5.6L4 9.4l5.6-.6L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  review: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.5 8.5 0 11-3.3-6.7M21 4v4h-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plan: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="16" rx="3" stroke="currentColor" stroke-width="2"/><path d="M4 9h16M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  artist: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15.5L5.5 18A1.5 1.5 0 014 16.5v-11ZM20 5.5C20 4.7 19.3 4 18.5 4H13v15.5L18.5 18a1.5 1.5 0 001.5-1.5v-11Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};

const SECTION_META = [
  { id: 'mood', icon: 'mood', title: '今日の調子' },
  { id: 'work', icon: 'work', title: '仕事' },
  { id: 'customer', icon: 'customer', title: '顧客活動' },
  { id: 'side', icon: 'side', title: '副業 / AI開発' },
  { id: 'review', icon: 'review', title: 'ふりかえり' },
  { id: 'plan', icon: 'plan', title: '明日の計画' },
  { id: 'artist', icon: 'artist', title: '覚える作家' },
];

// ---- UI プリミティブ ----
function makeSectionCard(meta) {
  const card = document.createElement('section');
  card.className = 'card';
  card.id = `card-${meta.id}`;

  const head = document.createElement('div');
  head.className = 'section-head';
  const ic = document.createElement('span');
  ic.className = 'section-ic';
  ic.innerHTML = SECTION_ICONS[meta.icon];
  const title = document.createElement('span');
  title.className = 'section-title';
  title.textContent = meta.title;
  const sub = document.createElement('span');
  sub.className = 'section-sub';
  head.append(ic, title, sub);
  card.appendChild(head);

  const body = document.createElement('div');
  card.appendChild(body);

  card._sub = sub;
  card._body = body;
  return card;
}

function gateQ(text) {
  const p = document.createElement('p');
  p.className = 'gate-q';
  p.textContent = text;
  return p;
}

function makeField(labelText, opt) {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement('div');
  l.className = 'field-label';
  l.textContent = labelText;
  if (opt) {
    const o = document.createElement('span');
    o.className = 'opt';
    o.textContent = opt;
    l.appendChild(o);
  }
  f.appendChild(l);
  return f;
}

function makeSeg(value, onChange) {
  const g = document.createElement('div');
  g.className = 'seg';
  const yes = document.createElement('button');
  const no = document.createElement('button');
  const mk = (b, val, label, cls) => {
    b.type = 'button';
    b.className = cls + (value === val ? ' on' : '');
    b.innerHTML = TICK_SVG + '<span>' + label + '</span>';
    b.addEventListener('click', () => {
      // タップごとに両ボタンの点灯状態を更新(これが無いと色が変わらない)
      yes.classList.toggle('on', val === 'y');
      no.classList.toggle('on', val === 'n');
      onChange(val);
    });
  };
  mk(yes, 'y', 'はい', 'yes');
  mk(no, 'n', 'いいえ', 'no');
  g.append(yes, no);
  return g;
}

function makeGauge(value, onChange) {
  const H = [8, 11, 14, 18, 22];
  const g = document.createElement('div');
  g.className = 'gauge';
  const btns = [];
  [1, 2, 3, 4, 5].forEach(n => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = value === n ? 'on' : '';
    b.setAttribute('aria-label', `エネルギー ${ENERGY_LABELS[n - 1]} ${n}/5`);
    const bars = document.createElement('span');
    bars.className = 'bars';
    [0, 1, 2, 3, 4].forEach(k => {
      const i = document.createElement('i');
      if (k < n) i.className = 'lit';
      i.style.height = H[k] + 'px';
      bars.appendChild(i);
    });
    const lab = document.createElement('span');
    lab.className = 'glabel';
    lab.textContent = ENERGY_LABELS[n - 1];
    b.append(bars, lab);
    b.addEventListener('click', () => {
      btns.forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      onChange(n);
    });
    btns.push(b);
    g.appendChild(b);
  });
  return g;
}

function makeSubItem(index, count, label, onDelete) {
  const d = document.createElement('div');
  d.className = 'subitem reveal';
  if (count > 1) {
    const head = document.createElement('div');
    head.className = 'subitem-head';
    const no = document.createElement('span');
    no.className = 'subitem-no';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(index + 1);
    no.appendChild(badge);
    no.appendChild(document.createTextNode(label));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del-btn';
    del.innerHTML = TRASH_SVG + '削除';
    del.addEventListener('click', onDelete);
    head.append(no, del);
    d.appendChild(head);
  }
  return d;
}

function makeAddBtn(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'add-btn';
  b.innerHTML = PLUS_SVG + '<span>' + label + '</span>';
  b.addEventListener('click', onClick);
  return b;
}

// ---- セクション参照(サブ見出しの更新と再描画用) ----
const sectionRefs = {};
function sectionSub(id) {
  const w = answers.WORK || {};
  switch (id) {
    case 'mood': return w.energy ? `${ENERGY_LABELS[w.energy - 1]} · ${w.energy}/5` : '未入力';
    case 'work': return w.did_work === 'y' ? `${(w.works || []).length}件` : '';
    case 'customer': return w.had_customer_contact === 'y' ? `${(w.customer_activities || []).length}件` : '';
    case 'artist': return `${(w.artists || []).length}名`;
    default: return '';
  }
}
function refreshSub(id) {
  if (sectionRefs[id]) sectionRefs[id].sub.textContent = sectionSub(id);
}

// ---- ビルダー: 調子 ----
function buildMood(body) {
  body.innerHTML = '';
  const w = answers.WORK;
  body.appendChild(makeGauge(w.energy, (n) => {
    w.energy = n; persist(); refreshSub('mood');
  }));
}

// ---- ビルダー: 仕事 ----
function fillWorkReveal(reveal) {
  reveal.innerHTML = '';
  const w = answers.WORK;
  if (w.did_work !== 'y') return;
  reveal.classList.add('reveal');
  if (!w.works || w.works.length === 0) w.works = [{}];
  const works = w.works;
  works.forEach((work, i) => {
    const si = makeSubItem(i, works.length, '仕事', () => {
      works.splice(i, 1); persist(); fillWorkReveal(reveal); refreshSub('work');
    });
    let f = makeField('事業カテゴリ');
    renderSingleChoiceChips(f, BUSINESS_CATEGORIES, work.category, (v) => { work.category = v; persist(); });
    si.appendChild(f);

    f = makeField('どんな仕事をした？');
    f.appendChild(makeInput(work.content, (v) => { work.content = v; persist(); }, { tag: 'textarea', placeholder: '今日の作業を書き留めましょう…' }));
    si.appendChild(f);

    f = makeField('所要時間', '分・任意');
    f.appendChild(makeInput(work.duration, (v) => { work.duration = v; persist(); }, { inputType: 'number', min: 0, placeholder: '例: 60' }));
    si.appendChild(f);

    f = makeField('学んだことは？', '任意');
    f.appendChild(makeInput(work.learning, (v) => { work.learning = v; persist(); }, { tag: 'textarea', placeholder: '気づきや学びをひとつ…' }));
    si.appendChild(f);

    f = makeField('学びのカテゴリ', '複数選択可');
    renderMultiChoiceChips(f, LEARNING_TAGS, work.learning_tags || [], (vs) => { work.learning_tags = vs; persist(); });
    si.appendChild(f);

    reveal.appendChild(si);
  });
  reveal.appendChild(makeAddBtn('仕事を追加', () => {
    works.push({}); persist(); fillWorkReveal(reveal); refreshSub('work');
  }));
}
function buildWork(body) {
  body.innerHTML = '';
  const w = answers.WORK;
  body.appendChild(gateQ('今日は仕事をした？'));
  const reveal = document.createElement('div');
  body.appendChild(makeSeg(w.did_work, (v) => {
    w.did_work = v; persist(); fillWorkReveal(reveal); refreshSub('work');
  }));
  body.appendChild(reveal);
  fillWorkReveal(reveal);
}

// ---- ビルダー: 顧客活動 ----
function fillCustomerReveal(reveal) {
  reveal.innerHTML = '';
  const w = answers.WORK;
  if (w.had_customer_contact !== 'y') return;
  reveal.classList.add('reveal');
  if (!w.customer_activities || w.customer_activities.length === 0) w.customer_activities = [{}];
  const list = w.customer_activities;
  list.forEach((c, i) => {
    const si = makeSubItem(i, list.length, '活動', () => {
      list.splice(i, 1); persist(); fillCustomerReveal(reveal); refreshSub('customer');
    });
    let f = makeField('お客様の名前は？');
    f.appendChild(makeInput(c.name, (v) => { c.name = v; persist(); }, { placeholder: '例: 山田様' }));
    si.appendChild(f);

    f = makeField('活動の種別');
    renderSingleChoiceChips(f, CUSTOMER_ACTIVITY_TYPES, c.activity_type, (v) => { c.activity_type = v; persist(); });
    si.appendChild(f);

    f = makeField('内容');
    f.appendChild(makeInput(c.content, (v) => { c.content = v; persist(); }, { tag: 'textarea', placeholder: 'やり取りの内容…' }));
    si.appendChild(f);

    f = makeField('金額', '任意');
    f.appendChild(makeInput(c.price, (v) => { c.price = v; persist(); }, { placeholder: '例: 16,500円' }));
    si.appendChild(f);

    reveal.appendChild(si);
  });
  reveal.appendChild(makeAddBtn('顧客活動を追加', () => {
    list.push({}); persist(); fillCustomerReveal(reveal); refreshSub('customer');
  }));
}
function buildCustomer(body) {
  body.innerHTML = '';
  const w = answers.WORK;
  body.appendChild(gateQ('今日、顧客とのやり取りはあった？'));
  const reveal = document.createElement('div');
  body.appendChild(makeSeg(w.had_customer_contact, (v) => {
    w.had_customer_contact = v; persist(); fillCustomerReveal(reveal); refreshSub('customer');
  }));
  body.appendChild(reveal);
  fillCustomerReveal(reveal);
}

// ---- ビルダー: 副業 / AI ----
function fillSideReveal(reveal) {
  reveal.innerHTML = '';
  const w = answers.WORK;
  if (w.did_sideproject !== 'y') return;
  reveal.classList.add('reveal');
  if (!w.side_project) w.side_project = {};
  const sp = w.side_project;

  let f = makeField('今日やった内容');
  f.appendChild(makeInput(sp.content, (v) => { sp.content = v; persist(); }, { tag: 'textarea', placeholder: '実装・検証したこと…' }));
  reveal.appendChild(f);

  f = makeField('進捗', '1〜5');
  const row = document.createElement('div');
  row.className = 'chips';
  [1, 2, 3, 4, 5].forEach(n => {
    const b = makeChip(String(n), sp.progress === n, () => {
      sp.progress = n; persist();
      row.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    }, true);
    b.style.minWidth = '44px';
    b.style.justifyContent = 'center';
    row.appendChild(b);
  });
  f.appendChild(row);
  reveal.appendChild(f);

  f = makeField('次の一歩', '1行1項目');
  f.appendChild(makeInput(sp.next_step, (v) => { sp.next_step = v; persist(); }, { tag: 'textarea', placeholder: '例:\n作家名を覚える仕組みを作る\nカテゴリのバグを直す' }));
  reveal.appendChild(f);
}
function buildSide(body) {
  body.innerHTML = '';
  const w = answers.WORK;
  body.appendChild(gateQ('今日、副業（AI開発）に取り組んだ？'));
  const reveal = document.createElement('div');
  body.appendChild(makeSeg(w.did_sideproject, (v) => {
    w.did_sideproject = v; persist(); fillSideReveal(reveal);
  }));
  body.appendChild(reveal);
  fillSideReveal(reveal);
}

// ---- ビルダー: ふりかえり ----
function buildReview(body) {
  body.innerHTML = '';
  const w = answers.WORK;
  if (!w.failure || typeof w.failure !== 'object') w.failure = { text: '', tags: [] };
  if (!w.good || typeof w.good !== 'object') w.good = { text: '', tags: [] };
  if (!Array.isArray(w.failure.tags)) w.failure.tags = [];
  if (!Array.isArray(w.good.tags)) w.good.tags = [];

  const block = (data, labelText, opt, placeholder) => {
    const f = makeField(labelText, opt);
    f.appendChild(makeInput(data.text, (v) => { data.text = v; persist(); }, { tag: 'textarea', placeholder }));
    const tagWrap = document.createElement('div');
    tagWrap.style.marginTop = '10px';
    renderMultiChoiceChips(tagWrap, REVIEW_TAGS, data.tags, (vs) => { data.tags = vs; persist(); });
    f.appendChild(tagWrap);
    return f;
  };
  body.appendChild(block(w.failure, '失敗 / 反省点', '任意', 'うまくいかなかったこと…'));
  body.appendChild(block(w.good, '今日の良かったこと', '任意', 'うまくいったこと・嬉しかったこと…'));
}

// ---- ビルダー: 明日の計画 ----
function buildPlan(body) {
  body.innerHTML = '';
  const w = answers.WORK;
  const f = makeField('明日の仕事の予定は？');
  f.appendChild(makeInput(w.tomorrow_plan, (v) => { w.tomorrow_plan = v; persist(); }, { tag: 'textarea', placeholder: '明日やることを書き出す…' }));
  body.appendChild(f);
}

// ---- ビルダー: 覚える作家 ----
function buildArtist(body) {
  body.innerHTML = '';
  const w = answers.WORK;
  if (!w.artists || w.artists.length === 0) w.artists = [{}];
  const list = w.artists;
  list.forEach((artist, i) => {
    const si = makeSubItem(i, list.length, '作家', () => {
      list.splice(i, 1); persist(); buildArtist(body); refreshSub('artist');
    });
    let f = makeField('作家名');
    f.appendChild(makeInput(artist.name, (v) => { artist.name = v; persist(); }, { placeholder: '例: 富岡鉄斎' }));
    si.appendChild(f);

    f = makeField('よみ', 'ひらがな');
    f.appendChild(makeInput(artist.yomi, (v) => { artist.yomi = v; persist(); }, { placeholder: '例: とみおかてっさい' }));
    si.appendChild(f);

    f = makeField('時代');
    renderSingleChoiceChips(f, ARTIST_ERAS, artist.era, (v) => { artist.era = v; persist(); });
    si.appendChild(f);

    f = makeField('分野');
    renderSingleChoiceChips(f, ARTIST_FIELDS, artist.field, (v) => { artist.field = v; persist(); });
    si.appendChild(f);

    f = makeField('メモ');
    f.appendChild(makeInput(artist.memo, (v) => { artist.memo = v; persist(); }, { tag: 'textarea', placeholder: '特徴・覚えておきたいこと…' }));
    si.appendChild(f);

    body.appendChild(si);
  });
  body.appendChild(makeAddBtn('作家を追加', () => {
    list.push({}); persist(); buildArtist(body); refreshSub('artist');
  }));
}

const BUILDERS = {
  mood: buildMood, work: buildWork, customer: buildCustomer,
  side: buildSide, review: buildReview, plan: buildPlan, artist: buildArtist,
};

// ---- セクション描画 ----
function renderSection(section) {
  const container = document.getElementById(`section-${section}`);
  container.innerHTML = '';
  Object.keys(sectionRefs).forEach(k => delete sectionRefs[k]);

  SECTION_META.forEach(meta => {
    const card = makeSectionCard(meta);
    sectionRefs[meta.id] = { card, body: card._body, sub: card._sub };
    BUILDERS[meta.id](card._body);
    card._sub.textContent = sectionSub(meta.id);
    container.appendChild(card);
  });
}

// ---- タブ切替(単一セクション WORK) ----
function switchTab(section) {
  currentSection = section;
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.section === section)
  );
  document.getElementById('section-WORK').classList.toggle('hidden', section !== 'WORK');
}

// ---- 初期化 ----
function init() {
  loadFromStorage();

  document.getElementById('date-display').textContent =
    `${formatDateJP(date)}（${dayName(date)}）`;

  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.section))
  );

  document.getElementById('header-save-btn').addEventListener('click', showSavePanel);

  document.getElementById('back-btn').addEventListener('click', () => {
    const apply = () => {
      document.getElementById('tab-nav').classList.remove('hidden');
      document.getElementById('section-save').classList.add('hidden');
      switchTab(currentSection);
    };
    if (document.startViewTransition) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  });

  renderSection('WORK');
}

init();
