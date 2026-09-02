# paperlens Citation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scaffold placeholder with a dependency-free Node 24 CLI and library that loads `paperlens.json`, collects Semantic Scholar and OpenAlex citation counts for configured arXiv papers, and renders a readable table.

**Architecture:** Keep configuration, provider clients, collection/aggregation, output rendering, and CLI argument handling in focused modules. Provider clients return discriminated success/error results, the collector aggregates successful counts with `max`, and the CLI only owns process I/O and exit status.

**Tech Stack:** TypeScript, Node.js 24 built-in `fetch`, `AbortSignal.timeout`, `node:util.parseArgs`, `node:test`, pnpm, tsx, tsdown, ESLint, and Changesets. No runtime dependencies.

## Global Constraints

- Target Node.js `>=24.0.0` and pnpm `>=10.26.0` as declared by `package.json`.
- Add no runtime dependencies; use Node 24 built-in APIs for HTTP, CLI parsing, filesystem access, timers, and path handling.
- The MVP config file is `paperlens.json` with a non-empty `papers` array of unique `{ id, title, arxivId }` objects.
- Reject unknown config properties and do not accept `blogUrl`, `publishedDate`, `pillar`, or `notes` until a later phase.
- Use Semantic Scholar and OpenAlex, preserving raw provider results and aggregating with the maximum successful count; use `null` when both providers fail.
- Provider/HTTP/network failures are non-fatal per paper; missing, malformed, invalid, or unrecognized CLI input is fatal with a readable error and exit status `1`.
- The MVP supports only `--config <path>`, `-c <path>`, and `--help`/`-h`; it does not add JSON, Markdown, persistence, full-text discovery, LLM, or integration features.
- Preserve the scaffold’s TypeScript, pnpm, Node test runner, lint, build, CI, release, security, and Changesets workflows.
- Remove company-specific or unrelated internal tooling references from the public repository.
- Every behavior change gets tests, and every published-package behavior change gets a Changeset.

---

### Task 1: Sanitize the public scaffold and add project documentation

**Files:**
- Delete: `apm.yml`
- Modify: `.devcontainer/README.md`
- Modify: `.devcontainer/devcontainer.json`
- Modify: `.devcontainer/post-create.sh`
- Modify: `.gitignore`
- Modify: `eslint.config.js`
- Modify: `package.json`
- Modify: `README.md`
- Create: `paperlens.json`
- Create: `docs/README.md`
- Create: `docs/development.md`
- Create: `docs/testing.md`
- Create: `docs/architecture.md`
- Create: `docs/conventions.md`

**Interfaces:**
- Produces the public-facing config example and documentation paths referenced by `AGENTS.md`.
- Leaves the existing Node 24 CI and release workflows unchanged.

- [ ] **Step 1: Record the current public-reference audit**

Run:

```bash
rg -n -i --hidden -g '!.git/**' -g '!node_modules/**' -g '!docs/superpowers/**' -e 'snyk|devrel|forward research|vulnbench|anthropic|apm' .
```

Expected: matches are limited to the known scaffold/internal-reference files and are removed by this task; no source behavior is changed yet.

- [ ] **Step 2: Remove unrelated internal configuration**

Delete `apm.yml`. In `.devcontainer/devcontainer.json`, remove `ANTHROPIC_API_KEY` and `SNYK_TOKEN` from `containerEnv`. In `.devcontainer/post-create.sh`, remove the `install_apm` and `install_snyk_cli` functions and their calls while retaining generic Git, dependency, and development-container setup. Rewrite `.devcontainer/README.md` so it describes only the generic Node 24 development container and does not mention internal services or secrets.

Remove the `APM dependencies` and `Snyk` sections from `.gitignore`, remove `apm_modules/**` from `eslint.config.js`, and remove `-i 'apm_modules/**'` from both Markdown lint script definitions in `package.json`.

- [ ] **Step 3: Add a neutral example config**

Create `paperlens.json` with a public, non-company-specific paper:

```json
{
  "papers": [
    {
      "id": "attention-is-all-you-need",
      "title": "Attention Is All You Need",
      "arxivId": "1706.03762"
    }
  ]
}
```

- [ ] **Step 4: Document installation and MVP usage**

Replace the README placeholder usage with:

```sh
pnpm add paperlens
paperlens --config paperlens.json
```

Document that no-argument execution reads `paperlens.json` from the current working directory, `-c` is an alias for `--config`, API keys are optional environment variables, and provider failures are displayed as unavailable rather than treated as zero. Add links to `docs/README.md` and the contribution/release/security files. Do not include company-specific sample data.

Create `docs/README.md` linking to `development.md`, `testing.md`, `architecture.md`, and `conventions.md`. Document the following exact public guidance:

- `docs/development.md`: Node 24, pnpm install, `pnpm start -- --config paperlens.json`, build, lint, and test commands.
- `docs/testing.md`: Node test runner, stubbed `globalThis.fetch`, no live network calls, and the full CI-equivalent verification commands.
- `docs/architecture.md`: `paperlens.json → config → providers → collect → output → CLI`, the max aggregation rule, and the non-fatal provider-error rule.
- `docs/conventions.md`: TypeScript strictness, Node built-ins over dependencies, Conventional Commits, tests for behavior changes, and Changesets for published behavior.

Include the phased roadmap from the approved spec in `docs/README.md`: Phase 1 table MVP; Phase 2 JSON/Markdown and persistence; Phase 3 `blogUrl`/`publishedDate` and reference discovery; Phase 4 LLM retrieval/share-of-voice; Phase 5 integrations and automation.

- [ ] **Step 5: Verify the scaffold cleanup**

Run:

```bash
rg -n -i --hidden -g '!.git/**' -g '!node_modules/**' -g '!docs/superpowers/**' -e 'snyk|devrel|forward research|vulnbench|anthropic|apm' .
pnpm run lint:markdown
git diff --check
```

Expected: the first command has no matches, Markdown lint exits `0`, and `git diff --check` emits no errors.

- [ ] **Step 6: Commit the cleanup**

```bash
git add .devcontainer .gitignore eslint.config.js package.json README.md paperlens.json docs apm.yml
git commit -m "docs: prepare public paperlens project"
```

### Task 2: Add and validate the public config contract

**Files:**
- Create: `src/types.ts`
- Create: `src/config.ts`
- Create: `__tests__/config.test.ts`

**Interfaces:**
- Produces `Paper`, `PaperlensConfig`, `ProviderCitationResult`, `CitationRow`, `CitationReport`, and `CollectCitationOptions` in `src/types.ts`.
- Produces `loadPaperlensConfig(configPath?: string): Promise<PaperlensConfig>` from `src/config.ts`.
- Later tasks consume `Paper` and the result types without importing implementation details.

- [ ] **Step 1: Write failing config tests**

Create `__tests__/config.test.ts` with Node’s built-in test runner. The tests must cover valid loading from an explicit temporary path, missing files, malformed JSON, empty papers, invalid arXiv IDs, duplicate IDs, and unknown fields. The core assertions should be:

```ts
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { loadPaperlensConfig } from '../src/config.js'

test('loads a valid paperlens config', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'paperlens-config-'))
  const configPath = path.join(directory, 'paperlens.json')
  await writeFile(configPath, JSON.stringify({
    papers: [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }],
  }))

  assert.deepEqual(await loadPaperlensConfig(configPath), {
    papers: [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }],
  })
})

test('rejects unknown paper metadata in the MVP config', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'paperlens-config-'))
  const configPath = path.join(directory, 'paperlens.json')
  await writeFile(configPath, JSON.stringify({
    papers: [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762', blogUrl: 'https://example.com' }],
  }))

  await assert.rejects(loadPaperlensConfig(configPath), /unknown|blogUrl/i)
})
```

Add equivalent focused tests for each remaining validation failure; assert readable error text rather than implementation-specific stack traces.

- [ ] **Step 2: Run the config tests and confirm RED**

```bash
pnpm exec c8 node --import tsx --test __tests__/config.test.ts
```

Expected: FAIL because `src/config.ts` does not yet export `loadPaperlensConfig`.

- [ ] **Step 3: Implement the minimal public types and loader**

Define these types in `src/types.ts`:

```ts
export interface Paper {
  id: string
  title: string
  arxivId: string
}

export interface PaperlensConfig {
  papers: Paper[]
}

export type ProviderName = 'semanticScholar' | 'openAlex'

export type ProviderCitationResult =
  | { source: ProviderName; fetchedAt: string; ok: true; citationCount: number }
  | { source: ProviderName; fetchedAt: string; ok: false; error: string }

export interface CitationRow {
  paper: Paper
  semanticScholar: ProviderCitationResult
  openAlex: ProviderCitationResult
  citationCountEstimate: number | null
}

export interface CitationReport {
  generatedAt: string
  rows: CitationRow[]
}

export interface CollectCitationOptions {
  semanticScholarApiKey?: string
  openAlexApiKey?: string
  openAlexMailto?: string
  delayBetweenPapersMs?: number
  requestTimeoutMs?: number
}
```

Implement `src/config.ts` with `readFile`, `JSON.parse`, a strict object/array validator, `path.resolve(process.cwd(), 'paperlens.json')` as the default, unique IDs, and the exact arXiv regex `/^\d{4}\.\d{4,5}$/`. Wrap file, JSON, and validation failures in errors beginning with `Could not read`, `Config at`, or `Config validation failed` and include the path.

- [ ] **Step 4: Run the config tests and confirm GREEN**

```bash
pnpm exec c8 node --import tsx --test __tests__/config.test.ts
```

Expected: all config tests pass with zero failures.

- [ ] **Step 5: Commit the config contract**

```bash
git add src/types.ts src/config.ts __tests__/config.test.ts
git commit -m "feat: add paperlens config loading"
```

### Task 3: Add Semantic Scholar and OpenAlex provider clients

**Files:**
- Create: `src/providers/semanticScholar.ts`
- Create: `src/providers/openAlex.ts`
- Create: `__tests__/providers.test.ts`

**Interfaces:**
- Consumes: `ProviderCitationResult` from `src/types.ts`.
- Produces `fetchSemanticScholarCitations(arxivId: string, options?: { apiKey?: string; requestTimeoutMs?: number }): Promise<ProviderCitationResult>`.
- Produces `fetchOpenAlexCitations(arxivId: string, options?: { apiKey?: string; mailto?: string; requestTimeoutMs?: number }): Promise<ProviderCitationResult>`.

- [ ] **Step 1: Write failing provider tests**

Stub `globalThis.fetch` with `Response` instances. Cover successful mapping, 404/non-OK results, network failures, timeout signal presence, Semantic Scholar retry recovery from a `429`, and the optional API-key query/header behavior. Use `Retry-After: 0` in retry fixtures so tests never sleep.

```ts
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { fetchOpenAlexCitations } from '../src/providers/openAlex.js'
import { fetchSemanticScholarCitations } from '../src/providers/semanticScholar.js'

const originalFetch = globalThis.fetch
const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('maps Semantic Scholar citationCount', async () => {
  globalThis.fetch = async () => jsonResponse({ citationCount: 7 })
  const result = await fetchSemanticScholarCitations('1706.03762')
  assert.deepEqual(result.ok && result.citationCount, 7)
})

test('maps OpenAlex cited_by_count', async () => {
  globalThis.fetch = async () => jsonResponse({ cited_by_count: 11 })
  const result = await fetchOpenAlexCitations('1706.03762')
  assert.deepEqual(result.ok && result.citationCount, 11)
})

test('returns an error result instead of throwing on provider failure', async () => {
  globalThis.fetch = async () => jsonResponse({}, 503)
  const result = await fetchOpenAlexCitations('1706.03762')
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /503/)
})
```

- [ ] **Step 2: Run provider tests and confirm RED**

```bash
pnpm exec c8 node --import tsx --test __tests__/providers.test.ts
```

Expected: FAIL because the provider modules do not yet exist.

- [ ] **Step 3: Implement the Semantic Scholar client**

Call `https://api.semanticscholar.org/graph/v1/paper/arXiv:${arxivId}?fields=citationCount` with `Accept: application/json` and optional `x-api-key`. Use `AbortSignal.timeout(requestTimeoutMs ?? 10_000)`. Retry `429` and `5xx` up to three attempts, honoring numeric `Retry-After` and otherwise using bounded exponential delays. Return `{ source: 'semanticScholar', fetchedAt, ok: true, citationCount }` on success and `{ source, fetchedAt, ok: false, error }` for every HTTP, timeout, JSON, or network failure.

- [ ] **Step 4: Implement the OpenAlex client**

Resolve the arXiv ID through `https://api.openalex.org/works/https://doi.org/10.48550/arXiv.${arxivId}`. Add optional `api_key` and `mailto` search parameters, use the same timeout, map `cited_by_count` to `citationCount`, and return the same success/error discriminated shape. Do not throw for 404 or other non-OK responses.

- [ ] **Step 5: Run provider tests and confirm GREEN**

```bash
pnpm exec c8 node --import tsx --test __tests__/providers.test.ts
```

Expected: all provider tests pass with no live network requests.

- [ ] **Step 6: Commit the provider clients**

```bash
git add src/providers __tests__/providers.test.ts
git commit -m "feat: collect citation counts from academic providers"
```

### Task 4: Orchestrate collection and conservative aggregation

**Files:**
- Create: `src/collect.ts`
- Create: `__tests__/collect.test.ts`

**Interfaces:**
- Consumes: `Paper`, `CitationReport`, `CitationRow`, and `CollectCitationOptions` from `src/types.ts`; both provider functions from Task 3.
- Produces `collectCitationReport(papers: readonly Paper[], options?: CollectCitationOptions): Promise<CitationReport>`.

- [ ] **Step 1: Write failing collection tests**

Stub `globalThis.fetch` based on the request URL. Return Semantic Scholar count `7` and OpenAlex count `11` for one paper, then assert the report preserves both source results and sets `citationCountEstimate` to `11`. Add a test where one provider returns `503` and the other returns `7`, and a test where both return errors and the estimate is `null`. Set `delayBetweenPapersMs: 0` in tests.

```ts
test('keeps both provider counts and uses the conservative maximum', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input)
    return url.includes('semanticscholar')
      ? jsonResponse({ citationCount: 7 })
      : jsonResponse({ cited_by_count: 11 })
  }

  const report = await collectCitationReport(
    [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }],
    { delayBetweenPapersMs: 0 },
  )

  assert.equal(report.rows[0]?.citationCountEstimate, 11)
  assert.equal(report.rows[0]?.semanticScholar.ok, true)
  assert.equal(report.rows[0]?.openAlex.ok, true)
})
```

- [ ] **Step 2: Run collection tests and confirm RED**

```bash
pnpm exec c8 node --import tsx --test __tests__/collect.test.ts
```

Expected: FAIL because `src/collect.ts` does not yet export `collectCitationReport`.

- [ ] **Step 3: Implement collection orchestration**

For each paper, invoke both providers with `Promise.all`, passing the corresponding options. Process papers sequentially and wait `delayBetweenPapersMs ?? 1_100` milliseconds between papers using `node:timers/promises`. Build each row with the input paper and both results. Compute the estimate from only successful `citationCount` values with `Math.max`; use `null` when no successful values exist. Return `{ generatedAt: new Date().toISOString(), rows }`.

- [ ] **Step 4: Run collection tests and confirm GREEN**

```bash
pnpm exec c8 node --import tsx --test __tests__/collect.test.ts
```

Expected: all aggregation and failure-isolation tests pass.

- [ ] **Step 5: Commit the collector**

```bash
git add src/collect.ts __tests__/collect.test.ts
git commit -m "feat: aggregate citation collection results"
```

### Task 5: Render deterministic table output

**Files:**
- Create: `src/output.ts`
- Create: `__tests__/output.test.ts`

**Interfaces:**
- Consumes: `CitationReport` from `src/types.ts`.
- Produces `renderCitationTable(report: CitationReport): string`.

- [ ] **Step 1: Write failing renderer tests**

Construct a report with one successful row and one row with provider errors. Assert the output contains the exact headers `Paper`, `arXiv ID`, `Semantic Scholar`, `OpenAlex`, and `Estimate`; contains both titles and IDs; contains numeric counts; contains `unavailable` for failed providers and the all-failed estimate; and is stable across repeated calls.

```ts
test('renders a stable table with counts and unavailable values', () => {
  const output = renderCitationTable({
    generatedAt: '2026-08-29T00:00:00.000Z',
    rows: [{
      paper: { id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' },
      semanticScholar: { source: 'semanticScholar', fetchedAt: 'now', ok: true, citationCount: 7 },
      openAlex: { source: 'openAlex', fetchedAt: 'now', ok: false, error: 'HTTP 503' },
      citationCountEstimate: 7,
    }],
  })

  assert.match(output, /Paper\s+\|/)
  assert.match(output, /Semantic Scholar/)
  assert.match(output, /Paper One/)
  assert.match(output, /1706\.03762/)
  assert.match(output, /unavailable/)
  assert.match(output, /7/)
  assert.equal(output, renderCitationTable(JSON.parse(JSON.stringify({
    generatedAt: '2026-08-29T00:00:00.000Z',
    rows: [{
      paper: { id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' },
      semanticScholar: { source: 'semanticScholar', fetchedAt: 'now', ok: true, citationCount: 7 },
      openAlex: { source: 'openAlex', fetchedAt: 'now', ok: false, error: 'HTTP 503' },
      citationCountEstimate: 7,
    }],
  }))))
})
```

- [ ] **Step 2: Run renderer tests and confirm RED**

```bash
pnpm exec c8 node --import tsx --test __tests__/output.test.ts
```

Expected: FAIL because `src/output.ts` does not yet export `renderCitationTable`.

- [ ] **Step 3: Implement the pure table renderer**

Build a header plus one row per report row. Calculate each column width from header and cell lengths, render a border/header/rows with `|` separators, and use `unavailable` for non-OK provider results and `citationCountEstimate === null`. Do not include timestamps, error text, ANSI color, terminal-width detection, or external table packages.

- [ ] **Step 4: Run renderer tests and confirm GREEN**

```bash
pnpm exec c8 node --import tsx --test __tests__/output.test.ts
```

Expected: all renderer tests pass and the output is deterministic.

- [ ] **Step 5: Commit table rendering**

```bash
git add src/output.ts __tests__/output.test.ts
git commit -m "feat: render citation results as a table"
```

### Task 6: Wire the library exports and CLI

**Files:**
- Create: `src/cli.ts`
- Modify: `src/main.ts`
- Modify: `src/bin/cli.ts`
- Create: `__tests__/cli.test.ts`
- Modify: `package.json`
- Modify: `tsdown.config.ts` only if the existing entry configuration does not emit the updated CLI correctly

**Interfaces:**
- Consumes: `loadPaperlensConfig`, `collectCitationReport`, `renderCitationTable`, provider results, and report types from Tasks 2–5.
- Produces `runCli(args: readonly string[], io?: CliIo): Promise<number>` in `src/cli.ts` for testable process behavior.
- Produces the public `src/main.ts` exports: `loadPaperlensConfig`, `collectCitationReport`, `renderCitationTable`, and all public types.

- [ ] **Step 1: Write failing CLI tests**

Test `runCli` with an injected `{ stdout, stderr }` object. Cover help returning `0` without reading config, unknown options returning `1`, explicit config selection, and a successful run writing the table. Stub `globalThis.fetch` for the successful run.

```ts
test('prints help without collecting', async () => {
  const stdout: string[] = []
  const stderr: string[] = []
  const exitCode = await runCli(['--help'], {
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  })

  assert.equal(exitCode, 0)
  assert.match(stdout.join(''), /paperlens.*--config/s)
  assert.equal(stderr.join(''), '')
})

test('rejects unknown options', async () => {
  const stderr: string[] = []
  const exitCode = await runCli(['--json'], {
    stdout: () => {},
    stderr: (value) => stderr.push(value),
  })

  assert.equal(exitCode, 1)
  assert.match(stderr.join(''), /unknown|option/i)
})
```

- [ ] **Step 2: Run CLI tests and confirm RED**

```bash
pnpm exec c8 node --import tsx --test __tests__/cli.test.ts
```

Expected: FAIL because `src/cli.ts` and `runCli` do not yet exist.

- [ ] **Step 3: Implement the testable CLI runner**

Use `node:util.parseArgs` with `strict: true` and options `config` (`string`, short `c`) and `help` (`boolean`, short `h`). On help, write usage text and return `0`. On parse/config errors, write a concise `paperlens: ...` message to stderr and return `1`. Otherwise load the selected config, collect with environment values `SEMANTIC_SCHOLAR_API_KEY`, `OPENALEX_API_KEY`, and `OPENALEX_MAILTO`, write `renderCitationTable(report)` to stdout, then write concise provider warning lines to stderr for each non-OK result and return `0`.

Define:

```ts
export interface CliIo {
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export async function runCli(
  args: readonly string[],
  io: CliIo = { stdout: console.log, stderr: console.error },
): Promise<number>
```

- [ ] **Step 4: Replace the placeholder API and binary**

Replace `src/main.ts` with re-exports from `src/config.js`, `src/collect.js`, `src/output.js`, and `src/types.js`. Replace `src/bin/cli.ts` with a shebang, an import of `runCli`, and a top-level invocation that assigns the returned number to `process.exitCode`. Remove the `add()` implementation and debug logging.

- [ ] **Step 5: Run CLI tests and confirm GREEN**

```bash
pnpm exec c8 node --import tsx --test __tests__/cli.test.ts
```

Expected: all CLI behavior tests pass with no live API calls.

- [ ] **Step 6: Build and exercise the compiled binary**

Run:

```bash
pnpm run build
node dist/bin/cli.cjs --help
node dist/bin/cli.cjs --config /tmp/does-not-exist-paperlens.json
```

Expected: build exits `0`; help exits `0` and prints usage; the missing config command exits `1` with a readable stderr message.

- [ ] **Step 7: Commit the CLI and public API**

```bash
git add src package.json tsdown.config.ts __tests__/cli.test.ts
git commit -m "feat: add paperlens citation CLI"
```

### Task 7: Add release metadata and perform full verification

**Files:**
- Create: `.changeset/citation-table-mvp.md`
- Modify: `docs/README.md` only if the implemented command/API names differ from the approved docs

**Interfaces:**
- Consumes the complete MVP CLI/library behavior from Tasks 1–6.
- Produces release metadata for the published package.

- [ ] **Step 1: Add the Changeset**

Create `.changeset/citation-table-mvp.md`:

```md
---
"paperlens": minor
---

Add config-driven Semantic Scholar and OpenAlex citation collection with a readable table CLI and reusable library API.
```

- [ ] **Step 2: Run the complete verification suite**

Run each command from the repository root:

```bash
pnpm run lint
pnpm run build
pnpm run test
pnpm run lint:markdown
pnpm pack --dry-run
```

Expected: all commands exit `0`; tests report zero failures; the package dry run includes the built `dist` files and excludes development-only files; no command makes a live network request.

- [ ] **Step 3: Audit requirements against the approved spec**

Run:

```bash
rg -n -i --hidden -g '!.git/**' -g '!node_modules/**' -g '!docs/superpowers/**' -e 'snyk|devrel|forward research|vulnbench|anthropic|apm' .
git diff --check
git status --short
```

Expected: no internal-reference matches, no whitespace errors, and only the intended staged/committed MVP changes remain.

- [ ] **Step 4: Commit release metadata**

```bash
git add .changeset/citation-table-mvp.md docs
git commit -m "chore: prepare citation MVP release"
```

- [ ] **Step 5: Verify the final commit history and package surface**

```bash
git log --oneline -8
git status --short --branch
pnpm pack --dry-run
```

Expected: the task commits use Conventional Commit messages, the worktree is clean, and the package surface contains the CLI/library build output without internal project data.
