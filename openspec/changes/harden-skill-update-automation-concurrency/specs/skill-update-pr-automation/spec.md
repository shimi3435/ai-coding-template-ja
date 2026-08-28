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
- **AND** the immutable root contains the canonical full initial snapshot whose computed digest equals the root initial snapshot digest

#### Scenario: Recover a commentless immutable root

- **GIVEN** a PR or Issue create may have succeeded but its response was lost and the strict root has no journal comments
- **WHEN** the resource author numeric ID equals the root creator, `lastEditedAt` is null, and fresh resource state exactly equals the canonical initial snapshot embedded in the root
- **THEN** an existing writer path may append the exact initial journal entry once
- **AND** author mismatch, edit metadata absence or non-null value, snapshot mismatch, or live-state mismatch fails closed

#### Scenario: Initial journal append response is lost

- **WHEN** the initial comment append response is lost
- **THEN** the automation does not retry the append
- **AND** accepts recovery only when a fresh complete journal read contains exactly one canonical expected entry

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

#### Scenario: Host projections lag after an exact mutation

- **GIVEN** an exact prepared mutation has succeeded but GitHub temporarily exposes a mix of the before and after projections
- **WHEN** the automation verifies the mutation result or resumes the prepared entry
- **THEN** it performs only a bounded number of read-only reacquisitions without repeating a mutation already proven by the exact branch state
- **AND** appends committed only after every required live projection equals the exact after snapshot
- **AND** fails closed without committed if the projections do not converge or expose any state outside the exact before and after snapshots

#### Scenario: Branch projection regresses across recovery phases

- **GIVEN** one stabilization phase has observed the exact branch after SHA
- **WHEN** a later stabilization phase in the same recovery execution observes the branch before SHA or a missing branch
- **THEN** recovery fails closed even if a subsequent observation returns to the after SHA
- **AND** it performs no mutation and appends no committed entry

### Requirement: Closed tracking issues are terminal roots

The automation MUST NOT reopen or update a closed tracking issue and MUST create a new issue for a later failure.

The guarantee applies to the final fresh Issue read immediately before comment append because GitHub does not provide a conditional Issue-comment write. If that read observes closed, the automation MUST NOT append and MUST perform at most one rediscovery before creating a new issue.

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
- **AND** the operator merges the ready smoke PR at an explicit checkpoint without automation merge permission
- **AND** the CLI freshly verifies the merged PR before invoking the independent cleanup seam
- **AND** the fresh repository keeps the exact head branch until the cleanup seam deletes it

#### Scenario: Interrupted approved smoke

- **WHEN** an approved smoke stops with exact residual resources
- **THEN** a later process emits a terminal-only recovery preview bound to their identities and lease SHA
- **AND** a post-merge recovery binds the read-only merged source relation to the preview
- **AND** performs no recovery write before a new exact approval
- **AND** after approval revalidates the preview-bound immutable resource identity, journal digest, and exact branch SHA before each terminal write
- **AND** deletes only that exact residual branch without depending on aggregate merged-PR discovery
