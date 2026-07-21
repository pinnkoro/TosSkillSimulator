# TosSkillSimulator

**Tree of Savior（jTOS / 日本サーバ）のスキルシミュレータ。**
スターター系統を選び → ジョブを4枠まで積み → スキルにポイントを振り → SP・スキルファクター等を集計し、ビルドを URL で共有できる。React + TypeScript + Vite 製の完全クライアントサイド SPA で、GitHub Pages で配信している。

**公開URL**: https://pinnkoro.github.io/TosSkillSimulator/

---

## 主な機能

- **系統選択 → ジョブ4枠**: 5系統（ソードマン / ウィザード / アーチャー / クレリック / スカウト）から1つを選ぶと、枠0にスターター（base）クラスが固定され、枠1〜3で同系統の上位クラスを重複なく選べる。
- **スキルのレベル振り**: 各スキルをコンパクトなカードで表示。ホバーで詳細ポップアップ（スキルファクター / 固定加算 / SP / クールタイム / オーバーヒート / AoE比率 / レベル別テーブル / 説明文）が開く。
- **スキルポイント上限ルール**: base職 **15pt** / 上位職 **45pt** を各職の基本枠とし、さらに全職共有の **追加プール 21pt** まで基本枠を超えて振れる。上限は自動で頭打ちになり、トップバーに「追加 n/21」を表示。
- **特性（アビリティ）のトグル**: スキル特性・クラス特性をアイコンで常時表示。クリックで ON/OFF、ホバーで名前・説明。
- **URL 共有**: 系統・4ジョブ・スキルレベル・特性の選択状態を URL の `#` ハッシュに保存。`lz-string` で圧縮するため要素が増えても URL が伸びにくい。「URLを共有」ボタンでクリップボードにコピー。ブラウザの戻る/進むにも追従。
- **多言語（i18n）**: 日本語 / 한국어 を切り替え可能。UI 文言と、スキル名・説明などのデータ（`Loc { ja, ko }`）の両方を出し分ける。選択言語は `localStorage` に保存。

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フレームワーク | React 19 + TypeScript |
| ビルドツール | Vite 8 |
| Lint | oxlint |
| 圧縮 | lz-string（URL ハッシュのペイロード圧縮） |
| ホスティング | GitHub Pages（GitHub Actions で自動デプロイ） |
| データ抽出 | Python（自前 IPF/IES パーサ。標準ライブラリ + アイコンのみ Pillow） |

ゲームデータとアイコンはビルド時にリポジトリへ同梱する（サーバ側処理は無く、実行は全てブラウザ内で完結する）。

---

## 開発

```bash
npm install
npm run dev      # ローカル開発サーバ (http://localhost:5173)
npm run build    # 型チェック(tsc -b) + 本番ビルド (dist/)
npm run preview  # ビルド結果をローカル確認
npm run lint     # oxlint
```

---

## プロジェクト構成

```
src/
  App.tsx                 UI ルート（系統選択 / ジョブ枠 / スキル一覧 / 集計 / 共有）
  types.ts                型定義（game-data.json のスキーマに対応）
  data/
    game-data.json        同梱データ（133ジョブ / 898スキル / 特性1297件）
    gameData.ts           JSON 読込 + 索引（jobById / skillById など）
  lib/
    build.ts              ビルド状態・ポイント上限ルール・URL エンコード/デコード・集計
    i18n.ts               UI 文言辞書 + 言語状態(Context) + データ翻訳 tl()
    LangProvider.tsx       言語 Context の Provider
    icons.ts              アイコン URL ヘルパ（BASE_URL 対応）
  components/
    SkillCard.tsx         スキルカード（レベルステッパ / レベル別表 / 特性）
    AttrChip.tsx          特性アイコン（ON/OFF トグル）
public/icons/             同梱アイコン（skill / class / attr の PNG）
tools/                    データ抽出パイプライン（Python、下記参照）
.github/workflows/deploy.yml   main push で GitHub Pages 自動デプロイ
```

---

## データパイプライン

現行 jTOS データは**自分のゲームクライアントの IPF/IES から自前パーサで抽出**して同梱する（外部 API は Cloudflare で 403、既存 DB は更新停止のため不適）。IPF/IES のファイルフォーマットは事実仕様として自前実装し、抽出される**スキル/ジョブの実データとアイコンは © IMCGAMES CO., LTD.**（既存ファンツール同様、黙認されているファンプロジェクトの立場で同梱）。

### ツール（`tools/`）

| スクリプト | 役割 |
|---|---|
| `tos_extract.py` | 自前 IPF/IES リーダー。IPF(footer/file-table/PKWARE暗号/deflate) と IES(ヘッダ/列定義/行, 文字列は XOR 0x01) を解析。patch 順に走査し対象 `.ies` の最新版を取得。標準ライブラリのみ |
| `build_game_data.py` | `job.ies` / `skilltree.ies` / `skill.ies` / `ability.ies` を連結し、`skill.tsv`・`etc.tsv`（韓国語→日本語辞書）でジョインして `src/data/game-data.json` を生成 |
| `extract_icons.py` | スキル/クラス/特性アイコンを抽出し `public/icons/` へ出力（要 Pillow） |

### データ再生成手順

```bash
# 1) jTOS クライアント(Client_tos_x64)を完全終了する
#    ⚠️ ゲーム起動中は IPF が排他ロックされ読めない（Steam 自体は起動したままでOK）
# 2) tools/tos_extract.py の CLIENT_ROOT を環境のパスに合わせる
python tools/build_game_data.py   # -> src/data/game-data.json
python tools/extract_icons.py     # -> public/icons/{skill,class,attr}/*.png
```

- IES の `Name` は**韓国語原文**。日本語化は `skill.tsv` / `etc.tsv` の韓国語列→日本語列ジョインが必須。
- 攻撃スキルの係数は `SkillFactor`（線形）。ヒール/バフ等は `script/calc_property_skill.lua` の `SCR_*` 関数（単純な線形式のみ）から解決。ステータス（INT/MNA）依存の値は静的計算できないため 0（非表示）。

### データスキーマ（`src/data/game-data.json`）

```jsonc
{
  "meta": { "source": "jTOS client (extracted, ...)", "note": "(c) IMCGAMES ...",
            "jobCount": 133, "skillCount": 898 },
  "trees": [ { "id": "warrior", "name": {"ja":"ソードマン","ko":"검사"}, "baseJobId": 1001 }, ... ],
  "jobs": [
    { "id": 1001, "className": "Char1_1", "name": {"ja":"ソードマン","ko":"검사"},
      "engName": "Swordman", "tree": "warrior", "isBase": true, "rank": 1,
      "icon": "c_warrior_swordsman", "skillIds": [10101, ...],
      "attributes": [ /* クラス特性(スキル非依存) */ ] }, ...
  ],
  "skills": {
    "30005": {
      "id": 30005, "className": "Archer_ObliqueShot",
      "name": {"ja":"オブリークショット","ko":"..."},
      "icon": "arch_obliquestance", "maxLevel": 5, "unlockClassLevel": 1,
      "type": "attack",        // "attack" | "buff"
      "element": "Melee",      // Attribute 文字列
      "cooldown": 1000,        // ms
      "overheat": 0,           // オーバーヒート回数
      "aoeRatio": 10,          // AoE攻撃比率。0以下は該当なし
      "sp":     { "base": 11,     "perLevel": 0 },      // SP消費
      "factor": { "base": 1754.5, "perLevel": 263.3 },  // スキルファクター%
      "atkAdd": { "base": 0,      "perLevel": 0 },      // 固定加算
      "description": {"ja":"...","ko":"..."},
      "attributes": [ { "id": 101001, "name": {...}, "desc": {...},
                       "icon": "ability_...", "maxLevel": 100 }, ... ]
    }, ...
  }
}
```

レベル `L` の各値は UI 側で `value ≒ base + perLevel * (L - 1)` として算出する（`sp` / `factor` / `atkAdd`）。

---

## URL 共有フォーマット

ビルド状態は URL の `#` ハッシュにシリアライズされる。内部表現は `URLSearchParams` 形式のクエリ文字列で、それを `lz-string` で圧縮してハッシュに載せる。

| キー | 内容 |
|---|---|
| `t` | 系統ID（例: `warrior`） |
| `j` | 枠1〜3のジョブID（`.` 区切り。枠0=base は系統から復元） |
| `s` | スキルレベル（`skillId-level` を `.` 区切り） |
| `a` | ON にした特性ID（`.` 区切り） |

旧形式（未圧縮の平文クエリ = `=` を含む）も後方互換で読める。

---

## デプロイ

`main` ブランチへ push すると GitHub Actions（`.github/workflows/deploy.yml`）が自動でビルドし GitHub Pages へデプロイする。

### 初回のみ必要な設定（GitHub 側）

リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定する。

### 技術メモ

- `vite.config.ts` の `base` は本番ビルド時のみ `/TosSkillSimulator/`（プロジェクトページのパス）。ローカル開発では `/` を使う。アイコン等の URL は `src/lib/icons.ts` が `BASE_URL` を考慮して組み立てる。

---

## 現状と今後の候補

**実装済み**: データパイプライン（IPF/IES 抽出 → 日本語/韓国語化 → JSON 生成）、系統/ジョブ/スキルの UI、スキルカードのホバー詳細、特性トグル、ポイント上限ルール、URL 共有、日本語/韓国語 i18n、GitHub Pages 自動デプロイ。

**今後の候補**:
- 特性のレベル振り（現状は ON/OFF のみ。Lv100 等の段階は未対応）
- Lua(`SCR_*`)依存のバフ持続時間など、説明文中の数値の完全再現
- `game-data.json` の初期ロード分離（現状は JS バンドルに同梱）

> より詳細な開発経緯・ハマりどころ・環境固有の注意点は [HANDOFF.md](HANDOFF.md) を参照。

---

## ライセンス / 権利表記

抽出される**スキル・ジョブの実データおよびアイコンは © IMCGAMES CO., LTD. All Rights Reserved.** 本プロジェクトは非公式のファンツールであり、IMC GAMES とは関係ない。抽出用パーサ等のコードはフォーマット仕様に基づく自前実装。
