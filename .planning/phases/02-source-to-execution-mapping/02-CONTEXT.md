# Phase 2: Source-to-Execution Mapping - Context

**Source authority:** `4d8b5b173927ed518d39dee18a29b0271628afbd`

## Decisions

### D-01: Full assignment with operation-specific readiness

All active source IDs receive an explicit phase assignment baseline. `plan`, `execute`,
`verify`, and `finalize` each enforce the exact readiness horizon fixed by the canonical
OpenSpec design. Future plan/evidence paths may be empty only outside the active horizon;
that absence never satisfies an operation-ready result.

### D-02: Separate started-v2 refresh lifecycle

Schema-v2 publication uses a dedicated read-only refresh preview, a new explicit approval
bound to the exact preview hash, fresh state guards, bounded staging, and atomic replace.
It does not reuse v1 migration or MVP `inspect` / `prepare` / `mark-started`, and it does
not retry, roll back, repair, or switch route automatically.

### D-03: Exact current-tree policy fingerprint

Policy anchors use the exact `adaptive-policy-section-v1` normalizer and the current-tree
reference registry fixed by the canonical design. Runtime and normal CI do not depend on
historical Git blobs or optional OpenSpec/GSD tools.

### D-04: Point-in-time readiness observation boundary

Treat the canonical readiness outcome as an opaque point-in-time execution decision;
GSD does not strengthen it into an atomic repository snapshot or lease. An observation
failure detected at its owned seam is non-ready, while later external drift is handled at
the next operation boundary. Consumers must discard earlier readiness, rerun mapping
readiness and the Phase 3 drift/preflight immediately before the operation, and rely on
separate mutation-seam state guards. Failure stops for inspection without automatic retry,
repair, or route switching. Exact normative semantics remain at the source authority above.

## the agent's Discretion

- Internal module/type naming and responsibility split, provided the public seams remain
  separate and exact.
- Fixed fixture organization and failure-code naming.
- Reuse of Phase 1 private mechanical helpers where this does not widen public MVP APIs.

## Deferred Ideas

- Phase 3 implementation of drift/preflight and approval freshness across lifecycle operations.
- Phase 4 ownership graphing, Phase 5 recovery/resume, and Phase 6 finalize/cleanup.
- Automatic mapping inference, retry, rollback, repair, or route switching.
- Mandatory real OpenSpec, GSD, or host smoke in normal CI.
