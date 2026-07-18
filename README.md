# TosSukillSimulator

ゲームのスキルシミュレータ。React + TypeScript + Vite で構築し、GitHub Pages で配信する。

## 開発

```bash
npm install
npm run dev      # ローカル開発サーバ (http://localhost:5173)
npm run build    # 本番ビルド (dist/)
npm run preview  # ビルド結果をローカル確認
```

## デプロイ

`main` ブランチへ push すると GitHub Actions (`.github/workflows/deploy.yml`) が
自動でビルドし GitHub Pages へデプロイする。

公開URL: https://pinnkoro.github.io/TosSukillSimulator/

### 初回のみ必要な設定（GitHub 側）

リポジトリの **Settings → Pages → Build and deployment → Source** を
**GitHub Actions** に設定する。

## 技術メモ

- `vite.config.ts` の `base` は本番ビルド時のみ `/TosSukillSimulator/`（プロジェクトページのパス）。
  ローカル開発では `/` を使う。
