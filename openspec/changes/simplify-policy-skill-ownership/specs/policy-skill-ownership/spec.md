## ADDED Requirements

### Requirement: R1 Upstream skill cohort
The repository MUST preserve remote ownership and legal provenance while updating the seven existing Matt Pocock skills and adding setup-matt-pocock-skills and codebase-design at one reviewed upstream commit.

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
