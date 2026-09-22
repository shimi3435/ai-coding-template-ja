## ADDED Requirements

### Requirement: Explicit bootstrap argument contract
Bootstrap MUST reject the removed Node installer option and expose side-effect-free help before runtime checks.

#### Scenario: Removed installer option
- **WHEN** `--install-node` is the first invalid argument, with or without an installed runtime or help
- **THEN** stderr identifies removal and provides the required Node.js 24 / npm, official download URL, PATH guidance and rerun command; exit status is 2
- **AND** no runtime, download, uv, task or environment mutation is performed

#### Scenario: Help and invalid arguments
- **WHEN** all supplied arguments are `--help` or `-h`, including repetitions
- **THEN** usage, required runtimes, official URL and option removal appear once on stdout with exit 0, without runtime checks or mutations
- **WHEN** an empty, positional or unknown argument is supplied, including alongside help in either order
- **THEN** the first invalid argument is diagnosed on stderr and exit status is 2
- **WHEN** no arguments are supplied
- **THEN** normal bootstrap continues

### Requirement: Runtime failure guidance
Bootstrap MUST retain runtime acceptance rules and fail before setup with actionable Node or npm diagnostics.

#### Scenario: Node or npm unavailable or invalid
- **WHEN** Node or npm is missing, a version command fails, version output cannot be parsed, or the Node major is not 24
- **THEN** stderr retains the cause and available detected output and includes Node.js 24 / npm, https://nodejs.org/en/download, PATH guidance and `./scripts/bootstrap.sh`
- **AND** exit status is 1 and no download or setup mutation occurs

#### Scenario: Existing acceptance and Python checks
- **WHEN** normal bootstrap checks versions
- **THEN** the existing version syntax, Node 24 major requirement, npm requirement and Python >=3.14 checks remain unchanged

### Requirement: Existing environment preservation
Bootstrap MUST remove the custom installer while preserving installed runtimes and normal setup.

#### Scenario: Residual installer configuration
- **WHEN** `NODE_INSTALL_ROOT` remains set to any value
- **THEN** it is ignored without a warning or error, and installed files and caller PATH are not rewritten
- **AND** a compatible runtime on PATH remains usable without reinstalling

#### Scenario: Normal setup
- **WHEN** runtimes meet requirements
- **THEN** normal uv handling and task setup continue as before, with doctor and CLI preflight behavior preserved
- **AND** no custom Node download, checksum, extraction, activation or cleanup code or dedicated fixtures remain

### Requirement: Consistent migration documentation
Documentation MUST describe the removed installer and preserve historical decisions with explicit supersession.

#### Scenario: New and existing users
- **WHEN** users read help, README, onboarding or release guidance
- **THEN** they can identify required versions, official installation source, PATH confirmation and the argument-free rerun command
- **AND** Node installation or a runtime manager is not automatically invoked or prescribed by the template

#### Scenario: Historical retention
- **WHEN** old ADR or audit text refers to keeping the installer
- **THEN** an explicit partial amendment links to the current migration guidance without erasing the historical decision
