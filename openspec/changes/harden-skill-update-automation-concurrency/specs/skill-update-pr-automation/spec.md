## MODIFIED Requirements

### Requirement: Remote branch mutations use explicit compare-and-swap leases

The automation MUST perform every managed branch create, append, and delete with an explicit force-with-lease expected value on the exact destination ref.

#### Scenario: Create requires absence at mutation time

- **WHEN** a candidate targets a managed branch expected to be absent
- **THEN** the push uses an empty explicit lease expectation
- **AND** a concurrently created branch causes the write to fail without updating it

#### Scenario: Append and delete require exact SHA

- **WHEN** the automation appends to or deletes a managed branch
- **THEN** the push lease names the exact expected current SHA
- **AND** a concurrently changed tip remains untouched

### Requirement: Merged branch cleanup is independent of candidate publication

The automation MUST run guarded merged-branch cleanup as an independent job for eligible candidate-update, existing-head-validation, and no-op runs.

#### Scenario: No-op retries cleanup

- **GIVEN** a merged managed PR branch remains after a prior cleanup failure
- **WHEN** the next eligible detection result is no-op
- **THEN** cleanup revalidates identity and exact tip
- **AND** attempts the CAS delete

### Requirement: Managed roots are immutable and mutable state is journaled

The automation MUST keep PR and Issue creation bodies immutable and store later state only in an append-only canonical comment journal v2 bound to the root creator numeric user ID.

#### Scenario: Valid journal chain

- **WHEN** managed state is reconstructed
- **THEN** every v2 marker comment is authored by the root creator numeric user ID
- **AND** every entry is canonical, unedited, sequential, linked by digest, and contains a full snapshot

#### Scenario: Detectable invalid journal evidence

- **WHEN** an entry is edited, missing before a surviving successor, duplicated, forked, noncanonical, marked by another author, or inconsistent with live resource state
- **THEN** the affected resource write fails closed
- **AND** no body, comment, branch, PR state, or Issue state mutation is attempted for that resource

#### Scenario: Deleted terminal state-only suffix

- **WHEN** every comment in a terminal state-only suffix is deleted and no surviving entry or live mutation proves it existed
- **THEN** the chain cannot distinguish deletion from never-created state
- **AND** this case is outside the missing-entry detection guarantee

#### Scenario: Version one resource

- **WHEN** discovery encounters only a v1 managed marker
- **THEN** it is not migrated or mutated as v2
- **AND** the run reports a version conflict

### Requirement: Non-atomic lifecycle mutations use a write-ahead protocol

The automation MUST journal branch append and PR draft or ready transitions as prepared, mutation, and committed phases with one stable operation ID and full before/after snapshots.

#### Scenario: Resume after prepared entry

- **GIVEN** the journal ends with one valid prepared entry
- **WHEN** live state equals the prepared before snapshot
- **THEN** the exact mutation may be retried
- **WHEN** live state equals the prepared after snapshot
- **THEN** only the committed entry is appended
- **WHEN** live state matches neither snapshot
- **THEN** recovery fails closed

### Requirement: Closed tracking issues are terminal roots

The automation MUST NOT reopen or update a closed tracking issue and MUST create a new issue for a later failure.

#### Scenario: Failure after issue closure

- **GIVEN** the latest strict managed tracking issue is closed
- **WHEN** a new failure requires tracking
- **THEN** a new immutable issue root and v2 journal are created
- **AND** the closed issue remains unchanged

### Requirement: Schema v2 smoke uses a fresh repository and fresh approval

The real-host smoke MUST target a fresh repository with no v1 managed resources and MUST perform no write before a read-only preview and fresh in-process approval of the exact v2 operation plan.

#### Scenario: Preview without approval

- **WHEN** smoke preview completes but approval is absent, stale, or mismatched
- **THEN** no branch, PR, Issue, or comment write occurs

#### Scenario: Approved fresh smoke

- **WHEN** the operator approves the exact preview digest in the same process
- **THEN** smoke exercises explicit leases, journal v2, prepared/committed recovery, independent cleanup, and terminal cleanup
