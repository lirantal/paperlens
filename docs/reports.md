# Report formats

The default command still prints the citation table. Select JSON or Markdown:

```sh
paperlens --json --config paperlens.json
paperlens --markdown --config paperlens.json
```

The two format flags are mutually exclusive. Each command collects once. Stdout
contains only the selected report; provider warnings go to stderr. Collection
returns exit code 0 even if providers are unavailable. Invalid arguments or
configuration return 1. These output options do not create report files.

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

Snapshot persistence is the next implementation slice of
[Phase 2](phase-2-design.md).
