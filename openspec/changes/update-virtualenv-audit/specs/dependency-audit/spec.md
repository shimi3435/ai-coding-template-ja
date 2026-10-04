## ADDED Requirements

### Requirement: Auditable locked development dependencies
The default development dependency set MUST use a patched virtualenv release and retain the existing audit scope without vulnerability exclusions.

#### Scenario: Locked installation and audit
- **WHEN** the development environment is synchronized from uv.lock
- **THEN** virtualenv is 21.7.13 and python-discovery is 1.6.0
- **AND** other package versions and declared dependency groups remain unchanged
- **AND** the existing core pip-audit command succeeds against the current advisory database
