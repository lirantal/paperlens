# Architecture

The citation data path is:

```text
paperlens.json → config → providers → collect → output → CLI
```

For each paper, the collected citation count is the maximum value returned by
the available providers. A provider error is non-fatal: the provider is shown
as unavailable, not counted as zero, and other provider results remain usable.

Versioned report conversion copies public fields and safe diagnostics without
changing the collection API. JSON serialization and Markdown/table rendering are
pure presentation steps after collection. See [report formats](reports.md) and
[Phase 2 design](phase-2-design.md).

Persistence is opt-in after document conversion. It takes an exclusive directory
lock, commits an append-only history snapshot, then atomically replaces latest.
It does not collect, render, calculate deltas, or invoke Git. Filesystem failure
is fatal only when saving was requested; provider unavailability is non-fatal.
