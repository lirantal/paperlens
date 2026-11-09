import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createReportDocument, serializeReportDocument, renderCitationMarkdown } from '../src/main.js'
import type { CitationReport } from '../src/types.js'

const generatedAt = '2026-11-09T00:00:00.000Z'
const report: CitationReport = {
  generatedAt,
  rows: [{
    paper: { id: 'one', title: 'Paper One', arxivId: '1706.03762' },
    semanticScholar: { source: 'semanticScholar', fetchedAt: generatedAt, ok: true, citationCount: 0 },
    openAlex: { source: 'openAlex', fetchedAt: generatedAt, ok: false, error: 'OpenAlex request failed with HTTP 503' },
    citationCountEstimate: 0
  }, {
    paper: { id: 'two', title: 'Paper Two', arxivId: '1810.04805' },
    semanticScholar: { source: 'semanticScholar', fetchedAt: generatedAt, ok: false, error: 'failed https://example.com/?api_key=secret' },
    openAlex: { source: 'openAlex', fetchedAt: generatedAt, ok: false, error: 'Bearer secret' },
    citationCountEstimate: null
  }]
}

test('exports a versioned independent document retaining zero and unavailable outcomes', () => {
  const original = structuredClone(report)
  const document = createReportDocument(report)
  assert.equal(document.schemaVersion, 1)
  assert.equal(document.generatedAt, generatedAt)
  assert.equal(document.rows[0]?.citationCountEstimate, 0)
  assert.equal(document.rows[1]?.citationCountEstimate, null)
  assert.deepEqual(document.rows[0], report.rows[0])
  assert.notEqual(document.rows[0]?.paper, report.rows[0]?.paper)
  assert.deepEqual(report, original)
  assert.equal('schemaVersion' in report, false)
  assert.deepEqual(JSON.parse(serializeReportDocument(document)), document)
  assert.doesNotMatch(serializeReportDocument(document), /secret|example\.com|Bearer/)
  assert.match(serializeReportDocument(document), /HTTP 503/)
})

test('strips extra fields and only retains recognized public diagnostics', () => {
  const input = structuredClone(report)
  Object.assign(input.rows[0]!.paper, { apiKey: 'secret' })
  Object.assign(input.rows[0]!.semanticScholar, { headers: { authorization: 'secret' } })
  input.rows[1]!.openAlex = { source: 'openAlex', fetchedAt: generatedAt, ok: false, error: 'OpenAlex response did not include a numeric cited_by_count' }
  input.rows[1]!.semanticScholar = { source: 'semanticScholar', fetchedAt: generatedAt, ok: false, error: 'Semantic Scholar response did not include a numeric citationCount' }
  const json = serializeReportDocument(createReportDocument(input))
  assert.doesNotMatch(json, /secret|apiKey|authorization|headers/)
  assert.match(json, /numeric cited_by_count/)
  assert.match(json, /numeric citationCount/)
})

test('renders portable Markdown escaping HTML, links, delimiters and line breaks', () => {
  const input = structuredClone(report)
  input.rows[0]!.paper.title = '<img src=x> & [link](javascript:alert(1)) | `*title*` \\\n\u001b\u0085\u2028'
  const output = renderCitationMarkdown(createReportDocument(input))
  assert.match(output, /Generated at: 2026-11-09/)
  assert.match(output, /\| --- \| --- \| --- \| --- \| --- \|/)
  assert.match(output, /&lt;img src=x&gt; &amp;/)
  assert.ok(output.includes('\\[link\\]\\(javascript:alert\\(1\\)\\) \\|'))
  assert.ok(output.includes('\\`\\*title\\*\\`'))
  assert.doesNotMatch(output, /<img|\u001b|\u0085|\u2028|secret/)
  assert.equal(output.split('\n').length, 6)
  assert.match(output, /\| 0 \| unavailable \| 0 \|/)
  assert.match(output, /\| unavailable \| unavailable \| unavailable \|/)
  assert.equal(renderCitationMarkdown({ generatedAt, rows: [] }).split('\n').length, 4)
})

test('ships a versioned schema requiring paper identity and per-provider outcomes', async () => {
  const schema = JSON.parse(await readFile(new URL('../schemas/citation-report-v1.json', import.meta.url), 'utf8'))
  assert.equal(schema.properties.schemaVersion.const, 1)
  assert.deepEqual(schema.required, ['schemaVersion', 'generatedAt', 'rows'])
  assert.deepEqual(schema.properties.rows.items.required, ['paper', 'semanticScholar', 'openAlex', 'citationCountEstimate'])
})
