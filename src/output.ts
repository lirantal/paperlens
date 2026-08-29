import type { CitationReport, ProviderCitationResult } from './types.js'

const headers = ['Paper', 'arXiv ID', 'Semantic Scholar', 'OpenAlex', 'Estimate']
const unavailable = 'unavailable'

const sanitizeCell = (cell: string): string =>
  cell.replace(/\|/g, '¦').replace(/\r?\n|\r/g, ' ')

const providerCount = (result: ProviderCitationResult): string =>
  result.ok ? String(result.citationCount) : unavailable

const padRow = (cells: readonly string[], widths: readonly number[]): string =>
  `| ${cells.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join(' | ')} |`

const border = (widths: readonly number[]): string =>
  `+-${widths.map((width) => '-'.repeat(width)).join('-+-')}-+`

export function renderCitationTable(report: CitationReport): string {
  const rows = report.rows.map((row) => [
    sanitizeCell(row.paper.title),
    row.paper.arxivId,
    providerCount(row.semanticScholar),
    providerCount(row.openAlex),
    row.citationCountEstimate === null ? unavailable : String(row.citationCountEstimate)
  ])
  const allRows = [headers, ...rows]
  const widths = headers.map((_, column) =>
    Math.max(...allRows.map((row) => row[column]?.length ?? 0))
  )

  return [
    border(widths),
    padRow(headers, widths),
    border(widths),
    ...rows.map((row) => padRow(row, widths)),
    border(widths)
  ].join('\n')
}
