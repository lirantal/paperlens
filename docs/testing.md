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
