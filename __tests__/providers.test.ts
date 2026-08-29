import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { fetchOpenAlexCitations } from '../src/providers/openAlex.js'
import { fetchSemanticScholarCitations } from '../src/providers/semanticScholar.js'

const originalFetch = globalThis.fetch

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('maps Semantic Scholar citationCount', async () => {
  globalThis.fetch = async () => jsonResponse({ citationCount: 7 })

  const result = await fetchSemanticScholarCitations('1706.03762')

  assert.equal(result.ok && result.citationCount, 7)
})

test('maps OpenAlex cited_by_count', async () => {
  globalThis.fetch = async () => jsonResponse({ cited_by_count: 11 })

  const result = await fetchOpenAlexCitations('1706.03762')

  assert.equal(result.ok && result.citationCount, 11)
})

test('returns non-throwing errors for non-OK provider responses', async () => {
  globalThis.fetch = async () => jsonResponse({}, 404)
  const semanticScholarResult = await fetchSemanticScholarCitations('1706.03762')

  globalThis.fetch = async () => jsonResponse({}, 503)
  const openAlexResult = await fetchOpenAlexCitations('1706.03762')

  assert.equal(semanticScholarResult.ok, false)
  assert.equal(openAlexResult.ok, false)
  if (!semanticScholarResult.ok) assert.match(semanticScholarResult.error, /404/)
  if (!openAlexResult.ok) assert.match(openAlexResult.error, /503/)
})

test('returns non-throwing errors for network failures', async () => {
  globalThis.fetch = async () => {
    throw new Error('network unavailable')
  }

  const [semanticScholarResult, openAlexResult] = await Promise.all([
    fetchSemanticScholarCitations('1706.03762'),
    fetchOpenAlexCitations('1706.03762')
  ])

  assert.equal(semanticScholarResult.ok, false)
  assert.equal(openAlexResult.ok, false)
  if (!semanticScholarResult.ok) assert.match(semanticScholarResult.error, /network unavailable/)
  if (!openAlexResult.ok) assert.match(openAlexResult.error, /network unavailable/)
})

test('passes a timeout signal to each provider request', async () => {
  const signals: AbortSignal[] = []
  globalThis.fetch = async (_input, init) => {
    assert.ok(init?.signal instanceof AbortSignal)
    signals.push(init.signal)
    return jsonResponse({ citationCount: 7, cited_by_count: 11 })
  }

  await fetchSemanticScholarCitations('1706.03762', { requestTimeoutMs: 25 })
  await fetchOpenAlexCitations('1706.03762', { requestTimeoutMs: 25 })

  assert.equal(signals.length, 2)
})

test('retries Semantic Scholar after a rate limit response', async () => {
  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return requests === 1
      ? jsonResponse({}, 429, { 'retry-after': '0' })
      : jsonResponse({ citationCount: 13 })
  }

  const result = await fetchSemanticScholarCitations('1706.03762')

  assert.equal(result.ok && result.citationCount, 13)
  assert.equal(requests, 2)
})

test('sends optional provider API credentials in their documented locations', async () => {
  const requests: Array<{ url: URL, headers: Headers }> = []
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input)), headers: new Headers(init?.headers) })
    return String(input).includes('semanticscholar')
      ? jsonResponse({ citationCount: 7 })
      : jsonResponse({ cited_by_count: 11 })
  }

  await fetchSemanticScholarCitations('1706.03762', { apiKey: 'semantic-key' })
  await fetchOpenAlexCitations('1706.03762', {
    apiKey: 'openalex-key',
    mailto: 'maintainer@example.com'
  })

  const [semanticScholarRequest, openAlexRequest] = requests
  assert.equal(semanticScholarRequest?.url.searchParams.get('fields'), 'citationCount')
  assert.equal(semanticScholarRequest?.headers.get('x-api-key'), 'semantic-key')
  assert.equal(openAlexRequest?.url.searchParams.get('api_key'), 'openalex-key')
  assert.equal(openAlexRequest?.url.searchParams.get('mailto'), 'maintainer@example.com')
})

test('returns a non-throwing error when a provider response is not JSON', async () => {
  globalThis.fetch = async () => new Response('not json')

  const result = await fetchOpenAlexCitations('1706.03762')

  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /json/i)
})
