# Skill は vendoring し `.agents/skills` を単一の正とする

コア Skills（grill-me / grill-with-docs / tdd / diagnose / caveman）は実体をリポジトリに同梱（vendoring）し、`.agents/skills/` を正本とする。`.claude/skills` はそこへの symlink とし、Claude Code / Codex の両方が同一 SKILL.md を参照する（Codex も `$HOME/.agents/skills` 等を skill root として読む）。再現性を最優先し、外部からの自動 latest 更新は行わず、更新は `task skills:update` で明示的にのみ行う。

## Considered Options

- **npx / CLI でセットアップ時取得**: リポジトリは軽いがネットワーク・供給元依存でオフライン不可。再現性が弱い。
- **git submodule**: 版固定は厳密だが「Use this template」/ clone を複雑化し template repo との相性が悪い。

## Consequences

- 第三者 skill を公開 template に同梱＝再配布になるため、各 skill の LICENSE が再配布可か・帰属表示要否を取り込み時に確認し、供給元 commit と併せて `docs/agents/mcp.md`（または skills lock）へ記録する。
- ルート LICENSE は **MIT**（テンプレ著者のオリジナル成果物に適用）。vendored skill は MIT 配下に含めず、`.agents/skills/<skill>/LICENSE` を各々同梱し、供給元 / 版 / ライセンスを skills lock に記録する。copyleft（GPL 等）/ 再配布不可 / 帰属必須の skill は、MIT テンプレへの同梱可否を取り込み時に判定し、不可なら vendoring せず opt-in 取得へ回す。README / LICENSE に「vendored skill は各 LICENSE に従う」旨を補記する。
- skills lock のファイル名と schema を固定する: `.agents/skills/skills.lock.json`。必須項目 = `name / source / commit / license / license_file / redistribution`。PR2 受け入れに schema 検証（全 vendored skill が lock に記載・`license_file` 実在）を含める。例:

  ```json
  {
    "skills": [
      {
        "name": "tdd",
        "source": "https://github.com/org/repo",
        "commit": "abc123",
        "license": "MIT",
        "license_file": ".agents/skills/tdd/LICENSE",
        "redistribution": "allowed"
      }
    ]
  }
  ```
- symlink は Ubuntu 限定前提で安全。`.codex/skills` の symlink 要否は Codex の repo スコープ解決を実機確認して決める。
- コア Skill は配布形態で 2 分類され、vendoring 手段が異なる:
  - **純 SKILL.md 型**（tdd / diagnose / grill-me / grill-with-docs の本体）: `.agents/skills/` 同梱 + `.claude/skills` symlink で再現できる。
  - **hook / plugin 型**（caveman 等）: 機能が 2 層に分かれる。(i) SKILL.md 本体は vendoring + symlink で両エージェントとも Skill 呼び出し（明示起動）でき、この層は「両対応コア」を満たす。(ii) SessionStart / UserPromptSubmit 等での**自動発火**は `.claude/settings.json` への hook 登録に依存する Claude Code 固有の上乗せで、Codex の hook 機構は別物。よって自動発火層は「同一実体を両者が参照」モデルの外であり、Claude 専用の任意設定として切り出す。
  - 整合: 「caveman をコア維持」が約束するのは (i) の SKILL.md レベルの両対応まで。(ii) の Claude hook 自動発火はコア保証に含めず optional。caveman の簡素化原則自体は AGENTS.md（常時適用の最小変更ルール）にも書かれており、hook 不在でも原則は両エージェントで効く。
  - PR2 の実機確認に「各コア skill（特に caveman）の配布形態確認と、hook 自動発火層の Claude 側登録手順確定」を含める（§27）。

## 追補（Q15）: コア候補は vendoring 可否確定後に確定する

「コア Skills = grill-me / grill-with-docs / tdd / diagnose / caveman の 5 つ」は**コア候補**であり、各 skill の供給源とライセンスを調査するまで確定しない。本 ADR 自身が「copyleft / 再配布不可 / 帰属必須なら vendoring せず opt-in 取得へ回す」と例外を持つため、5 つ全てがコア vendoring 可能とは限らない。これを明示的なゲートにする。

- **PR2 のブロッカーとしてライセンス調査タスクを置く**。各 skill について `source`（repo URL / plugin marketplace）と `commit` を確定し、再配布可否を 3 分類する:
  - (a) MIT / Apache 等で再配布可 → vendoring（コア・同梱）
  - (b) 帰属必須だが再配布可 → vendoring ＋ `LICENSE` / `NOTICE` 同梱（コア）
  - (c) 再配布不可 / copyleft / plugin で同梱不可 → **opt-in 取得**（コアから降格、`task skills:update` で個別取得）
- **caveman は (c) に落ちる可能性が高い前提で設計する**。SKILL.md 層まで再配布不可なら「コア Skill」の看板を外し `docs/optional` の hook 登録手順へ回す。簡素化原則は AGENTS.md（常時適用の最小変更ルール）に内包済みのため、機能自体は失われない。
- skills.lock.json の `redistribution` を `allowed` / `blocked` で必須化し、**`blocked` の skill が `.agents/skills/` に同梱されていないことを検証する CI チェック**を PR2 受け入れに追加する。
- §5.1 / §9.1 / §26 の「コア Skills = 5 つ」は「**コア候補。vendoring 可否確定後に確定**」と読み替える。
