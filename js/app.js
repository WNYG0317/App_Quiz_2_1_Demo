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
const modeBadge       = document.getElementById('mode-badge');
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
   タグ管理 (localStorage)
============================================================ */
const TAGS_STORAGE_KEY = 'flashcard_tags';
let activeTagFilter = '__all__';

function getAllTags() {
  try { return JSON.parse(localStorage.getItem(TAGS_STORAGE_KEY) || '{}'); }
  catch { return {}; }
}
function saveAllTags(obj) { localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(obj)); }
function getFileTags(filename) { return getAllTags()[filename] || []; }
function setFileTags(filename, tags) {
  const all = getAllTags();
  const unique = [...new Set(tags.map(t => t.trim()).filter(Boolean))];
  if (unique.length) all[filename] = unique; else delete all[filename];
  saveAllTags(all);
}
function removeFileFromTags(filename) {
  const all = getAllTags(); delete all[filename]; saveAllTags(all);
}
function getUniqueTags() {
  return [...new Set(Object.values(getAllTags()).flat().map(t => t.trim()).filter(Boolean))].sort();
}

function refreshTagFilter() {
  const bar    = document.getElementById('tag-filter-bar');
  const listEl = document.getElementById('tag-filter-list');
  const tags   = getUniqueTags();
  listEl.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'tag-filter-btn' + (activeTagFilter === '__all__' ? ' active' : '');
  allBtn.dataset.tag = '__all__';
  allBtn.textContent = 'すべて';
  listEl.appendChild(allBtn);
  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-filter-btn' + (activeTagFilter === tag ? ' active' : '');
    btn.dataset.tag = tag;
    btn.textContent = tag;
    listEl.appendChild(btn);
  });
  bar.style.display = tags.length ? 'flex' : 'none';
}

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
   CSV 生パース（列割り当て用）
============================================================ */
function parseCSVRaw(text) {
  const allRows = text.trim().split(/\r?\n/).map(splitCSVLine);
  if (allRows.length === 0) return { headers: [], rows: [], hasHeader: false };

  const headerKw = /^(裏面|back|answer|意味|english|japanese|word|front|表面|term|definition|note|例文|補足)/i;
  let hasHeader = false;
  let headers = [];
  let rows = [];

  if (allRows.length > 1 && allRows[0].length >= 1 && headerKw.test(allRows[0][0])) {
    hasHeader = true;
    headers = allRows[0].map(h => h.trim() || '(空)');
    rows = allRows.slice(1).filter(r => r.some(c => c.trim()));
  } else {
    hasHeader = false;
    headers = allRows[0].map((_, i) => `列 ${i + 1}`);
    rows = allRows.filter(r => r.some(c => c.trim()));
  }

  // 列数を統一（最大列数に合わせてパディング）
  const maxCols = Math.max(...rows.map(r => r.length), headers.length);
  headers = headers.concat(
    Array.from({ length: Math.max(0, maxCols - headers.length) }, (_, i) => `列 ${headers.length + i + 1}`)
  );
  rows = rows.map(r => {
    const padded = [...r];
    while (padded.length < maxCols) padded.push('');
    return padded;
  });

  return { headers, rows, hasHeader };
}

/* ============================================================
   プレビューモーダル
============================================================ */
let previewFile = null;
let previewData = null;

const previewOverlay    = document.getElementById('preview-overlay');
const previewFilenameEl = document.getElementById('preview-filename');
const previewRowInfo    = document.getElementById('preview-row-info');
const assignFront       = document.getElementById('assign-front');
const assignBack        = document.getElementById('assign-back');
const assignNote        = document.getElementById('assign-note');
const uploadFilenameEl  = document.getElementById('upload-filename');
const uploadTagsEl      = document.getElementById('upload-tags');
const previewTable      = document.getElementById('preview-table');

function generateSafeFileName(originalName) {
  const base = originalName.replace(/\.csv$/i, '');
  // ASCII英数字・ハイフン・アンダースコア・スペースのみなら安全
  if (/^[\x20-\x7E]+$/.test(base) && !/[<>:"/\\|?*]/.test(base)) {
    return originalName;
  }
  // 非ASCII文字を含む場合はタイムスタンプベースの安全な名前を生成
  const now = new Date();
  const ts = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + '_'
    + String(now.getHours()).padStart(2, '0')
    + String(now.getMinutes()).padStart(2, '0')
    + String(now.getSeconds()).padStart(2, '0');
  return `flashcard_${ts}.csv`;
}

function buildSelectOptions(sel, headers, defaultIdx, allowNone) {
  sel.innerHTML = '';
  if (allowNone) {
    const opt = document.createElement('option');
    opt.value = -1;
    opt.textContent = '（なし）';
    if (defaultIdx < 0) opt.selected = true;
    sel.appendChild(opt);
  }
  headers.forEach((h, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `列${i + 1}: ${h}`;
    if (i === defaultIdx) opt.selected = true;
    sel.appendChild(opt);
  });
}

function showPreview(file, rawData) {
  previewFile = file;
  previewData = rawData;

  previewFilenameEl.textContent = file.name;
  uploadFilenameEl.value = generateSafeFileName(file.name);

  const { headers } = rawData;
  buildSelectOptions(assignFront, headers, 0,          false);
  buildSelectOptions(assignBack,  headers, Math.min(1, headers.length - 1), false);
  buildSelectOptions(assignNote,  headers, headers.length > 2 ? 2 : -1, true);

  updatePreviewTable();
  previewOverlay.style.display = 'flex';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updatePreviewTable() {
  const frontCol = parseInt(assignFront.value);
  const backCol  = parseInt(assignBack.value);
  const noteCol  = parseInt(assignNote.value);
  const { headers, rows } = previewData;

  const PREVIEW_ROWS = 6;
  const sample = rows.slice(0, PREVIEW_ROWS);
  const remaining = rows.length - sample.length;
  previewRowInfo.textContent =
    `全 ${rows.length} 件のデータ` +
    (remaining > 0 ? `（先頭 ${PREVIEW_ROWS} 件を表示）` : '');

  const colClass = (i) => {
    if (i === frontCol) return 'col-front';
    if (i === backCol)  return 'col-back';
    if (i === noteCol && noteCol >= 0) return 'col-note';
    return 'col-unused';
  };

  const colTag = (i) => {
    if (i === frontCol) return '<span class="col-tag col-tag-front">表面</span>';
    if (i === backCol)  return '<span class="col-tag col-tag-back">裏面</span>';
    if (i === noteCol && noteCol >= 0) return '<span class="col-tag col-tag-note">例文</span>';
    return '';
  };

  let html = '<thead><tr>';
  headers.forEach((h, i) => {
    html += `<th class="${colClass(i)}">
      <div class="th-inner">${escHtml(h)}${colTag(i)}</div>
    </th>`;
  });
  html += '</tr></thead><tbody>';

  sample.forEach(row => {
    html += '<tr>';
    headers.forEach((_, i) => {
      html += `<td class="${colClass(i)}">${escHtml((row[i] || '').trim())}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody>';
  previewTable.innerHTML = html;
}

function csvEscape(val) {
  if (/[,"\n\r]/.test(val)) return '"' + val.replace(/"/g, '""') + '"';
  return val;
}

async function confirmUploadFromPreview() {
  const frontCol = parseInt(assignFront.value);
  const backCol  = parseInt(assignBack.value);
  const noteCol  = parseInt(assignNote.value);

  if (frontCol === backCol) {
    alert('表面と裏面に同じ列を指定することはできません。');
    return;
  }

  // ファイル名のバリデーション
  let uploadName = uploadFilenameEl.value.trim();
  if (!uploadName) {
    alert('保存ファイル名を入力してください。');
    uploadFilenameEl.focus();
    return;
  }
  if (!/^[\x20-\x7E]+$/.test(uploadName) || /[<>:"/\\|?*]/.test(uploadName)) {
    alert('ファイル名に使用できない文字が含まれています。\n英数字・ハイフン・アンダースコアのみ使用してください。');
    uploadFilenameEl.focus();
    return;
  }
  if (!uploadName.toLowerCase().endsWith('.csv')) {
    uploadName += '.csv';
  }

  const { rows } = previewData;
  const remappedRows = rows
    .filter(r => (r[frontCol] || '').trim() && (r[backCol] || '').trim())
    .map(r => {
      const front = (r[frontCol] || '').trim();
      const back  = (r[backCol]  || '').trim();
      const note  = noteCol >= 0 ? (r[noteCol] || '').trim() : '';
      return [front, back, note].map(csvEscape).join(',');
    });

  if (remappedRows.length === 0) {
    alert('有効なカードデータが見つかりませんでした。列の割り当てを確認してください。');
    return;
  }

  const csvText = remappedRows.join('\n');
  const blob = new Blob([csvText], { type: 'text/csv' });
  const renamedFile = new File([blob], uploadName, { type: 'text/csv' });

  // タグを保存
  const tagStr = uploadTagsEl.value.trim();
  const tags = tagStr ? tagStr.split(',').map(t => t.trim()).filter(Boolean) : [];
  if (tags.length) setFileTags(uploadName, tags);

  closePreview();
  await uploadFile(renamedFile);
}

function closePreview() {
  previewOverlay.style.display = 'none';
  previewFile = null;
  previewData = null;
  uploadTagsEl.value = '';
}

/* ============================================================
   ファイル選択ハンドラ（プレビューを挟む）
============================================================ */
async function handleFileSelected(file) {
  if (!file.name.endsWith('.csv')) {
    setStatus(uploadStatus, 'error', 'CSVファイルを選択してください。');
    return;
  }
  if (!isConfigured) {
    setStatus(uploadStatus, 'error', '設定が完了していません。');
    return;
  }

  let text;
  try {
    text = await file.text();
  } catch {
    setStatus(uploadStatus, 'error', 'ファイルの読み込みに失敗しました。');
    return;
  }

  const rawData = parseCSVRaw(text);
  if (rawData.rows.length === 0) {
    setStatus(uploadStatus, 'error', 'CSVにデータが見つかりませんでした。');
    return;
  }
  if (rawData.headers.length < 2) {
    setStatus(uploadStatus, 'error', '列が1つしかありません。表面・裏面の2列以上必要です。');
    return;
  }

  showPreview(file, rawData);
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

  // 削除済みファイルのタグをクリーンアップ
  const existingNames = new Set(csvFiles.map(f => f.name));
  const allTagsObj = getAllTags();
  let tagsChanged = false;
  Object.keys(allTagsObj).forEach(fn => {
    if (!existingNames.has(fn)) { delete allTagsObj[fn]; tagsChanged = true; }
  });
  if (tagsChanged) saveAllTags(allTagsObj);

  refreshTagFilter();

  const filteredFiles = activeTagFilter === '__all__'
    ? csvFiles
    : csvFiles.filter(f => getFileTags(f.name).includes(activeTagFilter));

  if (!filteredFiles.length) {
    noFiles.style.display = 'block';
    noFiles.textContent = activeTagFilter === '__all__'
      ? '保存されたCSVはありません'
      : `タグ「${activeTagFilter}」のファイルはありません`;
    return;
  }

  filteredFiles.forEach(f => {
    const date = f.created_at
      ? new Date(f.created_at).toLocaleString('ja-JP', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        })
      : '';

    const tags = getFileTags(f.name);
    const tagsHTML = tags.map(t =>
      `<span class="tag-badge" data-file="${escHtml(f.name)}" data-tag="${escHtml(t)}">${escHtml(t)}<span class="tag-remove" aria-label="タグを削除">×</span></span>`
    ).join('');

    const li = document.createElement('li');
    li.innerHTML = `
      <div class="file-info">
        <div class="file-name" title="${escHtml(f.name)}">${escHtml(f.name)}</div>
        <div class="file-date">${date}</div>
        <div class="file-tags">
          ${tagsHTML}
          <button type="button" class="btn-tag-add" data-name="${escHtml(f.name)}">＋ タグ</button>
        </div>
      </div>
      <div class="file-actions">
        <button type="button" class="btn-study"  data-name="${escHtml(f.name)}">学習開始</button>
        <button type="button" class="btn-test"   data-name="${escHtml(f.name)}">テスト開始</button>
        <button type="button" class="btn-csv"    data-name="${escHtml(f.name)}" title="CSVをダウンロード">⬇CSV</button>
        <button type="button" class="btn-pdf"    data-name="${escHtml(f.name)}" title="PDFをダウンロード">📄PDF</button>
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
   Supabase: ダウンロード → 学習開始 / テスト開始
============================================================ */
async function startStudy(filename) {
  await _loadAndLaunch(filename, 'study');
}

async function startTest(filename) {
  await _loadAndLaunch(filename, 'test');
}

async function _loadAndLaunch(filename, mode) {
  setStatus(listStatus, 'loading', `"${filename}" を読み込み中...`);

  const { data, error } = await sbClient.storage.from(BUCKET).download(filename);

  if (error) {
    setStatus(listStatus, 'error', `読み込み失敗: ${error.message}`);
    return;
  }

  const text = await data.text();
  let cardsData = parseCSV(text);

  if (!cardsData.length) {
    setStatus(listStatus, 'error', 'カードデータが見つかりませんでした。CSV の形式を確認してください。');
    return;
  }

  if (mode === 'test') {
    cardsData = cardsData.map(c => ({ front: c.back, back: c.front, note: c.note }));
  }

  clearStatus(listStatus);
  launchStudy(cardsData, filename, mode);
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
    removeFileFromTags(filename);
    await loadFileList();
  }
}

/* ============================================================
   CSV ダウンロード
============================================================ */
async function downloadCSV(filename) {
  setStatus(listStatus, 'loading', `"${filename}" をダウンロード中...`);
  const { data, error } = await sbClient.storage.from(BUCKET).download(filename);
  if (error) {
    setStatus(listStatus, 'error', `ダウンロード失敗: ${error.message}`);
    return;
  }
  clearStatus(listStatus);
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   PDF ダウンロード（印刷ウィンドウ）
============================================================ */
async function downloadPDF(filename) {
  setStatus(listStatus, 'loading', `"${filename}" のPDFを生成中...`);
  const { data, error } = await sbClient.storage.from(BUCKET).download(filename);
  if (error) {
    setStatus(listStatus, 'error', `PDF生成失敗: ${error.message}`);
    return;
  }
  const text = await data.text();
  const cardsData = parseCSV(text);
  if (!cardsData.length) {
    setStatus(listStatus, 'error', 'カードデータが見つかりませんでした。');
    return;
  }
  clearStatus(listStatus);
  const html = generatePrintHTML(filename, cardsData);
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (!win) {
    setStatus(listStatus, 'error', 'ポップアップがブロックされました。ブラウザの設定を確認してください。');
    URL.revokeObjectURL(url);
    return;
  }
  // 読み込み後に印刷ダイアログを開く
  win.addEventListener('load', () => win.print(), { once: true });
  // タブが閉じられた後 URL を解放
  win.addEventListener('unload', () => URL.revokeObjectURL(url), { once: true });
}

function generatePrintHTML(title, cardsData) {
  const cardsHTML = cardsData.map((c, i) => `
    <div class="print-card">
      <div class="card-num">${i + 1}</div>
      <div class="front-label">表面</div>
      <div class="card-front-text">${escHtml(c.front)}</div>
      <div class="back-label">裏面</div>
      <div class="card-back-text">${escHtml(c.back)}</div>
      ${c.note ? `<div class="card-note-text">📝 ${escHtml(c.note)}</div>` : ''}
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${escHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, 'Yu Gothic', sans-serif;
      color: #1a1a2e; background: #f5f7fa; padding: 20px;
    }
    h1 { font-size: 1.1rem; color: #4f6ef7; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid #4f6ef7; }
    .meta { font-size: 0.78rem; color: #999; margin-bottom: 20px; }
    .cards-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .print-card { background: #fff; border: 1.5px solid #d0d5ea; border-radius: 10px; padding: 14px 16px; page-break-inside: avoid; break-inside: avoid; }
    .card-num { font-size: 0.68rem; color: #bbb; margin-bottom: 6px; }
    .front-label { font-size: 0.68rem; font-weight: 700; color: #4f6ef7; margin-bottom: 3px; }
    .back-label  { font-size: 0.68rem; font-weight: 700; color: #2e7d32; margin-bottom: 3px; margin-top: 8px; }
    .card-front-text { font-size: 1rem; font-weight: 700; line-height: 1.4; padding-bottom: 8px; border-bottom: 1px solid #eee; word-break: break-word; }
    .card-back-text { font-size: 0.9rem; line-height: 1.5; color: #333; word-break: break-word; }
    .card-note-text { font-size: 0.78rem; color: #888; margin-top: 8px; font-style: italic; line-height: 1.5; word-break: break-word; }
    @media print {
      body { background: #fff; padding: 10mm 8mm; }
      .cards-grid { gap: 8px; }
      .print-card { border: 1px solid #ccc; border-radius: 6px; padding: 10px 12px; }
    }
    @media screen and (max-width: 520px) { .cards-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>📚 ${escHtml(title)}</h1>
  <div class="meta">全 ${cardsData.length} 件のカード</div>
  <div class="cards-grid">${cardsHTML}</div>
</body>
</html>`;
}

/* ============================================================
   タグ追加インライン UI
============================================================ */
function showTagInput(liEl, filename) {
  const existing = liEl.querySelector('.tag-input-row');
  if (existing) { existing.remove(); return; }

  const row = document.createElement('div');
  row.className = 'tag-input-row';
  row.innerHTML = `
    <input type="text" class="tag-new-input" placeholder="タグ名を入力" maxlength="30" autocomplete="off">
    <button type="button" class="btn-tag-confirm">追加</button>
    <button type="button" class="btn-tag-dismiss">✕</button>
  `;
  liEl.querySelector('.file-info').appendChild(row);
  row.querySelector('.tag-new-input').focus();

  function addTag() {
    const val = row.querySelector('.tag-new-input').value.trim();
    if (!val) return;
    const tags = getFileTags(filename);
    if (!tags.includes(val)) setFileTags(filename, [...tags, val]);
    loadFileList();
  }
  row.querySelector('.btn-tag-confirm').addEventListener('click', addTag);
  row.querySelector('.btn-tag-dismiss').addEventListener('click', () => row.remove());
  row.querySelector('.tag-new-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
    if (e.key === 'Escape') row.remove();
  });
}

/* ============================================================
   学習セクション
============================================================ */
function launchStudy(data, filename, mode) {
  cards = data;
  current = 0;
  currentFileName.textContent = filename;
  if (mode === 'test') {
    modeBadge.textContent = 'テストモード';
    modeBadge.className = 'mode-badge test';
  } else {
    modeBadge.textContent = '学習モード';
    modeBadge.className = 'mode-badge study';
  }
  manageSection.style.display = 'none';
  studySection.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showCard(0);
}

function showCard(index) {
  const c = cards[index];
  const wasFlipped = flashCard.classList.contains('flipped');
  flashCard.classList.remove('flipped');
  // If the card was flipped, wait until it rotates past 90° (mid-animation)
  // before updating content so the new card's back is never visible during the flip.
  const delay = wasFlipped ? 260 : 0;
  setTimeout(() => {
    frontText.textContent = c.front;
    backText.textContent  = c.back;
    noteText.textContent  = c.note;
    noteText.style.display = c.note ? 'block' : 'none';
  }, delay);
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

// アップロード（プレビューを経由）
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFileSelected(e.target.files[0]);
  e.target.value = '';
});

// ドラッグ＆ドロップ（プレビューを経由）
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) handleFileSelected(f);
});

// プレビューモーダル: 列変更でテーブルをリアルタイム更新
[assignFront, assignBack, assignNote].forEach(sel => {
  sel.addEventListener('change', updatePreviewTable);
});

// プレビューモーダル: キャンセル
document.getElementById('preview-cancel-btn').addEventListener('click', closePreview);

// プレビューモーダル: オーバーレイ外クリックで閉じる
previewOverlay.addEventListener('click', e => {
  if (e.target === previewOverlay) closePreview();
});

// プレビューモーダル: アップロード確定
document.getElementById('preview-confirm-btn').addEventListener('click', confirmUploadFromPreview);

// ファイル一覧クリック（学習 / テスト / ダウンロード / タグ / 削除）
fileListEl.addEventListener('click', e => {
  const studyBtn  = e.target.closest('.btn-study');
  const testBtn   = e.target.closest('.btn-test');
  const deleteBtn = e.target.closest('.btn-delete');
  const csvBtn    = e.target.closest('.btn-csv');
  const pdfBtn    = e.target.closest('.btn-pdf');
  const tagAddBtn = e.target.closest('.btn-tag-add');
  const tagRemove = e.target.closest('.tag-remove');
  if (studyBtn)  startStudy(studyBtn.dataset.name);
  if (testBtn)   startTest(testBtn.dataset.name);
  if (deleteBtn) deleteFile(deleteBtn.dataset.name);
  if (csvBtn)    downloadCSV(csvBtn.dataset.name);
  if (pdfBtn)    downloadPDF(pdfBtn.dataset.name);
  if (tagAddBtn) showTagInput(tagAddBtn.closest('li'), tagAddBtn.dataset.name);
  if (tagRemove) {
    const badge = tagRemove.closest('.tag-badge');
    if (badge) {
      const tags = getFileTags(badge.dataset.file).filter(t => t !== badge.dataset.tag);
      setFileTags(badge.dataset.file, tags);
      loadFileList();
    }
  }
});

// タグフィルタークリック
document.getElementById('tag-filter-list').addEventListener('click', e => {
  const btn = e.target.closest('.tag-filter-btn');
  if (!btn) return;
  activeTagFilter = btn.dataset.tag;
  loadFileList();
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
  // テキスト入力中は無視
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nextBtn.click(); }
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); prevBtn.click(); }
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flashCard.classList.toggle('flipped'); }
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
