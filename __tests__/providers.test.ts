import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { fetchOpenAlexCitations } from '../src/providers/openAlex.js'
import { fetchSemanticScholarCitations } from '../src/providers/semanticScholar.js'

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const originalRandom = Math.random

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })

afterEach(() => {
  globalThis.fetch = originalFetch
  globalThis.setTimeout = originalSetTimeout
  Math.random = originalRandom
})

test('maps Semantic Scholar citationCount', async () => {
  globalThis.fetch = async () => jsonResponse({ citationCount: 7 })

  const result = await fetchSemanticScholarCitations('1706.03762')

  assert.equal(result.ok && result.citationCount, 7)
})

test('maps OpenAlex cited_by_count from an arXiv landing-page lookup', async () => {
  const requests: URL[] = []
  globalThis.fetch = async (input) => {
    requests.push(new URL(String(input)))
    return jsonResponse({ results: [{ cited_by_count: 11 }] })
  }

  const result = await fetchOpenAlexCitations('1706.03762')

  assert.equal(result.ok && result.citationCount, 11)
  assert.equal(requests.length, 1)
  assert.equal(requests[0]?.pathname, '/works')
  assert.equal(
    requests[0]?.searchParams.get('filter'),
    'locations.landing_page_url:http://arxiv.org/abs/1706.03762'
  )
  assert.equal(requests[0]?.searchParams.get('per-page'), '1')
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

test('returns non-throwing errors when timed-out requests abort', async () => {
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    const signal = init?.signal
    assert.ok(signal instanceof AbortSignal)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

  const [semanticScholarResult, openAlexResult] = await Promise.all([
    fetchSemanticScholarCitations('1706.03762', { requestTimeoutMs: 1 }),
    fetchOpenAlexCitations('1706.03762', { requestTimeoutMs: 1 })
  ])

  assert.equal(semanticScholarResult.ok, false)
  assert.equal(openAlexResult.ok, false)
})

test('caps numeric Retry-After delays without waiting for the cap', async () => {
  const delays: number[] = []
  globalThis.setTimeout = ((callback, delay, ...args) => {
    delays.push(Number(delay))
    queueMicrotask(() => callback(...args))
    return {} as ReturnType<typeof setTimeout>
  }) as typeof setTimeout

  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return requests === 1
      ? jsonResponse({}, 429, { 'retry-after': '3600' })
      : jsonResponse({ citationCount: 13 })
  }

  const result = await fetchSemanticScholarCitations('1706.03762')

  assert.equal(result.ok && result.citationCount, 13)
  assert.deepEqual(delays, [4_000])
})

test('uses extended exponential backoff when Semantic Scholar omits Retry-After', async () => {
  const delays: number[] = []
  globalThis.setTimeout = ((callback, delay, ...args) => {
    delays.push(Number(delay))
    queueMicrotask(() => callback(...args))
    return {} as ReturnType<typeof setTimeout>
  }) as typeof setTimeout
  Math.random = () => 1

  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return requests === 6 ? jsonResponse({ citationCount: 13 }) : jsonResponse({}, 429)
  }

  const result = await fetchSemanticScholarCitations('1706.03762')

  assert.equal(result.ok && result.citationCount, 13)
  assert.equal(requests, 6)
  assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000, 16_000])
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

test('retries Semantic Scholar after a server error response', async () => {
  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return requests === 1
      ? jsonResponse({}, 503, { 'retry-after': '0' })
      : jsonResponse({ citationCount: 17 })
  }

  const result = await fetchSemanticScholarCitations('1706.03762')

  assert.equal(result.ok && result.citationCount, 17)
  assert.equal(requests, 2)
})

test('returns a Semantic Scholar error after the bounded retry count', async () => {
  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return jsonResponse({}, 503, { 'retry-after': '0' })
  }

  const result = await fetchSemanticScholarCitations('1706.03762')

  assert.equal(result.ok, false)
  assert.equal(requests, 6)
  if (!result.ok) assert.match(result.error, /503/)
})

test('sends optional provider API credentials in their documented locations', async () => {
  const requests: Array<{ url: URL, headers: Headers }> = []
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input)), headers: new Headers(init?.headers) })
    return String(input).includes('semanticscholar')
      ? jsonResponse({ citationCount: 7 })
      : jsonResponse({ results: [{ cited_by_count: 11 }] })
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
