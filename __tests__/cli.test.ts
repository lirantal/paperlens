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

for (const flags of [[], ['--json'], ['--markdown']]) {
  test(`persists reports independently of stdout format ${flags.join(' ')}`, async t => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'paperlens-save-'))
    const { readdir, readFile, rm } = await import('node:fs/promises')
    t.after(() => rm(directory, { recursive: true, force: true }))
    const configPath = path.join(directory, 'papers.json')
    await writeFile(configPath, JSON.stringify({ papers: [{ id: 'one', title: 'One', arxivId: '1706.03762' }] }))
    globalThis.fetch = async input => String(input).includes('openalex')
      ? jsonResponse({ results: [{ cited_by_count: 0 }] })
      : jsonResponse({ citationCount: 7 })
    const outputDirectory = path.join(directory, 'reports')
    const stdout: string[] = []
    const code = await runCli([...flags, '-c', configPath, '--output-dir', outputDirectory], {
      stdout: value => stdout.push(value), stderr: () => assert.fail('unexpected diagnostic')
    })
    assert.equal(code, 0)
    const latest = await readFile(path.join(outputDirectory, 'latest.json'), 'utf8')
    assert.equal(JSON.parse(latest).rows[0].citationCountEstimate, 7)
    const history = await readdir(path.join(outputDirectory, 'history'))
    assert.equal(history.length, 1)
    assert.equal(await readFile(path.join(outputDirectory, 'history', history[0]!), 'utf8'), latest)
    if (flags.includes('--json')) assert.deepEqual(JSON.parse(stdout.join('')), JSON.parse(latest))
  })
}

test('does not write files without output-dir and handles persistence errors with exit code 1', async t => {
  const { readdir, rm } = await import('node:fs/promises')
  const directory = await mkdtemp(path.join(os.tmpdir(), 'paperlens-nosave-'))
  const previousCwd = process.cwd()
  process.chdir(directory)
  t.after(async () => { process.chdir(previousCwd); await rm(directory, { recursive: true, force: true }) })
  const configPath = path.join(directory, 'papers.json')
  await writeFile(configPath, JSON.stringify({ papers: [{ id: 'one', title: 'One', arxivId: '1706.03762' }] }))
  globalThis.fetch = async () => { throw new Error('network secret') }
  const stderr: string[] = []
  assert.equal(await runCli(['--json', '-c', configPath], {
    stdout: () => {}, stderr: value => stderr.push(value)
  }), 0)
  assert.deepEqual(await readdir(directory), ['papers.json'])
  assert.equal(await runCli(['--json', '-c', configPath, '--output-dir', './unavailable-reports'], {
    stdout: value => {
      const document = JSON.parse(value)
      assert.equal(document.rows[0].citationCountEstimate, null)
    }, stderr: value => stderr.push(value)
  }), 0)
  assert.ok((await readdir(path.join(directory, 'unavailable-reports'))).includes('latest.json'))
  assert.equal(await runCli(['-c', configPath, '--output-dir', configPath], {
    stdout: () => assert.fail('no stdout on failed persistence'), stderr: value => stderr.push(value)
  }), 1)
  assert.match(stderr.join(''), /Could not prepare report output directory/)
  assert.doesNotMatch(stderr.join(''), /secret/)
})

test('rejects missing or empty output-dir before collection', async () => {
  for (const flags of [['--output-dir'], ['--output-dir', ' ']]) {
    assert.equal(await runCli(flags, { stdout: () => assert.fail(), stderr: () => {} }), 1)
  }
})
