/* ============================================================
   初期化
============================================================ */
const isConfigured =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('YOUR_') &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes('YOUR_');

if (!isConfigured) {
  document.getElementById('config-warning').style.display = 'block';
}

const sbClient = isConfigured
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/* ============================================================
   DOM 参照
============================================================ */
const manageSection   = document.getElementById('manage-section');
const studySection    = document.getElementById('study-section');
const dropZone        = document.getElementById('drop-zone');
const selectFileBtn   = document.getElementById('select-file-btn');
const fileInput       = document.getElementById('file-input');
const uploadStatus    = document.getElementById('upload-status');
const fileListEl      = document.getElementById('file-list');
const listLoading     = document.getElementById('list-loading');
const noFiles         = document.getElementById('no-files');
const listStatus      = document.getElementById('list-status');
const backBtn         = document.getElementById('back-btn');
const currentFileName = document.getElementById('current-file-name');
const flashCard       = document.getElementById('flash-card');
const frontText       = document.getElementById('front-text');
const backText        = document.getElementById('back-text');
const noteText        = document.getElementById('note-text');
const counter         = document.getElementById('counter');
const progressBar     = document.getElementById('progress-bar');
const prevBtn         = document.getElementById('prev-btn');
const nextBtn         = document.getElementById('next-btn');
const shuffleBtn      = document.getElementById('shuffle-btn');

let cards = [], current = 0;

/* ============================================================
   ステータス表示
============================================================ */
function setStatus(el, type, msg) {
  el.className = `status ${type}`;
  el.innerHTML = type === 'loading'
    ? `<div class="spinner"></div><span>${msg}</span>`
    : msg;
}

function clearStatus(el) {
  el.className = 'status';
  el.textContent = '';
}

/* ============================================================
   CSV パース
============================================================ */
function parseCSV(text) {
  const rows = text.trim().split(/\r?\n/).map(splitCSVLine);
  let start = 0;
  if (rows.length > 1) {
    const headerKw = /^(裏面|back|answer|意味|english|japanese|word|front|表面|term|definition|note|例文|補足)/i;
    if (rows[0].length >= 2 && headerKw.test(rows[0][0])) start = 1;
  }
  const result = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (r.length >= 2 && r[0].trim() && r[1].trim()) {
      result.push({ front: r[0].trim(), back: r[1].trim(), note: (r[2] || '').trim() });
    }
  }
  return result;
}

function splitCSVLine(line) {
  const result = [];
  let inQ = false, cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

/* ============================================================
   Supabase: ファイル一覧
============================================================ */
async function loadFileList() {
  if (!isConfigured) {
    listLoading.style.display = 'none';
    noFiles.style.display = 'block';
    noFiles.textContent = '設定が完了していません。';
    return;
  }

  listLoading.style.display = 'flex';
  fileListEl.innerHTML = '';
  noFiles.style.display = 'none';
  clearStatus(listStatus);

  const { data, error } = await sbClient.storage.from(BUCKET).list('', {
    sortBy: { column: 'created_at', order: 'desc' }
  });

  listLoading.style.display = 'none';

  if (error) {
    setStatus(listStatus, 'error', `一覧の取得に失敗しました: ${error.message}`);
    return;
  }

  const csvFiles = (data || []).filter(
    f => f.name.endsWith('.csv') && f.name !== '.emptyFolderPlaceholder'
  );

  if (!csvFiles.length) {
    noFiles.style.display = 'block';
    return;
  }

  csvFiles.forEach(f => {
    const date = f.created_at
      ? new Date(f.created_at).toLocaleString('ja-JP', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        })
      : '';

    const li = document.createElement('li');
    li.innerHTML = `
      <div class="file-info">
        <div class="file-name" title="${escHtml(f.name)}">${escHtml(f.name)}</div>
        <div class="file-date">${date}</div>
      </div>
      <div class="file-actions">
        <button type="button" class="btn-study" data-name="${escHtml(f.name)}">学習開始</button>
        <button type="button" class="btn-delete" data-name="${escHtml(f.name)}" title="削除">🗑</button>
      </div>
    `;
    fileListEl.appendChild(li);
  });
}

/* ============================================================
   Supabase: アップロード
============================================================ */
async function uploadFile(file) {
  if (!isConfigured) {
    setStatus(uploadStatus, 'error', '設定が完了していません。');
    return;
  }
  if (!file.name.endsWith('.csv')) {
    setStatus(uploadStatus, 'error', 'CSVファイルを選択してください。');
    return;
  }

  setStatus(uploadStatus, 'loading', `"${file.name}" をアップロード中...`);

  const { error } = await sbClient.storage.from(BUCKET).upload(file.name, file, { upsert: true });

  if (error) {
    setStatus(uploadStatus, 'error', `アップロード失敗: ${error.message}`);
  } else {
    setStatus(uploadStatus, 'success', `✓ "${file.name}" を保存しました`);
    await loadFileList();
    setTimeout(() => clearStatus(uploadStatus), 3000);
  }
}

/* ============================================================
   Supabase: ダウンロード → 学習開始
============================================================ */
async function startStudy(filename) {
  setStatus(listStatus, 'loading', `"${filename}" を読み込み中...`);

  const { data, error } = await sbClient.storage.from(BUCKET).download(filename);

  if (error) {
    setStatus(listStatus, 'error', `読み込み失敗: ${error.message}`);
    return;
  }

  const text = await data.text();
  const cardsData = parseCSV(text);

  if (!cardsData.length) {
    setStatus(listStatus, 'error', 'カードデータが見つかりませんでした。CSV の形式を確認してください。');
    return;
  }

  clearStatus(listStatus);
  launchStudy(cardsData, filename);
}

/* ============================================================
   Supabase: 削除
============================================================ */
async function deleteFile(filename) {
  if (!confirm(`"${filename}" を削除しますか？`)) return;

  const { error } = await sbClient.storage.from(BUCKET).remove([filename]);

  if (error) {
    setStatus(listStatus, 'error', `削除失敗: ${error.message}`);
  } else {
    await loadFileList();
  }
}

/* ============================================================
   学習セクション
============================================================ */
function launchStudy(data, filename) {
  cards = data;
  current = 0;
  currentFileName.textContent = filename;
  manageSection.style.display = 'none';
  studySection.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showCard(0);
}

function showCard(index) {
  const c = cards[index];
  flashCard.classList.remove('flipped');
  setTimeout(() => {
    frontText.textContent = c.front;
    backText.textContent  = c.back;
    noteText.textContent  = c.note;
    noteText.style.display = c.note ? 'block' : 'none';
  }, 50);
  counter.textContent = `${index + 1} / ${cards.length}`;
  progressBar.style.width = `${(index + 1) / cards.length * 100}%`;
  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === cards.length - 1;
}

/* ============================================================
   ユーティリティ
============================================================ */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================
   イベント
============================================================ */

// ファイル選択ボタン
selectFileBtn.addEventListener('click', () => fileInput.click());

// アップロード
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) uploadFile(e.target.files[0]);
  e.target.value = '';
});

// ドラッグ＆ドロップ
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) uploadFile(f);
});

// ファイル一覧クリック（学習 / 削除）
fileListEl.addEventListener('click', e => {
  const studyBtn  = e.target.closest('.btn-study');
  const deleteBtn = e.target.closest('.btn-delete');
  if (studyBtn)  startStudy(studyBtn.dataset.name);
  if (deleteBtn) deleteFile(deleteBtn.dataset.name);
});

// カードめくり
flashCard.addEventListener('click', () => flashCard.classList.toggle('flipped'));
flashCard.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    flashCard.classList.toggle('flipped');
  }
});

// 前へ / 次へ
prevBtn.addEventListener('click', () => { if (current > 0) showCard(--current); });
nextBtn.addEventListener('click', () => { if (current < cards.length - 1) showCard(++current); });

// キーボードナビ
document.addEventListener('keydown', e => {
  if (!studySection.classList.contains('active')) return;
  if (e.key === 'ArrowRight') nextBtn.click();
  if (e.key === 'ArrowLeft')  prevBtn.click();
});

// シャッフル
shuffleBtn.addEventListener('click', () => {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  current = 0;
  showCard(0);
});

// 一覧に戻る
backBtn.addEventListener('click', () => {
  studySection.classList.remove('active');
  manageSection.style.display = 'block';
});

/* ============================================================
   起動
============================================================ */
loadFileList();
