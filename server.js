const express = require('express');
const fs = require('fs');
const path = require('path');
const QUESTIONS = require('./questions.js');

const app = express();
const PORT = 3000;

const VAULT = path.join(
  process.env.HOME,
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/journal'
);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 当日の回答を一時保持（顧客情報の結合に使用）
const dailyState = {}; // { 'YYYY-MM-DD': { WORK: { questionId: answer } } }

function getState(date, section) {
  if (!dailyState[date]) dailyState[date] = {};
  if (!dailyState[date][section]) dailyState[date][section] = {};
  return dailyState[date][section];
}

// クライアントへ質問データを提供
app.get('/api/questions', (req, res) => {
  res.json(QUESTIONS);
});

// 回答を受け取りObsidianへ保存
app.post('/api/answer', (req, res) => {
  const { section, questionId, answer, date } = req.body;
  if (!section || !questionId || answer === undefined || !date) {
    return res.status(400).json({ error: 'invalid payload' });
  }

  try {
    if (section === 'WORK') {
      // 当日の状態を更新
      const state = getState(date, 'WORK');
      state[questionId] = answer;

      saveToJournal(date, section, questionId, answer);

      if (questionId === 'work_learning' && answer.trim()) {
        saveToInsight(date, answer.trim());
      }

      // client_name か order_content が更新されたとき、両方揃っていれば顧客ファイルを保存
      if (questionId === 'client_name' || questionId === 'order_content') {
        const name = state['client_name'];
        const content = state['order_content'];
        if (name && name.trim() && content && content.trim()) {
          saveToCustomer(date, name.trim(), content.trim());
        }
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- ファイル書き込みヘルパー ----

function getJournalPath(date) {
  const [year, month] = date.split('-');
  const dir = path.join(VAULT, '日誌', `${year}-${month}`);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${date}.md`);
}

function getInsightPath(date) {
  const dir = path.join(VAULT, '気づき');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${date}_仕事の学び.md`);
}

function getCustomerPath(clientName) {
  const dir = path.join(VAULT, '顧客');
  fs.mkdirSync(dir, { recursive: true });
  // ファイル名に使えない文字を除去
  const safeName = clientName.replace(/[/\\:*?"<>|]/g, '');
  return path.join(dir, `${safeName}.md`);
}

function dayName(dateStr) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(dateStr).getDay()];
}

function formatDateJP(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

function readOrCreate(filePath, defaultContent) {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return defaultContent;
}

function upsertSection(content, sectionHeader, fieldLabel, value) {
  const sectionRegex = new RegExp(`(## ${escapeRegex(sectionHeader)}[\\s\\S]*?)(?=\\n## |$)`);
  const fieldRegex = new RegExp(`^(- ${escapeRegex(fieldLabel)}: )(.*)$`, 'm');

  if (!sectionRegex.test(content)) {
    // セクションが存在しない場合は末尾に追加
    content = content.trimEnd() + `\n\n## ${sectionHeader}\n- ${fieldLabel}: ${value}\n`;
    return content;
  }

  return content.replace(sectionRegex, (sectionBlock) => {
    if (fieldRegex.test(sectionBlock)) {
      return sectionBlock.replace(fieldRegex, `$1${value}`);
    } else {
      return sectionBlock.trimEnd() + `\n- ${fieldLabel}: ${value}\n`;
    }
  });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelFor(section, questionId) {
  const LABELS = {
    WORK: {
      did_work: '仕事',
      work_content: '内容',
      work_learning: '学び',
      got_order: '受注',
      client_name: 'お客様',
      order_content: '受注内容',
      tomorrow_plan: '明日の予定',
      other: 'その他',
    },
  };
  return (LABELS[section] && LABELS[section][questionId]) || questionId;
}

function saveToJournal(date, section, questionId, answer) {
  const filePath = getJournalPath(date);
  const day = dayName(date);
  const dateJP = formatDateJP(date);
  const defaultContent = `---\ndate: ${date}\nday: ${day}\n---\n\n# ${dateJP}（${day}）\n`;

  let content = readOrCreate(filePath, defaultContent);

  const label = labelFor(section, questionId);
  const displayValue = answer === 'y' ? 'あり' : answer === 'n' ? 'なし' : (answer.trim() || '—');

  content = upsertSection(content, section, label, displayValue);
  fs.writeFileSync(filePath, content, 'utf8');
}

function saveToCustomer(date, clientName, orderContent) {
  const filePath = getCustomerPath(clientName);
  const dateJP = formatDateJP(date);
  const newEntry = `\n### ${dateJP}（${date}）\n- 仕事内容: ${orderContent}\n`;

  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');

    // 同じ日付のエントリがあれば上書き、なければ追記
    const entryRegex = new RegExp(`### ${escapeRegex(dateJP)}（${escapeRegex(date)}）[\\s\\S]*?(?=\\n### |$)`);
    if (entryRegex.test(content)) {
      content = content.replace(entryRegex, `### ${dateJP}（${date}）\n- 仕事内容: ${orderContent}\n`);
    } else {
      content = content.trimEnd() + newEntry;
    }
    fs.writeFileSync(filePath, content, 'utf8');
  } else {
    const content = `---\nname: ${clientName}\ntags: [顧客]\n---\n\n# ${clientName}\n\n## 受注履歴\n${newEntry}`;
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function saveToInsight(date, answer) {
  const filePath = getInsightPath(date);
  if (fs.existsSync(filePath)) {
    // 既存ファイルに追記
    const existing = fs.readFileSync(filePath, 'utf8');
    if (!existing.includes(answer)) {
      fs.appendFileSync(filePath, `\n- ${answer}\n`, 'utf8');
    }
  } else {
    const day = dayName(date);
    const dateJP = formatDateJP(date);
    const content = `---\ndate: ${date}\ntags: [気づき, 仕事]\n---\n\n# ${dateJP}（${day}）仕事の学び\n\n- ${answer}\n`;
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

app.listen(PORT, () => {
  console.log(`日誌アプリ起動中: http://localhost:${PORT}`);
});
