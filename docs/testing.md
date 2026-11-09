# Testing

Tests use the Node test runner. Provider interactions stub `globalThis.fetch`,
so the test suite makes no live network calls.

Run the full CI-equivalent verification locally:

```sh
pnpm install --frozen-lockfile
pnpm run lint
pnpm run build
pnpm run test
```

Report tests cover versioned output, zero/unavailable semantics, safe diagnostics,
Markdown escaping, and CLI stdout/stderr separation without live provider calls.

Persistence tests use temporary directories, overlapping writers, filename
collisions, and injected filesystem failures. They verify history preservation,
latest replacement, partial-failure diagnostics, and owned-file cleanup.

The release regression test runs `pnpm run version` in a disposable fixture with
the installed development tools and repository formatter configuration. It
checks version/changelog generation and formatting without publishing or remote
changelog lookups. No release files in the working checkout are modified.
