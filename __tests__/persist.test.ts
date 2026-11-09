import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { createReportDocument, persistReportDocument, serializeReportDocument } from '../src/main.js'

const report = createReportDocument({
  generatedAt: '2026-11-09T00:00:00.000Z',
  rows: [{
    paper: { id: 'one', title: 'One', arxivId: '1706.03762' },
    semanticScholar: { source: 'semanticScholar', fetchedAt: '2026-11-09T00:00:00.000Z', ok: false, error: 'secret' },
    openAlex: { source: 'openAlex', fetchedAt: '2026-11-09T00:00:00.000Z', ok: false, error: 'secret' },
    citationCountEstimate: null
  }]
})
const directoryFor = async (t: TestContext) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'paperlens-persist-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  return directory
}
const ioError = () => Object.assign(new Error('request secret https://example.com/?api_key=secret'), { code: 'EIO' })

test('creates directories and persists identical safe latest/history; repeated timestamps keep both snapshots', async t => {
  const root = await directoryFor(t)
  const directory = path.join(root, 'nested', 'reports')
  const first = await persistReportDocument(report, directory)
  const original = await fs.readFile(first.historyPath, 'utf8')
  assert.equal(original, `${serializeReportDocument(report)}\n`)
  assert.equal(await fs.readFile(first.latestPath, 'utf8'), original)
  assert.doesNotMatch(original, /secret/)
  assert.equal(JSON.parse(original).rows[0].citationCountEstimate, null)
  const second = await persistReportDocument({ ...report, rows: [] }, directory)
  assert.notEqual(first.historyPath, second.historyPath)
  assert.equal(await fs.readFile(first.historyPath, 'utf8'), original)
  assert.equal(await fs.readFile(second.historyPath, 'utf8'), await fs.readFile(second.latestPath, 'utf8'))
  assert.equal((await fs.readdir(path.join(directory, 'history'))).length, 2)
  assert.deepEqual((await fs.readdir(directory)).sort(), ['history', 'latest.json'])
  assert.ok(path.isAbsolute(first.latestPath))
})

test('preserves existing history when a snapshot filename collides', async t => {
  const directory = await directoryFor(t)
  const uuid = crypto.randomUUID()
  t.mock.method(crypto, 'randomUUID', () => uuid)
  const first = await persistReportDocument(report, directory)
  await assert.rejects(persistReportDocument({ ...report, rows: [] }, directory), /Report was not saved.*EEXIST/)
  assert.equal(await fs.readFile(first.historyPath, 'utf8'), `${serializeReportDocument(report)}\n`)
  assert.equal(await fs.readFile(first.latestPath, 'utf8'), `${serializeReportDocument(report)}\n`)
  assert.equal((await fs.readdir(path.join(directory, 'history'))).length, 1)
  assert.deepEqual((await fs.readdir(directory)).sort(), ['history', 'latest.json'])
})

test('retries a colliding snapshot name and leaves pre-existing temporary files alone', async t => {
  const directory = await directoryFor(t)
  const uuid = crypto.randomUUID()
  const next = crypto.randomUUID()
  let calls = 0
  t.mock.method(crypto, 'randomUUID', () => calls++ === 0 ? uuid : next)
  await fs.mkdir(path.join(directory, 'history'))
  const stale = path.join(directory, 'history', `2026-11-09T00-00-00-000Z-${uuid}.json.tmp`)
  await fs.writeFile(stale, 'prior owner data')
  const result = await persistReportDocument(report, directory)
  assert.match(result.historyPath, new RegExp(next))
  assert.equal(await fs.readFile(stale, 'utf8'), 'prior owner data')
})

test('real overlapping writers reject the second writer without removing the first lock', async t => {
  const directory = await directoryFor(t)
  const link = fs.link.bind(fs)
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const ready = new Promise<void>(resolve => { entered = resolve })
  t.mock.method(fs, 'link', async (...args: Parameters<typeof fs.link>) => {
    entered()
    await gate
    return link(...args)
  })
  const first = persistReportDocument(report, directory)
  await ready
  try {
    await assert.rejects(persistReportDocument(report, directory), /directory is locked/)
    assert.equal(await fs.readFile(path.join(directory, '.paperlens.lock'), 'utf8'), `${process.pid}\n`)
  } finally { release() }
  await first
  assert.deepEqual((await fs.readdir(directory)).sort(), ['history', 'latest.json'])
})

test('stale lock requires manual recovery and is never stolen', async t => {
  const directory = await directoryFor(t)
  const lock = path.join(directory, '.paperlens.lock')
  await fs.writeFile(lock, 'stale owner')
  await assert.rejects(persistReportDocument(report, directory), /confirm no writer is active/)
  assert.equal(await fs.readFile(lock, 'utf8'), 'stale owner')
})

for (const operation of ['link', 'rename'] as const) {
  test(`${operation} failure preserves latest and reports whether history was saved`, async t => {
    const directory = await directoryFor(t)
    await fs.writeFile(path.join(directory, 'latest.json'), 'previous latest')
    t.mock.method(fs, operation, async () => { throw ioError() })
    await assert.rejects(persistReportDocument(report, directory), error => {
      assert.match(String(error), operation === 'rename' ? /History snapshot saved, but latest was not updated/ : /Report was not saved/)
      assert.doesNotMatch(String(error), /secret|example\.com/)
      return true
    })
    assert.equal(await fs.readFile(path.join(directory, 'latest.json'), 'utf8'), 'previous latest')
    assert.equal((await fs.readdir(path.join(directory, 'history'))).length, operation === 'rename' ? 1 : 0)
    assert.deepEqual((await fs.readdir(directory)).sort(), ['history', 'latest.json'])
  })
}

test('write failure cleans up owned temporary files and releases the lock', async t => {
  const directory = await directoryFor(t)
  const open = fs.open.bind(fs)
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args)
    if (String(args[0]).endsWith('.tmp')) t.mock.method(handle, 'writeFile', async () => { throw ioError() })
    return handle
  })
  await assert.rejects(persistReportDocument(report, directory), /Report was not saved/)
  assert.deepEqual(await fs.readdir(directory), ['history'])
  assert.deepEqual(await fs.readdir(path.join(directory, 'history')), [])
})

test('cleanup failure after publication reports that the report was saved', async t => {
  const directory = await directoryFor(t)
  const unlink = fs.unlink.bind(fs)
  t.mock.method(fs, 'unlink', async filename => {
    if (String(filename).endsWith('.paperlens.lock')) throw ioError()
    return unlink(filename)
  })
  await assert.rejects(persistReportDocument(report, directory), /Report saved, but cleanup failed/)
  assert.equal(await fs.readFile(path.join(directory, 'latest.json'), 'utf8'), `${serializeReportDocument(report)}\n`)
})

test('invalid output and preparation failures produce clear errors', async t => {
  const directory = await directoryFor(t)
  await assert.rejects(persistReportDocument(report, '  '), /must not be empty/)
  const file = path.join(directory, 'file')
  await fs.writeFile(file, 'existing data')
  await assert.rejects(persistReportDocument(report, file), /Could not prepare report output directory/)
  assert.equal(await fs.readFile(file, 'utf8'), 'existing data')
})
