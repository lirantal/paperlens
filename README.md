<!-- markdownlint-disable -->

<p align="center">
  <h1 align="center">
    paperlens
  </h1>
</p>

<p align="center">
  capture, track, and analyze academic paper citations
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/paperlens"><img src="https://badgen.net/npm/v/paperlens" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/paperlens"><img src="https://badgen.net/npm/license/paperlens" alt="license"/></a>
  <a href="https://www.npmjs.com/package/paperlens"><img src="https://badgen.net/npm/dt/paperlens" alt="downloads"/></a>  
  <a href="https://github.com/lirantal/paperlens/actions/workflows/ci.yml"><img src="https://github.com/lirantal/paperlens/actions/workflows/ci.yml/badge.svg?branch=main" alt="build"/></a>
  <a href="https://app.codecov.io/gh/lirantal/paperlens"><img src="https://badgen.net/codecov/c/github/lirantal/paperlens" alt="codecov"/></a>
  <a href="./SECURITY.md"><img src="https://img.shields.io/badge/Security-Responsible%20Disclosure-yellow.svg" alt="Responsible Disclosure Policy" /></a>
</p>

<img width="1840" height="666" alt="image" src="https://github.com/user-attachments/assets/a74a04e5-6078-4f0c-8a98-d10628e1db9e" />


## Quick start

```sh
npx paperlens
```

Create a `paperlens.json` file in the current directory first:

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

`npx` downloads and runs the CLI without a global install.

## Install globally (optional)

```sh
npm install --global paperlens
paperlens
```

Both forms read `paperlens.json` from the current working directory. Use
`--config <path>` (or `-c <path>`) to select a different file. Provider API
keys are optional environment variables; when a provider cannot be reached,
paperlens shows it as unavailable instead of reporting its citation count as
zero.

For reliable repeat use, configure the free OpenAlex and Semantic Scholar API
keys in your environment. Do not add credentials to `paperlens.json`; see the
[development guide](docs/development.md#provider-api-keys) for setup.

See the [documentation](docs/README.md) for local development, testing,
architecture, and project conventions.

## Contributing

See [Contributing](CONTRIBUTING.md), [Release](RELEASE.md), and
[Security](SECURITY.md).

## Author

**paperlens** © [Liran Tal](https://github.com/lirantal), Released under the [Apache-2.0](./LICENSE) License.
