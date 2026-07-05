# configs/

実験設定ファイル（hydra / yaml など）の置き場。出荷時は空で、ユーザが埋める領分。

設定管理ツール（hydra-core など）はオプション層の `experiment` extra に含まれ、
既定では導入されない。導入は `task setup:experiment`。
