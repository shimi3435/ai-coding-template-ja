# notebook 管理（オプション・notebook extra）

Jupyter notebook を研究で使う場合の opt-in 手順。コアは notebook を前提にしない
（コア CI / `task check` / コア `.pre-commit-config.yaml` は notebook に触れない）。

導入するツール（`notebook` extra・version は `uv.lock` に固定）:

- **jupyter** … notebook 実行環境
- **jupytext** … notebook と `.py`（percent 形式等）のペア管理（diff / レビュー可能に）
- **nbstripout** … 出力セル除去（**強く推奨**。出力セルへの secret・API key・
  生データの混入をコミット前に防ぐ）
- **nbqa** … notebook に対する lint（ruff）実行

## 導入

```bash
task setup:notebook        # uv sync --extra notebook
# research extra と併用する場合
uv sync --extra notebook --extra research
# 全部入り
task setup:all             # uv sync --all-extras
```

導入後の確認:

```bash
uv run --no-sync jupytext --version
uv run --no-sync nbstripout --version
uv run --no-sync nbqa --version
```

## 在席ガード付き task（extra 未導入なら skip・案内のみで exit 0）

| タスク | 内容 |
| --- | --- |
| `task nb:strip` | 追跡中／未追跡の `*.ipynb` の出力セルを nbstripout で除去 |
| `task nb:sync` | ペア済み notebook を `jupytext --sync` で同期 |
| `task nb:check` | `nbqa ruff` で notebook を lint |

`task security` と同型の設計: extra 未導入の環境でタスクを叩いてもコミットや CI を
ブロックしない（opt-in 原則）。

## jupytext ペア設定（nb:sync の前提）

`jupytext --sync` はペア設定済みの notebook のみ同期できる。初回に一度ペアを張る:

```bash
uv run --no-sync jupytext --set-formats ipynb,py:percent notebooks/example.ipynb
# → notebooks/example.py（percent 形式）が生成され、以後 nb:sync で相互同期
```

## pre-commit overlay（推奨・各プロジェクトで opt-in）

コアの `.pre-commit-config.yaml` には notebook hook を**入れていない**（extra 未導入の
環境で `uv run --no-sync nbstripout` がツール不在になり、コミットがブロックされて
opt-in 原則に反するため）。notebook extra を導入したプロジェクトでは、以下 snippet を
`.pre-commit-config.yaml` の `repos:` 配下（`repo: local` の `hooks:` 末尾）に追記する:

```yaml
      # notebook extra 導入後のみ有効化（docs/optional/notebook.md）。
      # nbstripout: 出力セルの secret / データ漏洩防止（強く推奨）
      - id: nbstripout
        name: nbstripout
        entry: uv run --no-sync nbstripout
        language: system
        types: [jupyter]
      # jupytext: ペア済み notebook の同期漏れ防止（ペア運用時のみ）
      - id: jupytext-sync
        name: jupytext --sync
        entry: uv run --no-sync jupytext --sync
        language: system
        types: [jupyter]
        require_serial: true
```

`repo: local` + `uv run --no-sync` はコアの ruff hook と同じ方式で、hook のツール
version 源を `uv.lock` に単一化するため（pre-commit 側の rev pin と lock のズレを防ぐ）。

追記後の確認:

```bash
uv run pre-commit run nbstripout --all-files
```

## 解除

overlay snippet を `.pre-commit-config.yaml` から削除し、extra を外して同期し直す
（`uv sync` は無印で dev group のみに戻る）。
