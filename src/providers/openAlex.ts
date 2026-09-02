import type { ProviderCitationResult } from '../types.js'

const source = 'openAlex'
const defaultRequestTimeoutMs = 10_000

type OpenAlexOptions = {
  apiKey?: string
  mailto?: string
  requestTimeoutMs?: number
}

export async function fetchOpenAlexCitations (
  arxivId: string,
  options: OpenAlexOptions = {}
): Promise<ProviderCitationResult> {
  const url = new URL('https://api.openalex.org/works')
  url.searchParams.set('filter', `locations.landing_page_url:http://arxiv.org/abs/${arxivId}`)
  url.searchParams.set('per-page', '1')
  if (options.apiKey) url.searchParams.set('api_key', options.apiKey)
  if (options.mailto) url.searchParams.set('mailto', options.mailto)

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(options.requestTimeoutMs ?? defaultRequestTimeoutMs)
    })
    if (!response.ok) return failure(`OpenAlex request failed with HTTP ${response.status}`)

    const data = await response.json() as { results?: Array<{ cited_by_count?: unknown }> }
    const work = data.results?.[0]
    if (typeof work?.cited_by_count !== 'number') {
      return failure('OpenAlex response did not include a numeric cited_by_count')
    }

    return {
      source,
      fetchedAt: new Date().toISOString(),
      ok: true,
      citationCount: work.cited_by_count
    }
  } catch (error) {
    return failure(`OpenAlex request failed: ${errorMessage(error)}`)
  }
}

function failure (error: string): ProviderCitationResult {
  return { source, fetchedAt: new Date().toISOString(), ok: false, error }
}

function errorMessage (error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
