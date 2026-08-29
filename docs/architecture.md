# Architecture

The citation data path is:

```text
paperlens.json → config → providers → collect → output → CLI
```

For each paper, the collected citation count is the maximum value returned by
the available providers. A provider error is non-fatal: the provider is shown
as unavailable, not counted as zero, and other provider results remain usable.
