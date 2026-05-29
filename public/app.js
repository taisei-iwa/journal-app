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

// ---- 質問定義 ----
const QUESTIONS = {
  WORK: [
    { id: 'energy', text: '今日のエネルギー', type: 'scale5' },
    { id: 'did_work', text: '今日は仕事をした？', type: 'yn' },
    { id: 'works', type: 'works_list', showIf: { id: 'did_work', value: 'y' } },
    { id: 'had_customer_contact', text: '今日、顧客とのやり取りはあった？', type: 'yn' },
    { id: 'customer_activities', type: 'customer_activities_list', showIf: { id: 'had_customer_contact', value: 'y' } },
    { id: 'did_sideproject', text: '今日、副業(AI開発)に取り組んだ？', type: 'yn' },
    { id: 'side_project', type: 'side_project_block', showIf: { id: 'did_sideproject', value: 'y' } },
    { id: 'failure', type: 'failure_block' },
    { id: 'good', type: 'good_block' },
    { id: 'tomorrow_plan', text: '明日の仕事の予定は？', type: 'textarea' },
    { id: 'artists', type: 'artists_list' },
  ],
};

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
function makeFieldLabel(text) {
  const el = document.createElement('div');
  el.className = 'order-field-label';
  el.textContent = text;
  return el;
}
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
function makeChip(label, selected, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'yn-btn' + (selected ? ' selected-y' : '');
  btn.textContent = label;
  // .yn-btn の flex: 1 / padding: 14px を上書き(チップは自然幅・小さめパディング)
  btn.style.flex = '0 0 auto';
  btn.style.padding = '10px 14px';
  btn.style.fontSize = '14px';
  btn.style.margin = '4px 4px 0 0';
  btn.addEventListener('click', onClick);
  return btn;
}
function renderSingleChoiceChips(container, options, currentValue, onSelect) {
  const group = document.createElement('div');
  group.style.display = 'flex';
  group.style.flexWrap = 'wrap';
  let selected = currentValue || '';
  const chips = [];
  options.forEach(opt => {
    const chip = makeChip(opt, selected === opt, () => {
      selected = selected === opt ? '' : opt;
      chips.forEach(c => c.classList.toggle('selected-y', c.dataset.value === selected));
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
  group.style.display = 'flex';
  group.style.flexWrap = 'wrap';
  options.forEach(opt => {
    const chip = makeChip(opt, values.includes(opt), () => {
      const idx = values.indexOf(opt);
      if (idx >= 0) values.splice(idx, 1); else values.push(opt);
      chip.classList.toggle('selected-y', values.includes(opt));
      onChange([...values]);
    });
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

// ---- レンダラー: scale5(1-5 段階ゲージ) ----
// 各ボタンに「5 本の縦バー、最初の level 本だけ塗る」アイコン + 数字 + 言葉ラベルを表示。
// SF Symbols の chart.bar / gauge 系の見せ方を踏襲。
function energyGaugeSvg(level) {
  const heights = [5, 8, 11, 14, 17];
  const bars = [1, 2, 3, 4, 5].map(idx => {
    const filled = idx <= level;
    const h = heights[idx - 1];
    const y = 18 - h;
    const fillCls = filled ? 'scale5-bar scale5-bar-on' : 'scale5-bar scale5-bar-off';
    return `<rect class="${fillCls}" x="${(idx - 1) * 5 + 1}" y="${y}" width="3" height="${h}" rx="1"/>`;
  }).join('');
  return `<svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">${bars}</svg>`;
}

function renderScale5InCard(section, q, card) {
  const lbl = document.createElement('div');
  lbl.className = 'question-label';
  lbl.textContent = q.text;
  card.appendChild(lbl);

  const group = document.createElement('div');
  group.className = 'yn-group scale5-group';
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yn-btn scale5-btn';
    btn.setAttribute('aria-label', `エネルギー ${ENERGY_LABELS[i - 1]} ${i}/5`);
    btn.innerHTML = `${energyGaugeSvg(i)}<span class="scale5-num">${i}</span>`;
    if ((answers[section] || {})[q.id] === i) btn.classList.add('selected-y');
    btn.addEventListener('click', () => {
      answers[section] = answers[section] || {};
      answers[section][q.id] = i;
      persist();
      group.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected-y'));
      btn.classList.add('selected-y');
    });
    group.appendChild(btn);
  }
  card.appendChild(group);
}

// ---- レンダラー: 仕事リスト(事業カテゴリ・所要時間・学び・学びタグ付き) ----
function renderWorksInCard(section, card) {
  function getWorks() {
    if (!answers[section]) answers[section] = {};
    if (!answers[section].works || answers[section].works.length === 0) answers[section].works = [{}];
    return answers[section].works;
  }
  function refresh() {
    card.innerHTML = '';
    const works = getWorks();
    works.forEach((work, i) => {
      const item = document.createElement('div');
      item.className = 'order-item';

      const header = document.createElement('div');
      header.className = 'order-item-header';
      const num = document.createElement('span');
      num.textContent = works.length > 1 ? `仕事 ${i + 1}` : '仕事';
      header.appendChild(num);
      if (works.length > 1) {
        const del = document.createElement('button');
        del.textContent = '削除';
        del.className = 'order-delete-btn';
        del.addEventListener('click', () => { works.splice(i, 1); persist(); refresh(); });
        header.appendChild(del);
      }
      item.appendChild(header);

      // 事業カテゴリ
      item.appendChild(makeFieldLabel('事業カテゴリ'));
      renderSingleChoiceChips(item, BUSINESS_CATEGORIES, work.category, (v) => { work.category = v; persist(); });

      // 内容
      item.appendChild(makeFieldLabel('どんな仕事をした？'));
      item.appendChild(makeInput(work.content, (v) => { work.content = v; persist(); }, { tag: 'textarea' }));

      // 所要時間
      item.appendChild(makeFieldLabel('所要時間（分・任意）'));
      item.appendChild(makeInput(work.duration, (v) => { work.duration = v; persist(); }, { inputType: 'number', min: 0, placeholder: '例: 60' }));

      // 学び
      item.appendChild(makeFieldLabel('学んだことは？（任意）'));
      item.appendChild(makeInput(work.learning, (v) => { work.learning = v; persist(); }, { tag: 'textarea' }));

      // 学びタグ
      item.appendChild(makeFieldLabel('学びのカテゴリ（任意・複数選択可）'));
      renderMultiChoiceChips(item, LEARNING_TAGS, work.learning_tags || [], (vs) => { work.learning_tags = vs; persist(); });

      if (i < works.length - 1) {
        item.style.borderBottom = '1px solid var(--border)';
        item.style.paddingBottom = '16px';
      }
      card.appendChild(item);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = '＋ 仕事を追加';
    addBtn.className = 'add-order-btn';
    addBtn.addEventListener('click', () => { getWorks().push({}); persist(); refresh(); });
    card.appendChild(addBtn);
  }
  refresh();
}

// ---- レンダラー: 顧客活動リスト ----
function renderCustomerActivitiesInCard(section, card) {
  function getList() {
    if (!answers[section]) answers[section] = {};
    if (!answers[section].customer_activities || answers[section].customer_activities.length === 0) {
      answers[section].customer_activities = [{}];
    }
    return answers[section].customer_activities;
  }
  function refresh() {
    card.innerHTML = '';
    const list = getList();
    list.forEach((c, i) => {
      const item = document.createElement('div');
      item.className = 'order-item';

      const header = document.createElement('div');
      header.className = 'order-item-header';
      const num = document.createElement('span');
      num.textContent = list.length > 1 ? `活動 ${i + 1}` : '活動';
      header.appendChild(num);
      if (list.length > 1) {
        const del = document.createElement('button');
        del.textContent = '削除';
        del.className = 'order-delete-btn';
        del.addEventListener('click', () => { list.splice(i, 1); persist(); refresh(); });
        header.appendChild(del);
      }
      item.appendChild(header);

      item.appendChild(makeFieldLabel('お客様の名前は？'));
      item.appendChild(makeInput(c.name, (v) => { c.name = v; persist(); }));

      item.appendChild(makeFieldLabel('活動の種別'));
      renderSingleChoiceChips(item, CUSTOMER_ACTIVITY_TYPES, c.activity_type, (v) => { c.activity_type = v; persist(); });

      item.appendChild(makeFieldLabel('内容'));
      item.appendChild(makeInput(c.content, (v) => { c.content = v; persist(); }, { tag: 'textarea' }));

      item.appendChild(makeFieldLabel('金額（任意）'));
      item.appendChild(makeInput(c.price, (v) => { c.price = v; persist(); }, { placeholder: '例: 16,500円' }));

      if (i < list.length - 1) {
        item.style.borderBottom = '1px solid var(--border)';
        item.style.paddingBottom = '16px';
      }
      card.appendChild(item);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = '＋ 顧客活動を追加';
    addBtn.className = 'add-order-btn';
    addBtn.addEventListener('click', () => { getList().push({}); persist(); refresh(); });
    card.appendChild(addBtn);
  }
  refresh();
}

// ---- レンダラー: 副業ブロック ----
function renderSideProjectBlock(section, card) {
  if (!answers[section]) answers[section] = {};
  if (!answers[section].side_project) answers[section].side_project = {};
  const sp = answers[section].side_project;

  const title = document.createElement('div');
  title.className = 'question-label';
  title.textContent = '副業(AI開発)の今日';
  card.appendChild(title);

  card.appendChild(makeFieldLabel('今日やった内容'));
  card.appendChild(makeInput(sp.content, (v) => { sp.content = v; persist(); }, { tag: 'textarea' }));

  card.appendChild(makeFieldLabel('進捗（1-5）'));
  const group = document.createElement('div');
  group.className = 'yn-group';
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yn-btn';
    btn.textContent = String(i);
    if (sp.progress === i) btn.classList.add('selected-y');
    btn.addEventListener('click', () => {
      sp.progress = i;
      persist();
      group.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected-y'));
      btn.classList.add('selected-y');
    });
    group.appendChild(btn);
  }
  card.appendChild(group);

  card.appendChild(makeFieldLabel('次の一歩(1行1項目で書くと箇条書きになります)'));
  card.appendChild(makeInput(sp.next_step, (v) => { sp.next_step = v; persist(); }, { tag: 'textarea', placeholder: '例:\n作家名を覚える仕組みを作る\nカテゴリのバグを直す' }));
}

// ---- レンダラー: 失敗/良かったこと ブロック(共通) ----
function renderReviewBlock(section, card, key, labelText, placeholder) {
  if (!answers[section]) answers[section] = {};
  if (!answers[section][key] || typeof answers[section][key] !== 'object') {
    answers[section][key] = { text: '', tags: [] };
  }
  const data = answers[section][key];
  if (!Array.isArray(data.tags)) data.tags = [];

  const title = document.createElement('div');
  title.className = 'question-label';
  title.textContent = labelText;
  card.appendChild(title);

  card.appendChild(makeInput(data.text, (v) => { data.text = v; persist(); }, { tag: 'textarea', placeholder }));

  card.appendChild(makeFieldLabel('カテゴリ（任意・複数選択可）'));
  renderMultiChoiceChips(card, REVIEW_TAGS, data.tags, (vs) => { data.tags = vs; persist(); });
}

// ---- レンダラー: 作家リスト(時代・分野付き) ----
function renderArtistsInCard(section, card) {
  function getArtists() {
    if (!answers[section]) answers[section] = {};
    if (!answers[section].artists || answers[section].artists.length === 0) answers[section].artists = [{}];
    return answers[section].artists;
  }
  function refresh() {
    card.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'question-label';
    title.textContent = '覚える作家';
    card.appendChild(title);

    const artists = getArtists();
    artists.forEach((artist, i) => {
      const item = document.createElement('div');
      item.className = 'order-item';

      if (artists.length > 1) {
        const header = document.createElement('div');
        header.className = 'order-item-header';
        const num = document.createElement('span');
        num.textContent = `作家 ${i + 1}`;
        header.appendChild(num);
        const del = document.createElement('button');
        del.textContent = '削除';
        del.className = 'order-delete-btn';
        del.addEventListener('click', () => { artists.splice(i, 1); persist(); refresh(); });
        header.appendChild(del);
        item.appendChild(header);
      }

      item.appendChild(makeFieldLabel('作家名'));
      item.appendChild(makeInput(artist.name, (v) => { artist.name = v; persist(); }));

      item.appendChild(makeFieldLabel('よみ（ひらがな）'));
      item.appendChild(makeInput(artist.yomi, (v) => { artist.yomi = v; persist(); }));

      item.appendChild(makeFieldLabel('時代'));
      renderSingleChoiceChips(item, ARTIST_ERAS, artist.era, (v) => { artist.era = v; persist(); });

      item.appendChild(makeFieldLabel('分野'));
      renderSingleChoiceChips(item, ARTIST_FIELDS, artist.field, (v) => { artist.field = v; persist(); });

      item.appendChild(makeFieldLabel('メモ'));
      item.appendChild(makeInput(artist.memo, (v) => { artist.memo = v; persist(); }, { tag: 'textarea' }));

      if (i < artists.length - 1) {
        item.style.borderBottom = '1px solid var(--border)';
        item.style.paddingBottom = '16px';
      }
      card.appendChild(item);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = '＋ 作家を追加';
    addBtn.className = 'add-order-btn';
    addBtn.addEventListener('click', () => { getArtists().push({}); persist(); refresh(); });
    card.appendChild(addBtn);
  }
  refresh();
}

// ---- 質問レンダリング ----
function applyVisibility(section) {
  QUESTIONS[section].forEach(q => {
    if (!q.showIf) return;
    const card = document.getElementById(`card-${section}-${q.id}`);
    if (!card) return;
    const parentVal = (answers[section] || {})[q.showIf.id];
    card.classList.toggle('hidden', parentVal !== q.showIf.value);
  });
}

function renderSection(section) {
  const container = document.getElementById(`section-${section}`);
  container.innerHTML = '';

  QUESTIONS[section].forEach(q => {
    const card = document.createElement('div');
    card.className = 'question-card' + (q.showIf ? ' hidden' : '');
    card.id = `card-${section}-${q.id}`;

    switch (q.type) {
      case 'scale5':
        renderScale5InCard(section, q, card);
        container.appendChild(card);
        return;
      case 'works_list':
        renderWorksInCard(section, card);
        container.appendChild(card);
        return;
      case 'customer_activities_list':
        renderCustomerActivitiesInCard(section, card);
        container.appendChild(card);
        return;
      case 'side_project_block':
        renderSideProjectBlock(section, card);
        container.appendChild(card);
        return;
      case 'failure_block':
        renderReviewBlock(section, card, 'failure', '失敗 / 反省点（任意）', '');
        container.appendChild(card);
        return;
      case 'good_block':
        renderReviewBlock(section, card, 'good', '今日の良かったこと（任意）', '');
        container.appendChild(card);
        return;
      case 'artists_list':
        renderArtistsInCard(section, card);
        container.appendChild(card);
        return;
    }

    // 単純な質問: yn / textarea / text / number
    const label = document.createElement('div');
    label.className = 'question-label';
    label.textContent = q.text;
    card.appendChild(label);

    if (q.type === 'yn') {
      const group = document.createElement('div');
      group.className = 'yn-group';
      ['y', 'n'].forEach(val => {
        const btn = document.createElement('button');
        btn.className = 'yn-btn';
        btn.textContent = val === 'y' ? 'はい' : 'いいえ';
        btn.dataset.val = val;
        const current = (answers[section] || {})[q.id];
        if (current === val) btn.classList.add('selected-y');
        else if (current && current !== val) btn.classList.add('selected-n');
        btn.addEventListener('click', () => {
          answers[section] = answers[section] || {};
          answers[section][q.id] = val;
          persist();
          group.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected-y', 'selected-n'));
          btn.classList.add('selected-y');
          const other = group.querySelector(`[data-val="${val === 'y' ? 'n' : 'y'}"]`);
          if (other) other.classList.add('selected-n');
          applyVisibility(section);
        });
        group.appendChild(btn);
      });
      card.appendChild(group);
    } else {
      const isTextarea = q.type === 'textarea';
      const el = document.createElement(isTextarea ? 'textarea' : 'input');
      if (!isTextarea) el.type = q.type;
      el.placeholder = q.placeholder || '';
      if (q.type === 'number') el.min = 0;
      const saved = (answers[section] || {})[q.id];
      if (saved !== undefined) el.value = saved;
      let timer;
      const save = () => {
        answers[section] = answers[section] || {};
        answers[section][q.id] = el.value;
        persist();
      };
      el.addEventListener('input', () => {
        if (isTextarea) autosize(el);
        clearTimeout(timer); timer = setTimeout(save, 800);
      });
      el.addEventListener('blur', save);
      attachFocusScroll(el);
      if (isTextarea) {
        requestAnimationFrame(() => autosize(el));
        attachKbChips(el);
      }
      card.appendChild(el);
    }

    container.appendChild(card);
  });

  applyVisibility(section);
}

// ---- タブ切替 ----
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
