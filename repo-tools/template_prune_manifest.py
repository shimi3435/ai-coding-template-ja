"""固定資産契約。現存 tree や内容 hash から必須集合を生成しない。"""

DIRECTORIES = (
    "docs/template",
    "docs/template/adr",
    "template-maintenance",
    "template-maintenance/tests",
)
MAINTENANCE_FILES = (
    "docs/template/adr/0001-skill-distribution-vendoring.md",
    "docs/template/adr/0002-mcp-remote-default-node-not-core.md",
    "docs/template/adr/0003-openspec-gsd-boundary.md",
    "docs/template/adr/0004-github-mcp-optional-gh-cli-core.md",
    "docs/template/adr/0005-template-update-not-propagated.md",
    "docs/template/adr/0006-template-meta-docs-isolated.md",
    "docs/template/adr/0007-downstream-usage-guide-sot-boundary.md",
    "docs/template/adr/0008-adaptive-openspec-gsd-execution-boundary.md",
    "docs/template/adr/0009-proportional-agent-workflow-evidence-economy.md",
    "docs/template/adr/0010-openspec-direct-execution.md",
    "docs/template/adr/0011-v2-distribution-boundaries.md",
    "docs/template/release.md",
    "docs/template/retrospectives.md",
    "docs/template/v2-boundary-audit.md",
    "docs/template/v2-release-notes.md",
    "template-maintenance/tests/test_release_contract.py",
    "template-maintenance/tests/test_history_contract.py",
    "template-maintenance/tests/test_prune_integration.py",
    ".github/workflows/template-maintenance.yml",
)
DELETE_ROOTS = (
    "docs/template",
    "template-maintenance",
    ".github/workflows/template-maintenance.yml",
)
SHARED = ("Taskfile.yml", "README.md", "docs/agents/workflow.md")
KEEP_FILES = (
    "docs/reference/repository-contracts.md",
    "docs/reference/skill-maintenance.md",
    "docs/reference/skill-metadata-v2.md",
    "docs/reference/prune-template-assets.md",
    "tests/fixtures/template_prune/references.json",
    "scripts/prune-template-docs.py",
    "TEMPLATE_VERSION",
)
KEEP_DIRECTORIES = ("docs/adr",)
START = "<!-- template-maintenance:start -->"
END = "<!-- template-maintenance:end -->"
