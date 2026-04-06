# .cowork → コード反映ワークフロー

> 作成日: 2026-04-06
> 対象プロジェクト: 単語カードアプリ（App_Quiz_2_1_Demo）

---

## 概要

このワークフローは `.cowork/improvements.md` に記載された設計・改善アイデアを、実際のコードへ段階的に反映させるための手順書です。Claude Code が自律的に実装作業を進める際にも、このドキュメントを参照して一貫した開発フローを維持してください。

---

## プロジェクト構成マップ

```
App_Quiz_2_1_Demo/
├── index.html              # 全UIの起点。新しい画面・モーダルはここに追加
├── css/
│   └── style.css           # スタイル定義。テーマ変数・コンポーネント追加はここ
├── js/
│   ├── config.js           # Supabase URL / Key / Bucket 定数
│   └── app.js              # アプリ全体のロジック（626行）
├── img/
│   └── icon.svg
├── manifest.webmanifest    # PWA設定
├── .cowork/
│   └── improvements.md     # ← 設計の起点（改善アイデア集）
└── .agent/
    └── cowork-to-code-workflow.md  # ← 本ファイル
```

---

## ステップ 1｜対象機能の選定

`.cowork/improvements.md` の各セクションを読み、以下の基準で実装優先度を判断する。

| 優先度 | 基準 |
|--------|------|
| 高 | ユーザー体験に直結し、既存コードへの影響が小さいもの |
| 中 | 機能追加だが依存モジュールが少ないもの |
| 低 | アーキテクチャ変更を伴う・外部サービス連携が必要なもの |

**現状の優先度マッピング（improvements.md 対応）**

| セクション | 機能 | 優先度 | 主な変更ファイル |
|---|---|---|---|
| 1-1 | わかった/わからなかった ボタン | 高 | `app.js`, `index.html`, `style.css` |
| 2-1 | 4択クイズモード | 高 | `app.js`, `index.html` |
| 4-1 | ダークモード | 高 | `style.css`, `index.html` |
| 4-2 | スワイプジェスチャー | 中 | `app.js` |
| 4-3 | フォントサイズ自動調整 | 中 | `app.js`, `style.css` |
| 4-4 | 音声読み上げ（TTS） | 中 | `app.js`, `index.html` |
| 5-1 | Service Worker | 中 | 新規 `sw.js` |
| 6-1 | 設定画面UI化 | 中 | `index.html`, `app.js`, `config.js` |
| 1-2 | SRSアルゴリズム | 低 | `app.js` + LocalStorage/Supabase |
| 1-3 | 学習進捗ダッシュボード | 低 | `app.js`, `index.html`, Supabase |
| 2-2 | タイピング入力モード | 低 | `app.js`, `index.html` |
| 3-1 | フォルダ/タグ管理 | 低 | `app.js`, Supabase Storage |
| 3-4 | 共有リンク | 低 | `app.js`, Supabase |

---

## ステップ 2｜実装前の確認チェックリスト

機能の実装を開始する前に、以下を必ず確認する。

- [ ] `app.js` の該当DOM参照セクションに変数が不足していないか
- [ ] `index.html` に対応するHTML要素（ID・クラス）が存在するか
- [ ] 新機能が既存の `cards[]` / `current` / `sbClient` に依存しているか整理できているか
- [ ] LocalStorage キー名が既存のものと衝突しないか（現状使用キーはなし）
- [ ] Supabase テーブル追加が必要な場合、`config.js` の定数を増やすだけで対応できるか

---

## ステップ 3｜コーディング規約

`app.js` の既存スタイルに合わせ、以下の規約を守って実装する。

### セクション区切り
新しい機能ブロックは必ず以下のコメントブロックで囲む：
```js
/* ============================================================
   機能名（例: 習熟度トラッキング）
============================================================ */
```

### DOM 参照
全ての `getElementById` / `querySelector` は、ファイル冒頭の「DOM 参照」セクションに集約する。
```js
// 既存パターンに合わせる
const myNewElement = document.getElementById('my-new-element');
```

### ステータス表示
ユーザーへのフィードバックは既存の `setStatus()` / `clearStatus()` を再利用する。
```js
setStatus(uploadStatus, 'loading', '処理中...');
setStatus(uploadStatus, 'success', '完了しました');
setStatus(uploadStatus, 'error', 'エラーが発生しました');
```

### HTML追加ルール
- 新しいセクション・モーダルは `index.html` の末尾（`</body>` 直前）に追加
- ID命名: `kebab-case`（例: `quiz-modal`, `score-panel`）
- CSS クラス命名: BEMに近い形（例: `card__answer`, `btn--primary`）

### CSS追加ルール
`style.css` にテーマカラーを追加する場合、ファイル冒頭の `:root` 変数セクションに定義してから使用する。

---

## ステップ 4｜機能別 実装ガイド

### 【1-1】習熟度トラッキング（わかった/わからなかった）

**実装箇所:**

`index.html` — カード操作エリアに2ボタン追加：
```html
<div id="knowledge-btns" style="display:none;">
  <button id="knew-btn" class="btn btn--success">わかった ✓</button>
  <button id="unknown-btn" class="btn btn--danger">わからなかった ✗</button>
</div>
```

`app.js` — カードめくり後にボタンを表示し、スコアを集計：
```js
// カードめくり時
flashCard.addEventListener('click', () => {
  flashCard.classList.toggle('flipped');
  knowledgeBtns.style.display = flashCard.classList.contains('flipped') ? 'flex' : 'none';
});

// スコア集計
let sessionScore = { knew: 0, unknown: 0 };
knewBtn.addEventListener('click', () => { sessionScore.knew++; goNext(); });
unknownBtn.addEventListener('click', () => { sessionScore.unknown++; goNext(); });
```

LocalStorage 保存キー例: `wc_score_{fileName}`

---

### 【2-1】4択クイズモード

**実装箇所:**

`index.html` — クイズ用モーダルまたはセクションを追加。
`app.js` — 誤答選択肢の生成ロジック：

```js
function getWrongChoices(correctIdx, allCards, count = 3) {
  const pool = allCards.filter((_, i) => i !== correctIdx);
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(c => c[1]); // 裏面テキストを選択肢に
}
```

モードの切り替えは既存の `modeBadge` ロジックを参考に拡張する。

---

### 【4-1】ダークモード

**実装箇所:**

`style.css` — `:root` に変数追加後、`[data-theme="dark"]` セレクタで上書き：
```css
:root {
  --bg: #f0f4f8;
  --text: #1a202c;
  --card-bg: #ffffff;
}
[data-theme="dark"] {
  --bg: #1a202c;
  --text: #e2e8f0;
  --card-bg: #2d3748;
}
```

`app.js` — OSの設定を初期値に、ボタンで手動切替：
```js
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
```

---

### 【5-1】Service Worker（オフライン対応）

**新規ファイル:** `sw.js` をルートに作成。

`index.html` に登録コードを追加：
```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
</script>
```

`sw.js` の基本骨格（Workbox 不使用の軽量版）：
```js
const CACHE_NAME = 'wc-v1';
const ASSETS = ['./', './index.html', './css/style.css', './js/config.js', './js/app.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
```

---

### 【6-1】設定画面UI化

**実装方針:** `config.js` の定数は残しつつ、LocalStorage に保存した値を優先的に読む。

`app.js` に以下を追加：
```js
const savedUrl = localStorage.getItem('wc_supabase_url');
const savedKey = localStorage.getItem('wc_supabase_key');
const effectiveUrl = savedUrl || SUPABASE_URL;
const effectiveKey = savedKey || SUPABASE_ANON_KEY;
```

設定保存ボタンで `localStorage.setItem()` → ページリロード。

---

## ステップ 5｜テスト・確認

実装後は以下を確認してから完了とする。

- [ ] ブラウザの開発者ツール（Console）にエラーが出ていないか
- [ ] Supabase 連携機能は実際のバケットで動作するか（config.js の認証情報が必要）
- [ ] モバイル幅（375px）でレイアウトが崩れていないか
- [ ] PWA機能（manifest, SW）は Lighthouse でスコア確認
- [ ] 新機能の LocalStorage キーが意図通りに読み書きされているか

---

## ステップ 6｜変更履歴の記録

実装完了後、このワークフローファイルの末尾にある変更履歴テーブルを更新する。

| 日付 | 実装した機能 | 変更ファイル | 備考 |
|------|-------------|-------------|------|
| （実装時に記入） | | | |

---

## 注意事項

- `config.js` の Supabase 認証情報はパブリックリポジトリに push しないこと（anon key は公開可だが URL ごと管理する場合は `.gitignore` を検討）
- Supabase RLS（Row Level Security）を変更する場合は Supabase ダッシュボードで手動設定が必要。コードだけでは完結しない
- `app.js` が 600行を超えているため、機能追加が続く場合はモジュール分割（`quiz.js`, `tracker.js` 等）を検討する

---

*このファイルは `.cowork/improvements.md` と対になっています。設計アイデアが追加された場合は本ファイルのステップ1の優先度マッピングも合わせて更新してください。*
