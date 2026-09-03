# Roadmap implementation notes

This document preserves reusable, public design lessons for the work deferred
from the citation-table MVP. It complements the [phased roadmap](README.md#roadmap)
and the umbrella tracking issue; it is not an implementation specification.

Every roadmap phase still needs an approved design and an implementation plan
before coding starts. Those designs must make the choices identified below
explicitly rather than treating this document as a hidden contract.

## Public boundary

These notes intentionally exclude source code, sample configurations, report
data, credentials, organization names, deployment details, internal labels,
and operational URLs from earlier private work.

Paperlens remains a public, provider-neutral Node.js project. Do not add
internal workflow metadata to `paperlens.json`. In particular, `pillar` and
`notes` are not public fields; `blogUrl` and `publishedDate` are optional
public metadata only when the richer-metadata phase is implemented.

## Phase 2: output and persistence

- Make JSON the canonical machine-readable report. Markdown should be a pure
  presentation derived from that report, not a separate collection path.
- Define a versioned report envelope before persisting it. Retain generation
  time, configured paper identity, per-provider outcomes, and unavailable or
  failed source states; never turn missing data into zero.
- A useful low-infrastructure layout is one replaceable current snapshot plus
  timestamped, append-only snapshots for history. Read only prior snapshots
  when calculating deltas, and make first-run or insufficient-history states
  explicit.
- Decide the output directory, retention policy, atomic-write behavior, and
  whether users—not the CLI—choose to commit snapshots to version control.

## Phase 3: richer metadata and reference discovery

- Keep structured citation counts and full-text discoveries as separate source
  classes. A text match is evidence of a reference, not automatically a
  structured citation.
- Preserve provenance per candidate: matching evidence, canonical identifiers,
  source metadata, and the reasoning for any classification. This makes the
  result auditable and lets consumers apply their own policy later.
- Normalize identifiers before deduplicating. Prefer stable identifiers such as
  DOI or provider IDs; use normalized title matching only as a documented
  fallback. Avoid counting a tracked paper as its own reference.
- Search only exact, explainable evidence forms. `blogUrl`, when later enabled,
  is one optional evidence form alongside title and arXiv identity.
- Do not add full-text discoveries to the structured-citation estimate. If a
  combined headline is introduced, define a conservative rule that avoids
  double counting as indexes catch up.

## Phase 4: retrieval and share of voice

- Treat the query panel, tracked-paper aliases, provider/model settings, and
  sampling policy as versioned inputs to a measurement run.
- Separate provider adapters, query execution, mention detection, aggregation,
  and report rendering. This keeps providers replaceable and makes detection
  logic testable without live model calls.
- Record successful, failed, and skipped samples distinctly. Every rate must
  carry enough coverage information to show its denominator and uncertainty;
  never silently exclude failures.
- Start with a deliberately small provider/model surface and expand only after
  validating query quality, repeatability, cost, rate limits, and false
  positives or negatives.
- Keep credentials out of configuration and reports. Tests must mock provider
  calls and should never make paid or live model requests in CI.

## Phase 5: integrations and automation

- Keep report rendering pure and separate from transport. A publishing adapter
  receives a report and destination-specific options; collection must remain
  useful without any integration configured.
- Support a dry-run path, clear diagnostics, and optimistic-concurrency or
  version handling when updating an existing remote destination.
- Scheduled workflows should support manual dispatch and prevent concurrent
  collection or publication runs that can race over the same snapshot or
  destination.
- Put all destination credentials in the execution environment or secret
  store. The core library and `paperlens.json` remain credential-free.
- Introduce individual integrations behind a provider-neutral interface rather
  than making any one service a required runtime dependency.

## Phase design checklist

Before implementing a roadmap phase, its design should state:

1. The public configuration and report schema, including versioning and
   backwards-compatibility policy.
2. The measurement semantics, provenance, error behavior, and unavailable-data
   presentation.
3. Credential, rate-limit, cost, and privacy boundaries.
4. The library and CLI surface, with a migration story for existing users.
5. Deterministic tests, mocked external calls, and documentation updates.
