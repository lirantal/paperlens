import timers from 'node:timers/promises'
import type { CitationReport, CitationRow, CollectCitationOptions, Paper, ProviderCitationResult } from './types.js'
import { fetchOpenAlexCitations } from './providers/openAlex.js'
import { fetchSemanticScholarCitations } from './providers/semanticScholar.js'

export async function collectCitationReport (
  papers: readonly Paper[],
  options: CollectCitationOptions = {}
): Promise<CitationReport> {
  const rows: CitationRow[] = []

  for (const [index, paper] of papers.entries()) {
    const [semanticScholar, openAlex] = await Promise.all([
      fetchSemanticScholarCitations(paper.arxivId, {
        apiKey: options.semanticScholarApiKey,
        requestTimeoutMs: options.requestTimeoutMs
      }),
      fetchOpenAlexCitations(paper.arxivId, {
        apiKey: options.openAlexApiKey,
        mailto: options.openAlexMailto,
        requestTimeoutMs: options.requestTimeoutMs
      })
    ])

    rows.push({
      paper,
      semanticScholar,
      openAlex,
      citationCountEstimate: citationCountEstimate([semanticScholar, openAlex])
    })

    if (index < papers.length - 1) {
      await timers.setTimeout(options.delayBetweenPapersMs ?? 1_100)
    }
  }

  return { generatedAt: new Date().toISOString(), rows }
}

function citationCountEstimate (results: readonly ProviderCitationResult[]): number | null {
  const successfulCounts = results
    .filter((result): result is Extract<ProviderCitationResult, { ok: true }> => result.ok)
    .map(result => result.citationCount)

  return successfulCounts.length > 0 ? Math.max(...successfulCounts) : null
}
