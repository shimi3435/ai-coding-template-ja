## ADDED Requirements

### Requirement: Formal runtime versions
The runtime validators MUST accept only canonical ASCII three-integer final versions with the agreed runtime prefixes and supported version ranges.

#### Scenario: Canonical versions
- **WHEN** Node reports v24.X.Y, npm reports X.Y.Z, or Python reports Python X.Y.Z
- **THEN** each decimal component is zero or starts with 1-9 and contains only ASCII digits
- **AND** Node major is 24, Python is >=3.14, and npm has no added lower bound

#### Scenario: Non-final or malformed versions
- **WHEN** a prefix is wrong or missing, or a suffix, leading zero, whitespace, NUL or extra line occurs
- **THEN** validation fails
- **AND** only zero or one terminal LF or CRLF is permitted

### Requirement: Runtime command results
The command-based validators MUST require exit zero and validate raw stdout independently of stderr.

#### Scenario: Warning on stderr
- **WHEN** exit is zero and stdout is valid, but stderr contains a warning
- **THEN** the runtime is accepted

#### Scenario: Failed command or missing stdout
- **WHEN** a command is missing, cannot spawn, exits nonzero, or reports its version only on stderr
- **THEN** validation fails
- **AND** bootstrap does not enter installation or setup

### Requirement: Runtime ownership and shared regression vectors
The three entrypoints MUST retain their runtime ownership and verify applicable cases against a shared permanent fixture without adding a runtime prerequisite for bootstrap validation.

#### Scenario: Python ownership
- **WHEN** bootstrap or CLI validates Python
- **THEN** it probes python3 on PATH
- **WHEN** doctor validates Python
- **THEN** it validates its own sys.version_info, rejects non-final releases, and retains the separate .python-version declaration check

#### Scenario: Cross-entrypoint regression
- **WHEN** normal offline project checks run
- **THEN** Bash, TypeScript and Python consume shared expected acceptance cases through their applicable public seams
- **AND** fixture access does not depend on OpenSpec change directories or Git history
