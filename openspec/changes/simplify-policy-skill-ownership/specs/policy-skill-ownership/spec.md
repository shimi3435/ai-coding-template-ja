## ADDED Requirements

### Requirement: R1 Upstream skill cohort
The repository MUST preserve remote ownership and legal provenance while updating the seven existing Matt Pocock skills and adding codebase-design at one reviewed upstream commit. The standard distribution MUST exclude setup-matt-pocock-skills and its source, lock, and host-link entries; the remaining upstream bodies and resolved commits MUST remain unchanged during the repair cycle.

#### Scenario: Latest dependency closure
- **WHEN** the selected upstream cohort is installed
- **THEN** its required skill calls resolve, optional examples do not force unrelated installations, and offline source/lock/legal/link verification succeeds.

### Requirement: R2 Repository glossary migration
The repository MUST preserve the repository-specific content of CONTEXT.md as GLOSSARY.md and update live consumers without rewriting historical records.

#### Scenario: Rename and prune after migration
- **WHEN** package rename or template pruning runs
- **THEN** it handles GLOSSARY.md, preserves its required domain content, and does not create a second CONTEXT.md glossary.

#### Scenario: Procedural ownership after migration
- **WHEN** procedural responsibilities are consolidated after the content-preserving rename
- **THEN** glossary terms retain their meaning while operational details move to the canonical workflow through references.

### Requirement: R3 Explicit procedural ownership
The repository MUST keep independent-review triggers in root policy, common procedures in workflow, and executor-specific preflight and resume rules in the executor skill without weakening existing safety or completion conditions.

#### Scenario: Canonical owners remain reachable
- **WHEN** a workflow or skill needs task, review, evidence, or completion rules
- **THEN** it follows the canonical workflow reference; risk enumeration remains only in root policy under a descriptive name, historical records remain unchanged, and preflight, dirty ownership, resume, and fail-closed validation contracts retain their meaning.

#### Scenario: Focused skill responsibilities
- **WHEN** self-review, spec-holes, or verify-change is invoked
- **THEN** self-review reports without mutation in every mode; spec-holes evaluates all twelve categories per requirement and proposes tests without owning execution; verify-change reports verified, not-applicable, or unverified outcomes while the executor owns progress.

#### Scenario: Review and unavailable validation
- **WHEN** self-review finds a defect or required validation cannot run
- **THEN** self-review reports without editing, the executor owns fixes, and missing required validation prevents completion.

### Requirement: R4 Document phrase placeholders
R06 MUST additionally recognize unquoted, unescaped angle-bracket placeholders in inline spans, unlabelled fences, and console fences when the content starts with an ASCII letter or underscore, contains only ASCII letters, digits, underscore, hyphen, space, comma, period, and parentheses, and does not end with space. Source line breaks MUST NOT be included, even before inline normalization. Other syntax MUST retain its existing interpretation; arbitrary prose MUST NOT be silently ignored.

#### Scenario: Upstream question template
- **WHEN** the upstream grilling question template is scanned
- **THEN** its phrase placeholders are reported as partial rather than syntax errors, and known commands and references in the same input remain checked with original source positions.

#### Scenario: Shell and literal boundaries
- **WHEN** an input is an executable shell, an explicit sh/bash/shell fence, a quoted or escaped literal, or contains unsupported placeholder characters
- **THEN** the new phrase rule does not apply, existing single-word placeholder behavior is retained, and syntax failures remain failures.

### Requirement: R5 Current main integration
The branch MUST merge the reviewed current main while retaining PR #92's separation of downstream tests from template-maintenance tests, fixtures, and corpus validation.

#### Scenario: Maintenance regression ownership
- **WHEN** phrase-placeholder and glossary regressions are integrated
- **THEN** they use the maintenance fixture under template-maintenance/tests, the new phrase test is declared in the prune manifest, and downstream pytest does not depend on maintenance-only fixtures or corpus.

#### Scenario: Fresh integrated validation
- **WHEN** the repair is judged complete
- **THEN** focused tests verify R06 and GLOSSARY in bundled and pruned states, both ./scripts/check.sh and task check:template pass on the integrated input, and independent review and a separate verifier accept that input.

### Requirement: R6 Project-owned skill configuration recovery
Shared engineering-skill configuration MUST remain in docs/agents with navigation in AGENTS.md. The project MUST provide a reachable recovery path when tracker or domain configuration is missing, without requiring setup installation or shared configuration in CLAUDE.md.

#### Scenario: Configuration already present
- **WHEN** AGENTS.md and CLAUDE.md coexist and the code-review skill is invoked with the standard configuration
- **THEN** the tracker and specification inputs are obtained from project configuration, setup is not required, and neither agent-specific policy nor external systems are mutated for initialization.

#### Scenario: Configuration missing or changed
- **WHEN** project configuration is absent or the user requests a tracker or domain-layout change
- **THEN** project instructions guide restoration or editing of docs/agents; unresolved tracker identity is asked of the user before dependent work, setup is not automatically installed, and shared navigation remains in AGENTS.md.
