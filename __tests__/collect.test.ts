import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { collectCitationReport } from '../src/collect.js'

const originalFetch = globalThis.fetch

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
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
      ? jsonResponse({}, 503, { 'retry-after': '0' })
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

test('preserves raw provider results on the returned row', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input)
    return url.includes('semanticscholar')
      ? jsonResponse({ citationCount: 7 })
      : jsonResponse({}, 503, { 'retry-after': '0' })
  }

  const report = await collectCitationReport(
    [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }],
    { delayBetweenPapersMs: 0 }
  )
  const row = report.rows[0]

  assert.ok(row)
  assert.equal(row.semanticScholar.source, 'semanticScholar')
  assert.equal(row.semanticScholar.ok && row.semanticScholar.citationCount, 7)
  assert.match(row.semanticScholar.fetchedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(row.openAlex.source, 'openAlex')
  assert.equal(row.openAlex.ok, false)
  if (!row.openAlex.ok) {
    assert.match(row.openAlex.error, /503/)
    assert.match(row.openAlex.fetchedAt, /^\d{4}-\d{2}-\d{2}T/)
  }
})

test('uses null when both providers fail', async () => {
  globalThis.fetch = async () => jsonResponse({}, 503, { 'retry-after': '0' })

  const report = await collectCitationReport(
    [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }],
    { delayBetweenPapersMs: 0 }
  )

  assert.equal(report.rows[0]?.citationCountEstimate, null)
  assert.equal(report.rows[0]?.semanticScholar.ok, false)
  assert.equal(report.rows[0]?.openAlex.ok, false)
})

test('starts both provider requests before either gated request is released', async () => {
  let firstRequestTimedOut = false
  let releasedBySecondRequest = false
  let releaseFirstRequest!: (response: Response) => void
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const firstRequest = new Promise<Response>((resolve, reject) => {
    releaseFirstRequest = resolve
    timeoutHandle = setTimeout(() => {
      firstRequestTimedOut = true
      reject(new Error('second provider request did not start'))
    }, 100)
  })

  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('semanticscholar')) return firstRequest

    if (!firstRequestTimedOut) releasedBySecondRequest = true
    clearTimeout(timeoutHandle)
    timeoutHandle = undefined
    releaseFirstRequest(jsonResponse({ citationCount: 7 }))
    return jsonResponse({ cited_by_count: 11 })
  }

  const report = await collectCitationReport(
    [{ id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' }],
    { delayBetweenPapersMs: 0 }
  )

  assert.equal(releasedBySecondRequest, true)
  assert.equal(report.rows[0]?.citationCountEstimate, 11)
})

test('waits for the default delay between papers without real-time sleep', async () => {
  test.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    let secondPaperStarted = false
    globalThis.fetch = async (input) => {
      const url = String(input)
      if (url.includes('1706.03763')) secondPaperStarted = true
      return url.includes('semanticscholar')
        ? jsonResponse({ citationCount: 7 })
        : jsonResponse({ cited_by_count: 11 })
    }

    const collection = collectCitationReport([
      { id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' },
      { id: 'paper-two', title: 'Paper Two', arxivId: '1706.03763' }
    ])

    for (let i = 0; i < 10; i += 1) await Promise.resolve()
    test.mock.timers.tick(1_099)
    await Promise.resolve()
    assert.equal(secondPaperStarted, false)

    test.mock.timers.tick(1)
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(secondPaperStarted, true)
    const report = await collection

    assert.equal(report.rows.length, 2)
  } finally {
    test.mock.timers.reset()
  }
})
