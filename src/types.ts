export interface Paper {
  id: string
  title: string
  arxivId: string
}

export interface PaperlensConfig {
  papers: Paper[]
}

export type ProviderName = 'semanticScholar' | 'openAlex'

export type ProviderCitationResult =
  | { source: ProviderName, fetchedAt: string, ok: true, citationCount: number }
  | { source: ProviderName, fetchedAt: string, ok: false, error: string }

export interface CitationRow {
  paper: Paper
  semanticScholar: ProviderCitationResult
  openAlex: ProviderCitationResult
  citationCountEstimate: number | null
}

export interface CitationReport {
  generatedAt: string
  rows: CitationRow[]
}

export interface CollectCitationOptions {
  semanticScholarApiKey?: string
  openAlexApiKey?: string
  openAlexMailto?: string
  delayBetweenPapersMs?: number
  requestTimeoutMs?: number
}
