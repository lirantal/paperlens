# Report formats

The default command still prints the citation table. Select JSON or Markdown:

```sh
paperlens --json --config paperlens.json
paperlens --markdown --config paperlens.json
```

The two format flags are mutually exclusive. Each command collects once. Stdout
contains only the selected report; provider warnings go to stderr. Collection
returns exit code 0 even if providers are unavailable. Invalid arguments or
configuration return 1. Without `--output-dir`, these output options do not create report files.

## JSON contract

The document has `schemaVersion: 1`, `generatedAt` (UTC ISO timestamp), and `rows`.
Rows contain configured `paper` identity, `semanticScholar` and `openAlex` outcomes,
and `citationCountEstimate`. A provider result contains `source`, `fetchedAt`, and
`ok`; success includes `citationCount`, failure includes a safe `error` diagnostic.
Unknown fields and arbitrary network error text are excluded by conversion.
Configured paper metadata is public, so do not put credentials in it.

Zero means a successful zero count. Unavailable sources never become zero. The
estimate is the maximum successful provider count, or null if neither succeeds.
Provider counts overlap and must not be summed.

The [v1 JSON Schema](../schemas/citation-report-v1.json) ships in the package at
`paperlens/schemas/citation-report-v1.json`. Breaking changes require a new schema
version; consumers should ignore additive optional fields. The schema describes
shape and types; the collector supplies the maximum-count invariant.

## Library

```js
import {
  collectCitationReport,
  createReportDocument,
  serializeReportDocument,
  renderCitationMarkdown
} from 'paperlens'

const report = await collectCitationReport(papers)
const document = createReportDocument(report)
const json = serializeReportDocument(document)
const markdown = renderCitationMarkdown(document)
```

Collection and existing library exports remain compatible. New helpers do not
mutate the input or perform network/filesystem IO. Markdown escapes HTML and
formatting punctuation and normalizes embedded control characters and line breaks.

## Snapshot persistence

Opt in with an output directory, independently of stdout format:

```sh
paperlens --json --output-dir ./reports
paperlens --markdown --output-dir ./reports
```

Relative paths resolve against the working directory. The command creates
`latest.json` plus append-only `history/<UTC timestamp>-<UUID>.json` snapshots.
Both contain identical versioned JSON, including unavailable provider outcomes.
A collection with unavailable providers still returns 0. Requested persistence
failure returns 1 and produces a diagnostic on stderr; no report is printed to
stdout on that failure.

History commits before latest. Readers see complete files: history uses a
no-overwrite hard link from a temporary file; latest uses a same-directory
atomic rename. Failure before replacing latest preserves the previous latest.
If history saved but latest did not, the diagnostic states that partial outcome.
History and latest are not one atomic transaction, and power-loss durability is
not guaranteed. Use a local filesystem supporting hard links, exclusive creates,
and atomic rename; external writers and unsupported network filesystems are
outside these guarantees.

Concurrent saves to the same directory fail immediately while `.paperlens.lock`
exists. Never remove a lock while a writer is active. After confirming no writer
is running, remove a stale lock and leftover temporary files manually. A crash
can leave those files behind. A cleanup failure after saving is reported as
saved data with failed cleanup, also with exit code 1.

There is no automatic history pruning. Manage disk usage manually and decide
whether to commit reports; Paperlens does not stage, commit, or upload them.
Trend/delta calculation and scheduling remain deferred.

The library exposes `persistReportDocument(document, outputDirectory)`, returning
absolute `historyPath` and `latestPath` on success and rejecting on failure. It
performs filesystem IO only; no collection or rendering is triggered. See the
[Phase 2 design](phase-2-design.md) for implementation boundaries.
