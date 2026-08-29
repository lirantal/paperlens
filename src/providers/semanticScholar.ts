import type { ProviderCitationResult } from '../types.js'

const source = 'semanticScholar'
const defaultRequestTimeoutMs = 10_000
const maxAttempts = 3
const maxRetryDelayMs = 4_000

type SemanticScholarOptions = {
  apiKey?: string
  requestTimeoutMs?: number
}

export async function fetchSemanticScholarCitations (
  arxivId: string,
  options: SemanticScholarOptions = {}
): Promise<ProviderCitationResult> {
  const url = new URL(`https://api.semanticscholar.org/graph/v1/paper/arXiv:${arxivId}`)
  url.searchParams.set('fields', 'citationCount')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.apiKey) headers['x-api-key'] = options.apiKey

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(options.requestTimeoutMs ?? defaultRequestTimeoutMs)
      })

      if (!response.ok) {
        if (attempt < maxAttempts - 1 && isRetryableStatus(response.status)) {
          await wait(retryDelayMs(response.headers.get('retry-after'), attempt))
          continue
        }

        return failure(`Semantic Scholar request failed with HTTP ${response.status}`)
      }

      const data = await response.json() as { citationCount?: unknown }
      if (typeof data.citationCount !== 'number') {
        return failure('Semantic Scholar response did not include a numeric citationCount')
      }

      return {
        source,
        fetchedAt: new Date().toISOString(),
        ok: true,
        citationCount: data.citationCount
      }
    } catch (error) {
      return failure(`Semantic Scholar request failed: ${errorMessage(error)}`)
    }
  }

  return failure('Semantic Scholar request failed after retry attempts')
}

function isRetryableStatus (status: number): boolean {
  return status === 429 || status >= 500
}

function retryDelayMs (retryAfter: string | null, attempt: number): number {
  const seconds = Number(retryAfter)
  if (retryAfter !== null && Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
  return Math.min(1_000 * 2 ** attempt, maxRetryDelayMs)
}

function wait (delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}

function failure (error: string): ProviderCitationResult {
  return { source, fetchedAt: new Date().toISOString(), ok: false, error }
}

function errorMessage (error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
