import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { collectCitationReport } from '../src/collect.js'

const originalFetch = globalThis.fetch

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('keeps both provider counts and uses the conservative maximum', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input)
    return url.includes('semanticscholar')
      ? jsonResponse({ citationCount: 7 })
      : jsonResponse({ cited_by_count: 11 })
  }

  const report = await collectCitationReport(
    [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }],
    { delayBetweenPapersMs: 0 }
  )

  assert.equal(report.rows[0]?.citationCountEstimate, 11)
  assert.equal(report.rows[0]?.semanticScholar.ok, true)
  assert.equal(report.rows[0]?.openAlex.ok, true)
})

test('uses the successful provider count when the other provider fails', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input)
    return url.includes('semanticscholar')
      ? jsonResponse({}, 503)
      : jsonResponse({ cited_by_count: 7 })
  }

  const report = await collectCitationReport(
    [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }],
    { delayBetweenPapersMs: 0 }
  )

  assert.equal(report.rows[0]?.citationCountEstimate, 7)
  assert.equal(report.rows[0]?.semanticScholar.ok, false)
  assert.equal(report.rows[0]?.openAlex.ok, true)
})

test('uses null when both providers fail', async () => {
  globalThis.fetch = async () => jsonResponse({}, 503)

  const report = await collectCitationReport(
    [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }],
    { delayBetweenPapersMs: 0 }
  )

  assert.equal(report.rows[0]?.citationCountEstimate, null)
  assert.equal(report.rows[0]?.semanticScholar.ok, false)
  assert.equal(report.rows[0]?.openAlex.ok, false)
})

test('waits between papers while processing papers sequentially', async () => {
  const requestedPaperIds: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    requestedPaperIds.push(url.includes('1706.03762') ? 'paper-one' : 'paper-two')
    return url.includes('semanticscholar')
      ? jsonResponse({ citationCount: 7 })
      : jsonResponse({ cited_by_count: 11 })
  }

  const startedAt = Date.now()
  const report = await collectCitationReport(
    [
      { id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' },
      { id: 'paper-two', title: 'Paper Two', arxivId: '1706.03763' }
    ],
    { delayBetweenPapersMs: 20 }
  )

  assert.equal(report.rows.length, 2)
  assert.ok(Date.now() - startedAt >= 20)
  assert.deepEqual(requestedPaperIds.slice(0, 2), ['paper-one', 'paper-one'])
})
