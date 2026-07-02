# extras の依存監査（オプション・pip-audit）

コアの依存監査ゲート（CI `audit` ジョブ / `task security` の pip-audit）は、監査対象を
`uv export --locked --format requirements-txt --no-emit-project` の既定セット
（default groups = dev ＋ 推移依存）に固定している。extras（`research` / `notebook` /
`experiment`）は export 既定で除外されるため**コアゲートの対象外**。これは
mlflow / dvc 等の重量依存が持ち込む大量の advisory でコア CI が赤化するのを防ぐための
線引きであって、「extras は監査しなくてよい」という意味ではない。

**extras を導入したプロジェクトは、この手順で extras 込みの監査を自分のゲートに
組み込むことを推奨する。**

## extras 込みで pip-audit を回す

監査対象は環境ではなく export（uv.lock 由来の固定セット）に対して取る。
コアゲートと同じ方式で、`--all-extras`（または `--extra <name>`）だけを足す:

```bash
req="$(mktemp)"
uv export --locked --format requirements-txt --no-emit-project --all-extras -o "$req"
uv run --locked --group security pip-audit -r "$req"
rm -f "$req"
```

特定 extra のみ監査する場合:

```bash
uv export --locked --format requirements-txt --no-emit-project --extra research -o "$req"
```

- `uv sync --all-extras`（`task setup:all`）を済ませていなくても実行できる
  （export は uv.lock から取るため。pip-audit 自体は security group が供給する）。
- pip-audit は advisory DB の照会にネットワークを使う（オフラインでは実行不可）。
- CI に常設する場合は、コアの `audit` ジョブとは別ジョブ（または別 workflow）にして
  extras 起因の赤がコア green と混ざらないようにする（extras-smoke と同じ分離方針）。

## 不可避 advisory の扱い（--ignore-vuln）

修正版が未リリース・当該コードパスを使わない等で対応できない advisory は、
**理由コメント付き**で `--ignore-vuln <ID>` に載せる（ID は GHSA / CVE / PYSEC 形式）:

```bash
uv run --locked --group security pip-audit -r "$req" \
  --ignore-vuln GHSA-xxxx-xxxx-xxxx  # <パッケージ名>: 修正版未リリース・影響コードパス不使用（YYYY-MM-DD 判断・次回依存更新で見直す）
```

運用ルール:

- ignore は「対応の先送りの記録」であって恒久設定ではない。理由と判断日を必ず残し、
  依存更新のたびに解消可否を見直す。
- まず依存更新（`uv lock --upgrade-package <name>` → `uv sync --locked` →
  `task check`）で解消できないかを検討し、ignore は最後の手段にする。
- コアゲート（CI `audit` ジョブ / `task security`）に ignore を足す場合は、
  両方に同じ ID・同じ理由コメントを入れて監査範囲の一致を保つ。

## extras のリスクは監査ツールでは閉じない

pip-audit が検出するのは既知 CVE のみ。extras のツール群は性質上それ以外のリスク面を
持ち、これらの管理は利用者（各プロジェクト）に委ねる:

- **外部接続**: mlflow（tracking server への送信）・dvc（remote storage への push/pull）
  は実験データ・成果物を外部へ送る。送信先と認証情報の管理は各プロジェクトの責任。
- **認証情報**: dvc remote / mlflow の credential を `.env` やリポジトリにコミット
  しない（コアの secret 方針 = gitleaks / detect-private-key はそのまま適用される）。
- **ファイル操作**: dvc はワークスペースのファイルを大きく動かす。`dvc checkout` 等の
  破壊的操作は挙動を理解してから使う。
- **notebook**: 出力セルへの secret・生データ混入は nbstripout で防ぐ
  （[notebook.md](notebook.md) 参照）。
