# Phase 2: reports and persistence

Approved direction: [issue #81](https://github.com/lirantal/paperlens/issues/81).
The maintainer authorized implementation on 2026-11-09.

## Contract and compatibility

Collection keeps returning the existing `CitationReport`. A new
`createReportDocument` helper copies public fields into a document with
`schemaVersion: 1`, `generatedAt`, and `rows`. Provider source, timestamp,
success/count or failure/error, and the maximum available citation estimate
remain explicit. Zero is a count; no successful providers means a null estimate.
Counts are never summed. The schema lives in `schemas/citation-report-v1.json`
and ships in the npm package. Breaking format changes require a new schema
version; consumers should tolerate additive optional fields.

The conversion strips unknown fields and replaces arbitrary provider error text
with a fixed safe diagnostic, retaining recognized provider HTTP and missing-count
messages. This prevents thrown network errors from exporting request credentials.
CLI diagnostics use this sanitized document too. Configured paper identity is
public data; users must not put secrets in paper metadata.

## Output

The default CLI remains a terminal table. `--json` and `--markdown` are mutually
exclusive and work with `--config`. JSON stdout contains one document; warnings
use stderr. Collect exactly once and render from that result. JSON serialization
and Markdown rendering are pure. Markdown escapes HTML and punctuation and
normalizes embedded line breaks/control characters. Library exports include the
new document type, conversion, JSON serializer, and Markdown renderer; existing
exports stay available.

## Persistence

`--output-dir <path>` opts into filesystem writes, independently of stdout
format. Relative paths resolve against the current working directory. No option
means no writes. Persist identical JSON bytes to `history/<UTC timestamp>-<UUID>.json`
and `latest.json`.

Create directories and acquire an exclusive `.paperlens.lock` file before writing.
A competing writer fails rather than waiting or overwriting a lock. The lock is
held only during persistence, not provider collection. Never automatically steal
an old lock: after confirming no writer is active, the operator may remove it.
Locks coordinate Paperlens writers on a local filesystem; external writers and
filesystems without exclusive-create/atomic-rename semantics are unsupported.

Write a temporary file in the history directory, then create the final history
name without replacing an existing file (hard-link followed by temporary-file
cleanup). Retry UUID collisions with a bounded limit. Only after history commits,
write a unique temporary file alongside latest and rename it over latest. Clean
up temporary files and the owned lock in finally blocks. Readers see complete
files; two files are not one atomic transaction. This does not promise durability
against power loss. A crash can leave a lock or temporary file needing manual
cleanup.

Failure before latest replacement preserves the previous latest. Failure after
history commits retains that snapshot and reports the partial result. Failed
requested persistence returns 1. Provider unavailability alone still returns 0,
even when every provider fails; persist those outcomes rather than zeros.
History has no automatic pruning. Users manage disk usage and decide whether to
commit reports. No Git, upload, scheduling, or remote integration behavior exists.

## Implementation sequence and verification

1. Add the schema, conversion, JSON/Markdown rendering, CLI flags, public exports,
   documentation, tests, and patch changeset in an output PR.
2. Add persistence, `--output-dir`, filesystem/concurrency/failure tests,
   documentation, and patch changeset in a second PR based on the output PR.

Test successful zero, partial and total provider failures, safe diagnostics,
Markdown injection, parseable JSON, unchanged table usage, argument conflicts,
public API/package contents, and one collection per invocation. Validate the schema separately with a development-only validator. Persistence tests use temporary directories,
real concurrent operations, deterministic failure injection, history collisions,
and pre-existing latest data. All provider calls are mocked.

Run tests, lint, type checking/build, and verify the package contents. Keep the
runtime dependency list empty. Deltas, retention pruning, new metadata/providers,
LLM measurements, publishing, and scheduling remain outside this phase.
