# 自前Node installerの撤去（Issue #52）

## Why

Issue #71で合意した、Nodeの導入機構をテンプレートが所有しない方針を実装する。
利用者とのgrillingで2026-09-21に合意し、2026-09-22に作業を再開した。

## What Changes

- **BREAKING**: bootstrapのNode download / checksum / 展開 / activation / cleanup実装と専用tests / fixturesを撤去する。
- 旧 `--install-node` は移行診断付きでexit 2とする。`--help` / `-h` は副作用なしでexit 0とし、不正引数を優先する。
- Node / npmの検査失敗は原因と共通復旧案内をstderrへ出してexit 1とする。
- 旧 `NODE_INSTALL_ROOT` は無視する。既存Node環境と通常bootstrap、doctor、CLI preflightを保持する。
- 現行案内とrelease条件を更新し、歴史文書には部分改訂を明示する。

## Impact

対象はscripts/bootstrap.sh、tests/test_bootstrap.py、README、onboarding、release文書、旧判断への注記。
仕様はspecs/bootstrap/spec.md、設計はdesign.md、穴の判断と検証対応はspec-holes.mdに置く。
AGENTS.mdのOSWF-5が適用され、self-review、独立review、project checks、別の独立verifierを必須とする。

## Acceptance

- 自前installerとその専用fixtures / tests、現行の導入推奨が残らない。
- Node未導入・不適合時に必要版と公式導入先を案内し、変更処理より前に停止する。
- 引数・終了status・移行契約と既存runtime保護が公開CLIテストで成立する。
- focused tests、必須project checks、独立review / verifierが成功する。

## Scope Exclusions

runtime managerの導入・起動、代替installer、platform拡張、#50のversion受理文法統一、
無関係なfixture整理、依存更新、release version更新、mergeは含めない。
PR作成依頼に基づくcommit / push / PR公開と規約上のpre-merge closeは実施する。
