import type { CitationReport, CitationReportDocument, ProviderCitationResult } from './types.js'

// Only diagnostics constructed by our adapters may cross the public report boundary.
// Arbitrary fetch/JSON errors can contain URLs, headers, or credentials.
function publicProviderResult (result: ProviderCitationResult): ProviderCitationResult {
  const base = { source: result.source, fetchedAt: result.fetchedAt }
  if (result.ok) return { ...base, ok: true, citationCount: result.citationCount }

  const prefix = result.source === 'openAlex' ? 'OpenAlex' : 'Semantic Scholar'
  const httpError = result.error.match(/^(OpenAlex|Semantic Scholar) request failed with HTTP ([1-5][0-9]{2})$/)
  const missingCount = result.source === 'openAlex'
    ? 'OpenAlex response did not include a numeric cited_by_count'
    : 'Semantic Scholar response did not include a numeric citationCount'
  const error = httpError?.[1] === prefix || result.error === missingCount
    ? result.error
    : `${prefix} request failed (network or invalid response)`
  return { ...base, ok: false, error }
}

/** Copy the public report fields without changing the collection result. */
export function createReportDocument (report: CitationReport): CitationReportDocument {
  return {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    rows: report.rows.map(row => ({
      paper: { id: row.paper.id, title: row.paper.title, arxivId: row.paper.arxivId },
      semanticScholar: publicProviderResult(row.semanticScholar),
      openAlex: publicProviderResult(row.openAlex),
      citationCountEstimate: row.citationCountEstimate
    }))
  }
}

export function serializeReportDocument (report: CitationReportDocument): string {
  return JSON.stringify(createReportDocument(report), null, 2)
}
