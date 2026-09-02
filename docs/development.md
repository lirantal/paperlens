# Development

paperlens targets Node.js 24 and uses pnpm.

## Setup

Install dependencies:

```sh
pnpm install
```

Run the CLI against the example configuration:

```sh
pnpm start --config paperlens.json
```

## Provider API keys

`paperlens.json` contains paper metadata only. Keep provider credentials in
environment variables, never in the config file or a committed `.env` file.

A one-off lookup can work without keys, but configure both providers for
reliable repeat use:

- `OPENALEX_API_KEY` — a free key from the [OpenAlex API settings](https://openalex.org/settings/api).
  OpenAlex permits basic keyless calls, but a key increases the daily budget and
  is appropriate for regular use. `OPENALEX_MAILTO` is optional contact
  information sent with the OpenAlex request; it does not replace an API key.
- `SEMANTIC_SCHOLAR_API_KEY` — request a key from the [Semantic Scholar API
  page](https://www.semanticscholar.org/product/api). The Graph API can work
  anonymously but may throttle shared unauthenticated traffic. A key is
  recommended, though rate limits can still apply.

Set keys for the current shell before running the CLI:

```sh
export OPENALEX_API_KEY="your-openalex-key"
export SEMANTIC_SCHOLAR_API_KEY="your-semantic-scholar-key"
export OPENALEX_MAILTO="you@example.com" # optional
pnpm start --config paperlens.json
```

## Commands

```sh
pnpm run build
pnpm run lint
pnpm run test
```
