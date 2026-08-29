import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { loadPaperlensConfig } from '../src/config.js'

async function configFile (value: unknown): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'paperlens-config-'))
  const configPath = path.join(directory, 'paperlens.json')
  await writeFile(configPath, JSON.stringify(value))
  return configPath
}

test('loads a valid paperlens config', async () => {
  const configPath = await configFile({
    papers: [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }]
  })

  assert.deepEqual(await loadPaperlensConfig(configPath), {
    papers: [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }]
  })
})

test('uses paperlens.json in the current working directory by default', async () => {
  const configPath = await configFile({
    papers: [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }]
  })
  const originalCwd = process.cwd()

  process.chdir(path.dirname(configPath))
  try {
    assert.deepEqual(await loadPaperlensConfig(), {
      papers: [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }]
    })
  } finally {
    process.chdir(originalCwd)
  }
})

test('reports a missing config file with its path', async () => {
  const configPath = path.join(os.tmpdir(), 'paperlens-config-missing.json')

  await assert.rejects(loadPaperlensConfig(configPath), (error: Error) => {
    assert.match(error.message, /^Could not read/)
    assert.match(error.message, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    return true
  })
})

test('reports malformed JSON with its path', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'paperlens-config-'))
  const configPath = path.join(directory, 'paperlens.json')
  await writeFile(configPath, '{ malformed')

  await assert.rejects(loadPaperlensConfig(configPath), (error: Error) => {
    assert.match(error.message, /^Config at/)
    assert.match(error.message, /valid JSON/i)
    assert.match(error.message, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    return true
  })
})

test('rejects an empty papers array', async () => {
  const configPath = await configFile({ papers: [] })

  await assert.rejects(loadPaperlensConfig(configPath), /Config validation failed.*papers.*non-empty/i)
})

test('rejects invalid arXiv IDs', async () => {
  const configPath = await configFile({
    papers: [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.037' }]
  })

  await assert.rejects(loadPaperlensConfig(configPath), /Config validation failed.*arxivId/i)
})

test('rejects duplicate paper IDs', async () => {
  const configPath = await configFile({
    papers: [
      { id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' },
      { id: 'paper-one', title: 'Another Paper', arxivId: '2401.12345' }
    ]
  })

  await assert.rejects(loadPaperlensConfig(configPath), /Config validation failed.*(?:unique|duplicate).*id/i)
})

test('rejects unknown paper metadata in the MVP config', async () => {
  const configPath = await configFile({
    papers: [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762', blogUrl: 'https://example.com' }]
  })

  await assert.rejects(loadPaperlensConfig(configPath), /Config validation failed.*unknown.*blogUrl/i)
})

test('rejects unknown root fields', async () => {
  const configPath = await configFile({
    papers: [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }],
    version: 1
  })

  await assert.rejects(loadPaperlensConfig(configPath), /Config validation failed.*unknown.*version/i)
})

test('rejects missing, empty, or incorrectly typed paper fields', async () => {
  const invalidValues = [
    { papers: [{ title: 'Paper One', arxivId: '1706.03762' }] },
    { papers: [{ id: '', title: 'Paper One', arxivId: '1706.03762' }] },
    { papers: [{ id: 'paper-one', title: '', arxivId: '1706.03762' }] },
    { papers: [{ id: 'paper-one', title: 'Paper One', arxivId: 170603762 }] }
  ]

  for (const value of invalidValues) {
    const configPath = await configFile(value)
    await assert.rejects(loadPaperlensConfig(configPath), /Config validation failed.*paper/i)
  }
})

test('rejects missing or incorrectly typed papers', async () => {
  for (const value of [{}, { papers: [] as unknown[] }, { papers: 'papers' }]) {
    const configPath = await configFile(value)
    if (Array.isArray(value.papers) && value.papers.length === 0) continue
    await assert.rejects(loadPaperlensConfig(configPath), /Config validation failed.*papers/i)
  }
})
