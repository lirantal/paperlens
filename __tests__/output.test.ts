import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderCitationTable } from '../src/output.js'

const unsafeCellCharacter = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u

const assertStableSafeTable = (output: string, expectedLineCount: number): void => {
  const lines = output.split('\n')

  assert.equal(lines.length, expectedLineCount)
  assert.equal(new Set(lines.map((line) => line.length)).size, 1)
  assert.ok(lines.every((line) => !unsafeCellCharacter.test(line)))
}

test('renders a stable table with counts and unavailable values', () => {
  const report = {
    generatedAt: '2026-08-29T00:00:00.000Z',
    rows: [
      {
        paper: { id: 'paper-one', title: 'Paper One', arxivId: '1706.03762' },
        semanticScholar: { source: 'semanticScholar' as const, fetchedAt: 'now', ok: true as const, citationCount: 7 },
        openAlex: { source: 'openAlex' as const, fetchedAt: 'now', ok: true as const, citationCount: 11 },
        citationCountEstimate: 11
      },
      {
        paper: { id: 'paper-two', title: 'Paper Two', arxivId: '1810.04805' },
        semanticScholar: { source: 'semanticScholar' as const, fetchedAt: 'later', ok: false as const, error: 'HTTP 503' },
        openAlex: { source: 'openAlex' as const, fetchedAt: 'later', ok: false as const, error: 'timeout' },
        citationCountEstimate: null
      }
    ]
  }

  const output = renderCitationTable(report)

  assert.match(output, /Paper\s+\|/)
  assert.match(output, /arXiv ID/)
  assert.match(output, /Semantic Scholar/)
  assert.match(output, /OpenAlex/)
  assert.match(output, /Estimate/)
  assert.match(output, /Paper One/)
  assert.match(output, /Paper Two/)
  assert.match(output, /1706\.03762/)
  assert.match(output, /1810\.04805/)
  assert.match(output, /\| 7 /)
  assert.match(output, /\| 11 /)
  assert.equal((output.match(/unavailable/g) ?? []).length, 3)
  assert.doesNotMatch(output, /2026-08-29|HTTP 503|timeout|\u001b\[/)

  const lines = output.split('\n')
  assert.equal(lines.length, 6)
  assert.equal(new Set(lines.map((line) => line.length)).size, 1)
  assert.deepEqual(lines[1]?.split('|').slice(1, -1).map((cell) => cell.trim()), [
    'Paper', 'arXiv ID', 'Semantic Scholar', 'OpenAlex', 'Estimate'
  ])
  assert.ok(lines.every((line, index) => {
    const isBorder = index === 0 || index === 2 || index === 5
    return isBorder ? line.startsWith('+-') : line.split('|').length === 7
  }))

  assert.equal(output, renderCitationTable(JSON.parse(JSON.stringify(report))))
})

test('uses fixed-width pipe-separated rows for every report row', () => {
  const output = renderCitationTable({
    generatedAt: 'ignored',
    rows: [{
      paper: { id: 'paper', title: 'A longer paper title', arxivId: '1' },
      semanticScholar: { source: 'semanticScholar', fetchedAt: 'ignored', ok: true, citationCount: 3 },
      openAlex: { source: 'openAlex', fetchedAt: 'ignored', ok: false, error: 'ignored' },
      citationCountEstimate: 3
    }]
  })
  const lines = output.split('\n')

  assert.equal(lines.length, 5)
  assert.equal(new Set(lines.map((line) => line.length)).size, 1)
  assert.ok(lines[1]?.startsWith('| ') && lines[1]?.endsWith(' |'))
  assert.ok(lines[3]?.startsWith('| ') && lines[3]?.endsWith(' |'))
  assert.ok(lines[0]?.startsWith('+-'))
  assert.ok(lines[4]?.startsWith('+-'))
})

test('sanitizes delimiters, C0 controls, and ANSI-like escapes in paper titles', () => {
  const output = renderCitationTable({
    generatedAt: 'ignored',
    rows: [{
      paper: {
        id: 'paper',
        title: 'Title|with\r\nline\rbreak\tand\bmore\f\u001b[31mred\u001b[0m',
        arxivId: '1'
      },
      semanticScholar: { source: 'semanticScholar', fetchedAt: 'ignored', ok: true, citationCount: 3 },
      openAlex: { source: 'openAlex', fetchedAt: 'ignored', ok: true, citationCount: 4 },
      citationCountEstimate: 4
    }]
  })

  assertStableSafeTable(output, 5)
  assert.match(output, /Title¦with  line break and more  \[31mred \[0m/)
  assert.doesNotMatch(output, /Title\|with/)
})

test('sanitizes C1 controls and Unicode line separators in direct report input', () => {
  const output = renderCitationTable({
    generatedAt: 'ignored',
    rows: [{
      paper: {
        id: 'paper',
        title: 'Direct\u0085title\u009bvalue\u2028next\u2029last',
        arxivId: '1706|\u0085\u009b\u2028\u2029.03762'
      },
      semanticScholar: { source: 'semanticScholar', fetchedAt: 'ignored', ok: true, citationCount: 3 },
      openAlex: { source: 'openAlex', fetchedAt: 'ignored', ok: true, citationCount: 4 },
      citationCountEstimate: 4
    }]
  })

  assertStableSafeTable(output, 5)
  assert.match(output, /Direct title value next last/)
  assert.match(output, /1706¦    \.03762/)
  assert.equal(output.split('\n')[3]?.split('|').length, 7)
})
