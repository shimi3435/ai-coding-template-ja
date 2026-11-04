# Issue と仕様の参照先

文書種別: 上流 engineering Skills が参照する repository 設定。

Issue tracker は、この checkout の Git remote が指す利用者の GitHub repository とする。
upstream Skill の配布元 mattpocock/skills を作業対象の Issue tracker と取り違えない。
読み取りには `gh` CLI を使い、Issue 本文とコメントから目的・受入条件・追補を確認する。
利用者が対象 repository や仕様のパスを指定した場合は、その指定を優先する。

OpenSpec change がある場合、承認済み proposal・design・spec delta を実装仕様、`tasks.md` を詳細タスクと
進捗の正本とする。Issue との食い違いは報告して解決し、変更の目的を黙って縮小しない。
レビュー入力には、対象の Issue と該当する OpenSpec artifacts または利用者指定の仕様を渡す。
仕様が特定できない場合は利用者へ確認し、欠落を検証済みと扱わない。

Issue の作成・編集・コメント・ラベル・close は [AGENTS.md](../../AGENTS.md) の外部 write 方針に従う。
setup-matt-pocock-skills の同梱や、他 Skill の呼出だけで外部 write を許可したとはみなさない。
PR は既定で実装差分のレビュー対象とし、Issue に代わる要求受付の入口にはしない（PRs as a request surface: no）。

tracker や用語文書の配置を変更する場合は setup-matt-pocock-skills を使える。共通設定の参照先は
AGENTS.md に置き、CLAUDE.md には Claude Code 固有の補足だけを書く。
