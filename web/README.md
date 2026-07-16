# スパイラル英文法 — Web(PWA)版

iOSアプリと同じ問題・同じ付箋(Leitner)ロジック・同じFirebaseランキングをブラウザでもAndroidでも使える、静的PWA(Progressive Web App)です。ビルド不要・素のHTML/CSS/JSで動きます。

## 特長

- **3タブ**: 解く / あしあと / 設定
- 本+5色の付箋、分野から解く、小テスト作成、間違えた問題、検索、ブックマーク、メモ
- 4択クイズ・解説・正解演出・効果音・読み上げ(TTS)・バイブ(Android)
- Streak・がんばりカレンダー・統計
- **iOS版と共有のFirebaseランキングとグループ**(匿名ID・ニックネームのみ送信)
- 学習データは端末内(IndexedDB)。ランキングONの時だけ集計値を送信
- **オフライン対応**(Service Worker)・**ホーム画面に追加**でアプリ風

## ローカルで試す

```bash
cd web
python3 -m http.server 8099
# ブラウザで http://localhost:8099/
```

## 公開(GitHub Pages)

このフォルダ(`web/`)の中身をそのまま公開するだけです。相対パス(`./`)のみ使うので、
**どのサブディレクトリに置いても動きます**。

おすすめは、既存の公開リポジトリ `english-grammar-app-pages` の中に
`app/` フォルダを作り、この `web/` の中身をコピーする方法:

```
english-grammar-app-pages/
└── app/            ← ここに web/ の中身をすべてコピー
    ├── index.html
    ├── manifest.webmanifest
    ├── sw.js
    ├── css/ js/ data/ icons/ sounds/
```

公開URL: `https://macsa2ki25-eng.github.io/english-grammar-app-pages/app/`

生徒にはこのURLを共有し、「ブラウザのメニュー → ホーム画面に追加」を案内してください。

## 問題データの更新

アプリ本体の `assets/data/*.json` を更新したら、Web版にも反映します:

```bash
python3 scripts/sync_web_data.py
```

## Firebase について

- 設定は iOS 版と同一(`web/js/cloud.js`)。同じ Firestore を共有するので、
  Android生徒もiOS生徒と同じランキング・グループで競えます。
- Firestore セキュリティルールは既存のまま(匿名認証・読み取り全員可・自分の
  ドキュメントのみ書き込み可)で動作します。追加設定は不要です。
- Firebase CDN(gstatic)が読めない環境では、ランキングだけ自動的に無効化され、
  学習機能はそのまま使えます。

## 制限事項

- **通知(Streakリマインダー)**: Android の一部ブラウザ/ホーム追加時のみ。
  iOS Safari のブラウザ通知は制限が多く、確実ではありません(設定は保存されます)。
- iOS の App Store 版のような OS 連携(本物のプッシュ通知・ハプティクスの細かさ)は
  ブラウザの制約上、簡易版になります。
