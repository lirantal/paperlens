# paperlens Citation MVP Design

## Goal

Repackage the existing citation-counting work as an independent, open-source npm CLI and library named `paperlens`. The first release will let a user provide a small `paperlens.json` file, look up each paper's citation counts from Semantic Scholar and OpenAlex, and inspect the results in a readable terminal table.

The implementation targets Node.js 24 LTS and has no runtime dependencies. It keeps the repository's existing TypeScript, pnpm, Node test runner, lint, build, CI, and Changesets setup.

## MVP scope

The MVP includes:

- A default `paperlens.json` config file in the current working directory.
- An explicit `--config <path>` / `-c <path>` option.
- A simplified public config schema with a top-level `papers` array.
- Semantic Scholar and OpenAlex citation lookups keyed by arXiv ID.
- A conservative combined estimate equal to the maximum available provider count.
- A deterministic fixed-width table written to standard output.
- A small library API for loading config, collecting results, and rendering the table.
- Per-provider failure isolation: a provider failure is reported as unavailable and does not abort the other provider or other papers.
- Fatal, readable errors for missing, malformed, or invalid configuration.
- Unit and CLI argument tests with no live network traffic.

The MVP explicitly excludes JSON output, Markdown output, persisted snapshots, history files, full-text/reference discovery, LLM retrieval or share-of-voice measurement, Confluence or other integrations, scheduling, and company-specific metadata.

## Public configuration

The supported MVP file is `paperlens.json`:

```json
{
  "papers": [
    {
      "id": "example-paper",
      "title": "Example Paper",
      "arxivId": "2401.00001"
    }
  ]
}
```

Validation rules:

- The root object contains a non-empty `papers` array.
- Each paper has a non-empty stable `id`, a non-empty display `title`, and an arXiv ID matching `^\\d{4}\\.\\d{4,5}$`.
- Paper IDs are unique within the file.
- Unknown root and paper properties are rejected instead of silently ignored.
- `blogUrl` and `publishedDate` are intentionally not accepted until the richer metadata phase.
- Internal labels such as `pillar` and free-text operational `notes` are not part of the public schema.

The config loader defaults to `path.resolve(process.cwd(), "paperlens.json")` and accepts an explicit path for library and CLI use.

## Architecture and data flow

The code is organized around focused modules:

```text
paperlens.json
      |
      v
loadPaperlensConfig()
      |
      v
validated Paper[]
      |
      v
collectCitationReport()
      |------------------------------|
      v                              v
Semantic Scholar client       OpenAlex client
      |                              |
      v                              v
source result                  source result
      |-------------- -------------|
                     v
             CitationReport rows
                     |
                     v
          renderCitationTable()
                     |
                     v
                  stdout
```

### Configuration module

`src/config.ts` owns the public `Paper`, `PaperlensConfig`, and config-loading behavior. It uses Node filesystem APIs and a focused validation implementation rather than a runtime schema dependency. Validation errors identify the config path and the invalid field or shape.

### Provider modules

`src/providers/semanticScholar.ts` and `src/providers/openAlex.ts` each expose one citation lookup function. They use Node 24's global `fetch` and `AbortSignal.timeout()` with a bounded request timeout. They return discriminated success/error results and do not throw for HTTP errors, missing papers, timeouts, or network failures.

The Semantic Scholar client may read `SEMANTIC_SCHOLAR_API_KEY` from the CLI environment. The OpenAlex client may read `OPENALEX_API_KEY` and `OPENALEX_MAILTO`. These are optional and provider-neutral; the CLI does not require credentials for the MVP.

The Semantic Scholar client retains bounded retries for transient `429` and `5xx` responses. Collection processes papers in order with a small configurable delay between papers, while the two provider requests for a single paper run concurrently. This keeps the existing rate-limit-safe behavior without adding a scheduler or persistence subsystem.

### Collection module

`src/collect.ts` owns orchestration and aggregation. Its public operation is:

```ts
collectCitationReport(
  papers: readonly Paper[],
  options?: CollectCitationOptions,
): Promise<CitationReport>
```

Each report row contains the input paper, the Semantic Scholar result, the OpenAlex result, and `citationCountEstimate`. The estimate is the maximum of the successful provider counts. If both providers fail, the estimate is `null` so an unavailable result is never presented as a genuine zero.

The report includes `generatedAt` and `rows`, but the MVP does not write it to disk. Keeping a structured in-memory report gives the library a useful API and leaves the later JSON/history phase additive.

### Table module

`src/output.ts` owns the pure operation:

```ts
renderCitationTable(report: CitationReport): string
```

The renderer produces stable, fixed-width output with columns for paper title, arXiv ID, Semantic Scholar count, OpenAlex count, and estimate. Unavailable values are rendered as `unavailable`, and provider error details are emitted as concise warnings by the CLI after the table. The renderer does not use color, terminal-width detection, or a table package, so its output is deterministic in terminals, pipes, and tests.

### CLI module

`src/bin/cli.ts` uses Node 24's `node:util.parseArgs` and supports:

```text
paperlens [--config <path>]
paperlens -c <path>
paperlens --help
```

No-argument execution loads `paperlens.json` from the current working directory. Unknown options and missing option values are fatal argument errors. Config errors are printed to standard error and exit with status 1. Provider failures are represented in the table and do not prevent collection from completing for the remaining papers.

## Library surface

`src/main.ts` exports:

- `loadPaperlensConfig(configPath?: string)`
- `collectCitationReport(papers, options?)`
- `renderCitationTable(report)`
- Public types for `Paper`, `PaperlensConfig`, provider results, report rows, and collection options

The package's existing dual ESM/CommonJS build and `paperlens` binary remain the distribution mechanism. The placeholder `add()` API is removed.

## Testing strategy

Tests stay in the repository's existing `__tests__` directory and use `node:test` plus Node assertions. Network calls are never made by tests; `globalThis.fetch` is stubbed with deterministic `Response` objects.

Coverage includes:

- Valid config loading and rejection of missing, malformed, empty, duplicate, and unknown fields.
- Semantic Scholar and OpenAlex response mapping.
- Provider HTTP, timeout, and network failures returning error results.
- Collection concurrency for the two providers, conservative maximum aggregation, and null estimates when both sources fail.
- Stable table headers, rows, unavailable cells, and warning data.
- CLI help, default config behavior, explicit config selection, unknown options, and fatal argument/config errors.

The completion checks are `pnpm run lint`, `pnpm run build`, and `pnpm run test`, matching CI's existing Node 24 workflow.

## Public repository cleanup

The implementation will retain the scaffold's generic Node 24 development container, TypeScript toolchain, CI, release workflow, and security settings. It will remove unrelated internal references from the public repository, including agent-package configuration, secret forwarding and install steps for unrelated services, and company-specific devcontainer documentation. No internal project names, pillars, notes, credentials, or proprietary workflow assumptions will be copied into the public package.

## Phased roadmap

### Phase 1 — citation table MVP

Deliver the scope in this document: local `paperlens.json`, arXiv-based Semantic Scholar/OpenAlex counts, conservative table output, reusable library functions, tests, and public documentation.

### Phase 2 — output and persistence

Add `--json` and `--markdown`, versioned report schemas, `latest.json`, and timestamped history snapshots suitable for scripts and dashboards.

### Phase 3 — richer metadata and reference discovery

Add optional public `blogUrl` and `publishedDate` fields, full-text/reference discovery, provenance, deduplication, and additional identifiers where they improve matching.

### Phase 4 — retrieval/share-of-voice measurement

Add configurable query panels, LLM provider adapters, sampling, mention detection, and separate reports with explicit coverage and uncertainty semantics.

### Phase 5 — integrations and automation

Add a provider-neutral publishing adapter such as Confluence, scheduled collection workflows, trend/delta presentation, and deployment/secrets guidance.

Each phase should have its own approved design and implementation plan. Later-phase fields and integrations must not expand the MVP implicitly.
