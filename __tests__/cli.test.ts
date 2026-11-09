import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'
import { runCli } from '../src/cli.js'

const originalFetch = globalThis.fetch
const originalEnvironment = {
  semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY,
  openAlexApiKey: process.env.OPENALEX_API_KEY,
  openAlexMailto: process.env.OPENALEX_MAILTO
}

const restoreEnvironmentVariable = (name: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  headers: { 'content-type': 'application/json' }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  restoreEnvironmentVariable('SEMANTIC_SCHOLAR_API_KEY', originalEnvironment.semanticScholarApiKey)
  restoreEnvironmentVariable('OPENALEX_API_KEY', originalEnvironment.openAlexApiKey)
  restoreEnvironmentVariable('OPENALEX_MAILTO', originalEnvironment.openAlexMailto)
})

test('restores absent provider environment variables', () => {
  for (const environmentVariable of [
    'SEMANTIC_SCHOLAR_API_KEY',
    'OPENALEX_API_KEY',
    'OPENALEX_MAILTO'
  ]) {
    process.env[environmentVariable] = 'temporary-value'
    restoreEnvironmentVariable(environmentVariable, undefined)
    assert.equal(process.env[environmentVariable], undefined)
  }
})

test('prints help without reading config', async () => {
  const stdout: string[] = []
  const stderr: string[] = []

  const exitCode = await runCli(['--help'], {
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value)
  })

  assert.equal(exitCode, 0)
  assert.match(stdout.join(''), /paperlens.*--config/s)
  assert.equal(stderr.join(''), '')
})

test('rejects unknown options', async () => {
  const stderr: string[] = []

  const exitCode = await runCli(['--unknown'], {
    stdout: () => {},
    stderr: (value) => stderr.push(value)
  })

  assert.equal(exitCode, 1)
  assert.match(stderr.join(''), /paperlens:.*unknown|option/i)
})

test('loads an explicit config and writes the citation table', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'paperlens-cli-'))
  const configPath = path.join(directory, 'papers.json')
  await writeFile(configPath, JSON.stringify({
    papers: [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }]
  }))
  const stdout: string[] = []
  const stderr: string[] = []
  const requests: Array<{ url: URL, headers: Headers }> = []
  process.env.SEMANTIC_SCHOLAR_API_KEY = 'semantic-key'
  process.env.OPENALEX_API_KEY = 'openalex-key'
  process.env.OPENALEX_MAILTO = 'maintainer@example.com'
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input)), headers: new Headers(init?.headers) })
    return String(input).includes('semanticscholar')
      ? jsonResponse({ citationCount: 7 })
      : jsonResponse({ results: [{ cited_by_count: 11 }] })
  }

  const exitCode = await runCli(['--config', configPath], {
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value)
  })

  assert.equal(exitCode, 0)
  assert.match(stdout.join(''), /Paper One/)
  assert.match(stdout.join(''), /11/)
  assert.equal(stderr.join(''), '')
  const [semanticScholarRequest, openAlexRequest] = requests
  assert.equal(semanticScholarRequest?.headers.get('x-api-key'), 'semantic-key')
  assert.equal(openAlexRequest?.url.searchParams.get('api_key'), 'openalex-key')
  assert.equal(openAlexRequest?.url.searchParams.get('mailto'), 'maintainer@example.com')
})

test('reports config failures with exit code 1', async () => {
  const stderr: string[] = []

  const exitCode = await runCli(['-c', '/tmp/does-not-exist-paperlens.json'], {
    stdout: () => {},
    stderr: (value) => stderr.push(value)
  })

  assert.equal(exitCode, 1)
  assert.match(stderr.join(''), /^paperlens: Could not read config/m)
})

test('reports unavailable providers without failing the collection', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'paperlens-cli-'))
  const configPath = path.join(directory, 'papers.json')
  await writeFile(configPath, JSON.stringify({
    papers: [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }]
  }))
  const stdout: string[] = []
  const stderr: string[] = []
  globalThis.fetch = async (input) => String(input).includes('semanticscholar')
    ? jsonResponse({ citationCount: 7 })
    : new Response('{}', { status: 503 })

  const exitCode = await runCli(['-c', configPath], {
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value)
  })

  assert.equal(exitCode, 0)
  assert.match(stdout.join(''), /7/)
  assert.match(stderr.join(''), /paperlens: openAlex unavailable: OpenAlex request failed with HTTP 503/)
})

test('rejects conflicting report modes before config or collection', async () => {
  const stderr: string[] = []
  const exitCode = await runCli(['--json', '--markdown'], {
    stdout: () => assert.fail('must not write stdout'),
    stderr: value => stderr.push(value)
  })
  assert.equal(exitCode, 1)
  assert.match(stderr.join(''), /mutually exclusive/)
})

for (const mode of ['--json', '--markdown']) {
  test(`${mode} collects once, preserves zero/failure and keeps credentials out of output`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'paperlens-format-'))
    const configPath = path.join(directory, 'papers.json')
    await writeFile(configPath, JSON.stringify({ papers: [{ id: 'one', title: 'Paper One', arxivId: '1706.03762' }] }))
    const stdout: string[] = []
    const stderr: string[] = []
    let requests = 0
    globalThis.fetch = async input => {
      requests++
      if (String(input).includes('openalex')) throw new Error('https://api.openalex.org/?api_key=secret Authorization: Bearer secret')
      return jsonResponse({ citationCount: 0 })
    }
    const code = await runCli([mode, '-c', configPath], {
      stdout: value => stdout.push(value), stderr: value => stderr.push(value)
    })
    assert.equal(code, 0)
    assert.equal(requests, 2)
    assert.equal(stdout.length, 1)
    assert.match(stderr.join(''), /openAlex unavailable/)
    assert.doesNotMatch(stdout.join('') + stderr.join(''), /secret|Authorization|api_key/)
    if (mode === '--json') {
      const document = JSON.parse(stdout.join(''))
      assert.equal(document.schemaVersion, 1)
      assert.equal(document.rows[0].citationCountEstimate, 0)
      assert.equal(document.rows[0].openAlex.ok, false)
    } else {
      assert.match(stdout.join(''), /Generated at:/)
      assert.match(stdout.join(''), /\| 0 \| unavailable \| 0 \|/)
    }
  })
}
