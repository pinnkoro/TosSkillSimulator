---
name: new-class
description: jTOS クライアントの新パッチからデータを再抽出し、新クラス／新スキルをシミュレータに反映する。「新クラスが追加された」「データを最新パッチに更新して」「クラスが増えた」等のときに使う。抽出 → 差分検証 → アイコン → HANDOFF/changelog 更新 → PR → マージ → デプロイ確認まで。
---

# 新クラス対応（データ再抽出）

このリポジトリのデータは**すべて自分の jTOS クライアントから抽出**している（詳細は `HANDOFF.md` §3）。
新クラスが実装されたら、UI を触るのではなく**データを取り直す**のが基本。UI は件数もクラス一覧も
`game-data.json` 駆動なので、通常はコード変更が要らない。

## 0. 前提の確認

- ⚠️ **ゲーム（`Client_tos_x64`）を終了する。** 起動中は IPF が排他ロックされ抽出が失敗する。Steam は起動したままでよい。
  - `tasklist | grep -i tos` で常駐していないことを確認。
- クライアントに新しい patch ipf が来ているか見る（数字が大きいほど新しい）:
  ```bash
  ls "/c/Program Files (x86)/Steam/steamapps/common/Tree of Savior (Japanese Ver.)/patch/" | sort | tail
  ```
  `src/data/game-data.json` の `meta.source` にある番号より新しいものが無ければ、そもそも取り直す意味がない。
- 作業ブランチを切る（`main` に直接コミットしない）。ブランチ名は `new-class-<patch番号>` でよい。
- **再生成前に現行データを退避**しておく（次のステップの差分検証に使う）:
  ```bash
  cp src/data/game-data.json <scratchpad>/gd_old.json
  cp src/data/vaivora.json   <scratchpad>/vv_old.json
  ```

## 1. 再生成（この順番で）

```bash
python tools/build_game_data.py   # -> src/data/game-data.json   （数分かかる）
python tools/build_vaivora.py     # -> src/data/vaivora.json
python tools/extract_icons.py     # -> public/icons/**           （game-data.json が先に要る）
```

`build_vaivora.py` の出力は必ず読む。健全な状態は:
- `no description: 0` … 説明が拾えないバイボラが無い
- `skill level-ups parsed: ... 0 lines unresolved` … 効果文のスキルレベル上昇が全部 ID に解決できた
- `no class link: 5 (반향/집중방어/협응/혈투/철벽)` … これは**既知の恒常的な残り**（クラスに紐づかない汎用品）。増えていたら調べる。

解決できなかった説明が出た場合は、ゲーム内ツールチップから `tools/vaivora_desc.json` に手で書き起こす（`{"<ClassName>": {"ja","ko"}}`）。

## 2. 差分検証（ここを飛ばさない）

期待するのは**純粋な追加**。既存クラス／スキル／バイボラの値が変わっていたら、
パッチでのバランス調整か抽出の壊れかを切り分ける必要がある。

```bash
python - <<'EOF'
import json
old=json.load(open("<scratchpad>/gd_old.json",encoding="utf-8"))
new=json.load(open("src/data/game-data.json",encoding="utf-8"))
oj={j["id"]:j for j in old["jobs"]}; nj={j["id"]:j for j in new["jobs"]}
for i in sorted(set(nj)-set(oj)):
    j=nj[i]; print("+job",i,j["engName"],j["name"]["ja"],j["tree"],j["icon"],j["skillIds"])
print("-job",sorted(set(oj)-set(nj)))
os_,ns=old["skills"],new["skills"]
for k in sorted(set(ns)-set(os_),key=int):
    s=ns[k]; print("+skill",k,s["name"]["ja"],s["className"],s["icon"],"max",s["maxLevel"],"unlock",s["unlockClassLevel"])
print("-skill",sorted(set(os_)-set(ns)))
print("changed jobs  :",[i for i in set(oj)&set(nj) if oj[i]!=nj[i]])
print("changed skills:",[k for k in set(os_)&set(ns) if os_[k]!=ns[k]])
print("meta",new["meta"])
EOF
```

`vaivora.json` も同様に `entries` を `jobId` で突き合わせる（`+`/`-`/changed）。

`git status --porcelain` が `M src/data/game-data.json` / `M src/data/vaivora.json` と
**新規アイコンの `??` だけ**なら綺麗な追加。既存アイコンが `M` になっていたら中身を確認する。

### 見落としやすいケース
- **既存クラスの系統違いが増えることがある**（例: エクゼキューターは Char1_32 [S] / Char5_27 [T] に加えて Char3_32 [A] が後から追加された）。
  この場合クラスアイコンは既存を流用し（`c_warrior_executor`）、スキルは `Executor_*_Archer` のような別 ID・別名で入る。
  「新クラス1つ」と思い込まず、追加された job を全部数える。
- 新クラスには**必ず対応するバイボラが1件増える**はず。増えていなければ抽出漏れを疑う。
- スキルの解放Lvは概ね 1/1/1/16/16/31 の6種構成。ここから外れていたら本当にそうか確認する。

## 3. カウントの更新

新しい件数を出す:
```bash
python -c "
import json;d=json.load(open('src/data/game-data.json',encoding='utf-8'))
print('jobs',len(d['jobs']),'skills',len(d['skills']))
print('attrs',sum(len(s.get('attributes',[])) for s in d['skills'].values()))
print('skills with attrs',sum(1 for s in d['skills'].values() if s.get('attributes')))"
ls public/icons/skill | wc -l; ls public/icons/class | wc -l; ls public/icons/attr | wc -l
python -c "import json;print('vaivora',len(json.load(open('src/data/vaivora.json',encoding='utf-8'))['entries']))"
```

`HANDOFF.md` には件数が**複数箇所に散っている**。旧件数で grep して全部潰す:
```bash
grep -n "<旧ジョブ数>\|<旧スキル数>\|<旧特性数>\|<旧アイコン数>\|<旧バイボラ数>" HANDOFF.md
```
対象は §3 生成結果 / §4 完了リスト（データ・アイコン）/ §5 スキーマ例の `meta` / §5 末尾の特性件数 /
§6 の表（vaivora.json・game-data.json・icons）/ §7 のバイボラ説明の件数。patch 番号も更新する。

## 4. changelog（利用者向け）

`src/data/changelog.ts` の配列**先頭**に今日の日付でエントリを足す。`items` は `{ja, ko}` の両方が必須。
書くのは「利用者から見て何が変わったか」だけ（内部リファクタは載せない）。既存エントリの語り口に合わせ、
新クラス名・スキル数・バイボラ名・パッチ番号と合計クラス/スキル数を入れる。

## 5. ビルドと公開

```bash
npm run build   # tsc -b && vite build
npm run lint    # oxlint（出力が無ければ OK）
```

コミット → PR → マージ（このリポジトリの決まり: **squash + ブランチ削除**）:
```bash
git add -A && git commit    # 本文に patch 番号・追加内訳・「既存の値に変更なし」を書く
git push -u origin <branch>
gh pr create --base main --title ... --body-file -
gh pr checks <N> --watch --interval 15
gh pr merge <N> --squash --delete-branch
git fetch --prune
```
マージ後は `main` への push で Pages に自動デプロイされる。`gh run list --limit 2` で
CI と "Deploy to GitHub Pages" が両方 success になったことまで確認する。

⚠️ 表示確認は**ブラウザで**。ホストのノートン360が HTTPS を MITM しているので `curl` は TLS エラーになる。
