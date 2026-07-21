# TosSkillSimulator 引き継ぎドキュメント

Tree of Savior（**jTOS / 日本サーバ**）のスキルシミュレータを GitHub Pages で公開するプロジェクト。
このドキュメントは別環境で作業を継続するための現状まとめ。

---

## 1. プロジェクト概要

- **目的**: jTOS のスキルシミュレータ（スターター系統選択 → ジョブ4枠 → スキルにポイント振り分け → SP/効果集計 → URL共有）を作り、GitHub Pages で配信する。
- **参考元**: `jtos.gihyeonofsoul.com` のプランナー（保存ページが `C:\Users\pinnk\Downloads\Gihyeon of Soul_files`）。UI/データモデルの参考。ただしスキルの実数値は同サイトのサーバから fetch する方式で、保存ファイルには含まれない。
- **技術スタック**: React + TypeScript + Vite（GitHub Pages は静的配信のみのため全てクライアントサイド）。

---

## 2. リポジトリ / GitHub アカウント設定

- **ワークスペース**: `C:\Users\pinnk\Documents\TosSkillSimulator`
- **リモート**: `https://github.com/pinnkoro/TosSkillSimulator`
  - ※ユーザー名は当初 `ryuki-hayashi` → 途中で **`pinnkoro`** に変更された。ID は不変(60339654)。
- **公開URL（GitHub Pages）**: https://pinnkoro.github.io/TosSkillSimulator/
- **アカウント分離**（普段使いの仕事用 `ryuki-hayashi-edgex` とは別の個人アカウントで運用）:
  - commit identity は**リポジトリローカル設定**: `pinnkoro <60339654+pinnkoro@users.noreply.github.com>`
  - 認証は gh をリポジトリローカルの credential helper に設定（`!gh auth git-credential`）、現在 active な個人アカウントで解決。
  - **グローバル設定（仕事用）は未変更。**
  - push が弾かれたら gh の active が仕事用に切り替わっている可能性 → `gh auth switch -u ryuki-hayashi`（ラベルは旧名のまま＝個人アカウント）。
- **デプロイ**: `.github/workflows/deploy.yml`（main push で自動ビルド＆Pages デプロイ）。Pages は「GitHub Actions」ソースで有効化済み。初回デプロイ成功済み。

---

## 3. データパイプライン（このプロジェクトの一番の肝）

### 結論: 現行 jTOS データは「自分のゲームクライアントの IES から抽出」して同梱する

検討した他ソースは全て不適だった:
| ソース | 判定 |
|---|---|
| tos.guru (rjgtav/tos-database) | ❌ 2020年3月で更新停止。84ジョブのみで新クラス欠落 |
| gihyeonofsoul（参考元）API | ❌ 直アクセスは 403（Cloudflare）。自動取得不可 |
| SalmanTKhan/TreeOfSaviorDB | データJSONはリポジトリに無し（各自クライアントからパーサ生成方式）。ただし**純Pythonのipf/iesリーダーがフォーマット仕様の参考**になった |

### ライセンスの前提（ユーザー了承済み）
- IPF/IES のファイル**フォーマット**は事実仕様（自前実装OK）。
- 抽出される**スキル/ジョブの実データとアイコンは © IMCGAMES CO., LTD.**。tos.guru/gihyeonofsoul 等の既存ファンツールと同じく「黙認されているファンプロジェクト」の立場でデータを同梱する、という方針をユーザーが選択済み。

### クライアント
- **jTOS は Steam 版**: `C:\Program Files (x86)\Steam\steamapps\common\Tree of Savior (Japanese Ver.)`
- データは `data/*.ipf` と `patch/*.ipf`（番号が大きいほど新しく、後のパッチが上書き）。
- ⚠️ **ゲーム(`Client_tos_x64`)起動中は IPF が排他ロックされ読めない。抽出前にゲームを終了すること。** Steam は起動したままでOK。

### 抽出の仕組み（自前実装、`tools/`）
- **`tools/tos_extract.py`**: IPF(footer/file-table/Pkware traditional暗号/deflate)と IES(ヘッダ/列定義/行、文字列は XOR 0x01)を解析する自前リーダー。全 ipf を patch 順に走査し、対象 `.ies` の最新版を取得。
  - CLI: `python tools/tos_extract.py dump`（列確認）/ `python tools/tos_extract.py skill.ies`（JSON出力）
- **`tools/build_game_data.py`**: 下記を連結して `src/data/game-data.json` を生成:
  - `job.ies` … クラス定義（ClassName=`Char{tree}_{n}`, JobName, Icon, Rank, EnableJob）
  - `skilltree.ies` … **ジョブ↔スキル対応 + スキルの MaxLevel / UnlockClassLevel**（ClassName `Char1_1_1` の末尾 `_N` を除くとジョブ ClassName、`SkillName` が skill.ies の ClassName）
  - `skill.ies` … スキル数値（SklFactor, SklFactorByLevel, BasicSP, LvUpSpendSp, BasicCoolDown, AttackType, Attribute 等）
  - `skill.tsv` / `etc.tsv` … **日本語化辞書**。IES の `Name` は**韓国語原文**なので、TSV（列: `[キー, 日本語, 韓国語]`）の**韓国語列→日本語列でジョイン**して日本語名にする。

### 生成結果（現状コミット済みの `src/data/game-data.json`）
- **133ジョブ / 898スキル**、patch 405062。gihyeonofsoul の133ジョブと一致。
- 5系統（warrior/wizard/archer/cleric/scout）、各27前後、base(スターター)クラス = 各系統 `Char{n}_1`（Swordman1001, Wizard2001, Archer3001, Cleric4001, Scout5001）。
- 日本語名・スキル説明入り。

### 再生成手順（別環境でも同様）
```bash
# 1) jTOS クライアントを完全終了（Client_tos_x64 を落とす）
# 2) tools/tos_extract.py の CLIENT_ROOT を環境のパスに合わせる
python tools/build_game_data.py   # -> src/data/game-data.json
```

---

## 4. 現状（完了 / 未完了）

### 完了
- [x] リポジトリ/アカウント/Pages/CI 構築、初回デプロイ成功
- [x] データパイプライン確立（自前 IPF/IES 抽出 → 日本語化 → game-data.json 生成）
- [x] `src/data/game-data.json`（133ジョブ/898スキル、特性1297件、aoeRatio/overheat）生成・コミット
- [x] `src/types.ts` を現行スキーマに更新
- [x] UI骨組み: 系統選択 → ジョブ4枠(枠0=base固定) → スキルにレベル振り → 集計 → URL(hash)共有
- [x] スキルカード: コンパクト表示（アイコン＋名前＋Lv常時）＋**ホバーで詳細ポップアップ**（factor/+攻/SP/CD・overheat/AoE・レベル別表・説明）
- [x] 特性: **アイコンで常時表示・クリックでON/OFF・URL(hash `a=`)共有対象**。ホバーで名前/説明
- [x] クラス特性（スキル非依存、ability.ies `SkillCategory=="All"`）をジョブ枠に表示・同様にトグル/共有
- [x] スキルポイント上限: **base職15 / それ以降45 + 全職共有の追加プール21pt**（build.ts で頭打ち enforcement、topbar に「追加 n/21」）
- [x] アイコン同梱（`extract_icons.py` → `public/icons/`、スキル769＋クラス114、64px）
- [x] ビルド/lint 通過・コミット・push（自動デプロイ）

### 未完了 / 今後の候補
- [ ] 特性のレベル振り（現状は ON/OFF のみ。Lv100 等の段階は未対応）
- [ ] バフ持続時間等、Lua(`SCR_*`)依存の説明文数値の完全再現（重いので保留）
- [ ] game-data.json が JS バンドルに同梱され初期ロードが大きい（必要なら fetch 分離）

---

## 5. 実データのスキーマ（`src/data/game-data.json`）

`src/types.ts` はこの構造に合わせて更新すること（現行の types.ts は初期の別スキーマなので古い）。

```jsonc
{
  "meta": { "source": "jTOS client (extracted, 405062_001001.ipf)", "note": "...(c) IMCGAMES...", "jobCount": 133, "skillCount": 898 },
  "trees": [ { "id": "warrior", "name": "ソードマン", "baseJobId": 1001 }, ... ],   // 5系統
  "jobs": [
    { "id": 1001, "className": "Char1_1", "name": "ソードマン", "engName": "Swordman",
      "tree": "warrior", "isBase": true, "rank": 1, "icon": "c_warrior_swordsman",
      "skillIds": [10101, 10102, ...],
      "attributes": [ ... ] }, ...   // クラス特性(スキル非依存)。ability.ies SkillCategory=="All"
  ],
  "skills": {
    "30005": {
      "id": 30005, "className": "Archer_ObliqueShot", "name": "オブリークショット",
      "icon": "arch_obliquestance", "maxLevel": 5, "unlockClassLevel": 1,
      "type": "attack",           // "attack" | "buff"
      "element": "Melee",         // Attribute 文字列
      "cooldown": 1000,           // ms
      "overheat": 0,              // オーバーヒート回数 (SklUseOverHeat)
      "aoeRatio": 10,             // AoE攻撃比率 (SklSR)。0以下は該当なし
      "sp":     { "base": 11,     "perLevel": 0 },      // SP消費
      "factor": { "base": 1754.5, "perLevel": 263.3 },  // スキルファクター%
      "atkAdd": { "base": 0,      "perLevel": 0 },      // 固定加算
      "description": "...",
      "attributes": [             // スキル特性 (ability.ies, SkillCategory==className で紐付け)
        { "id": 101001, "name": "強化", "desc": "...", "icon": "ability_...", "maxLevel": 100 }, ...
      ]                           // id=ability の $ID。UI では ON/OFF トグル＋URL共有(hash の a=)
    }, ...
  }
}
```

レベル L のときの各値（UI で算出）:
- SP消費 ≒ `sp.base + sp.perLevel*(L-1)`
- スキルファクター ≒ `factor.base + factor.perLevel*(L-1)`
- 固定加算 ≒ `atkAdd.base + atkAdd.perLevel*(L-1)`
- ※攻撃スキルの係数は `#{SkillFactor}#`(=SklFactor 線形)。ヒール/バフ等は `Caption2` が参照する `#{CaptionRatioN}#` を **`script/calc_property_skill.lua` の `SCR_*` 関数から解決**する（単純な線形式のみ、`build_game_data.py:load_skill_ratios`）。ステータス(INT/MNA)依存の値は静的計算不可のため 0(非表示)。`type` も Caption2 が `SkillFactor` を使うか否かで attack/buff を判定（SklFactor>0 だけの旧判定だとベアー等のバフが attack になる）。
- ※CoolDown/SP 等その他の `SCR_*` 式は未評価（線形近似で足りる）。
- `attributes` は 659/898 スキルに存在（計1297件）。名前/説明は skill.tsv で日本語化済み。

---

## 6. 主要ファイル

| パス | 役割 |
|---|---|
| `tools/tos_extract.py` | 自前 IPF/IES リーダー（CLIENT_ROOT を環境に合わせる） |
| `tools/build_game_data.py` | IES+TSV 連結 → `src/data/game-data.json` 生成（特性含む） |
| `tools/extract_icons.py` | アイコン抽出 → `public/icons/`（要 Pillow、ゲーム終了中に実行） |
| `src/data/game-data.json` | **同梱データ（133ジョブ/898スキル、特性1297件）** |
| `public/icons/{skill,class,attr}/*.png` | **同梱アイコン（スキル769/クラス114=64px、特性1243=40px）** |
| `src/data/gameData.ts` | JSON読込＋索引（jobById/skillById 等） |
| `src/lib/build.ts` | ビルド状態・URL(hash)エンコード/デコード・集計 |
| `src/lib/icons.ts` | アイコンURLヘルパ（BASE_URL 対応） |
| `src/components/SkillCard.tsx` | スキルカード（アイコン/レベル別表/特性） |
| `src/types.ts` | 型定義（§5準拠） |
| `vite.config.ts` | `base` は本番ビルド時のみ `/TosSkillSimulator/` |
| `.github/workflows/deploy.yml` | main push で Pages 自動デプロイ |

### アイコン再生成
```bash
# ゲーム終了中に。src/data/game-data.json が先に必要。
python tools/extract_icons.py   # -> public/icons/skill,class/*.png (64px)
```

### 掃除すべき残骸
- `data-src/`（tos.guru の旧CSV + 巨大な中間ダンプ）。gitignore 済み（未コミット）。
- ~~`scripts/build-data.mjs`~~ 削除済み。

---

## 7. ハマりどころ / 環境メモ

- **ゲーム起動中は IPF が読めない**（排他ロック）。抽出前に `Client_tos_x64` を終了。
- **IES の Name は韓国語**。日本語化は skill.tsv/etc.tsv の韓国語→日本語ジョインが必須。
- **アイコン**は IMC 著作物だが、データ本体と同じ「黙認ファンプロジェクト」の立場で同梱する方針（ユーザー了承済み）。スキルは `ui.ipf` 内の個別PNG(`icon/skill/<系統>/icon_<名前>.png`)、クラスは**アトラス** `icon/class_<系統>.tga` を `baseskinset/classicon.xml` の `imgrect` で切り出し。`extract_icons.py` が 64px に縮小して `public/icons/` へ出力。**要 Pillow**（抽出本体は標準ライブラリのみだが縮小/TGA切出しに使用）。⚠️ `job.ies` の Icon 名と classicon.xml の name は大小が食い違うので**大小無視で照合**。
- Windows ホストはノートン360が HTTPS を MITM しており `curl` 等が TLS エラー（exit 35）になる。**サイト死活は curl でなくブラウザ or gh API で確認**。外部 HTTPS を叩く処理は WSL 推奨（IPF/IES 抽出は純ローカル処理なので host でOK）。
- Python は python.org 版（3.14）。IPF/IES 抽出(`tos_extract.py`/`build_game_data.py`)は標準ライブラリ(struct/zlib)のみ。アイコン抽出(`extract_icons.py`)のみ **Pillow** に依存。
- `read_table()` は呼ぶたび全 ipf を再スキャンするので、多数テーブルを読むときは 1 パスで newest-wins する（`build_game_data.py:load_ability_maxlevels` 参照）。忘れると ability_*.ies 120個で数分かかる。

---

## 8. 次にやることの推奨順序

1. `data-src/` と `scripts/build-data.mjs` を削除（or gitignore）。
2. `src/types.ts` を §5 のスキーマに更新。
3. データアクセス層（`src/data/gameData.ts`: json読み込み + jobById/skillById 索引）。
4. ビルド状態 + URL エンコード/デコード（hash に系統・4ジョブ・スキルレベルを格納）。
5. UI コンポーネント（系統選択 / ジョブ枠 / スキルカード(レベルステッパ) / 集計バー）。
6. `npm run build` 確認 → コミット → push（自動デプロイ）。
```
