# notebooks/

研究用 Jupyter notebook の置き場。出荷時は空で、ユーザが埋める領分。

notebook 管理ツール（jupytext / nbstripout / nbqa など）はオプション層の
`notebook` extra に含まれ、既定では導入されない。導入は `task setup:notebook`。
運用（出力除去の pre-commit overlay など）は
[docs/optional/notebook.md](../docs/optional/notebook.md)。
