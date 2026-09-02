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

## Install

```sh
pnpm add paperlens
```
## Usage: CLI

```sh
pnpm exec paperlens --config paperlens.json
```

`pnpm exec` runs the `paperlens` binary after it has been installed as a local
dependency. From a checkout of this repository, use:

```sh
pnpm start --config paperlens.json
```

Running either command without arguments reads `paperlens.json` from the
current working directory. Use `-c` as an alias for `--config`. Provider API
keys are optional environment variables; when a provider cannot be reached,
paperlens shows it as unavailable instead of reporting its citation count as
zero.

See the [documentation](docs/README.md) for development, testing, architecture,
and project conventions.

## Contributing

See [Contributing](CONTRIBUTING.md), [Release](RELEASE.md), and
[Security](SECURITY.md).

## Author

**paperlens** © [Liran Tal](https://github.com/lirantal), Released under the [Apache-2.0](./LICENSE) License.
