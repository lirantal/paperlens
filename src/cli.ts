import { parseArgs } from 'node:util'
import { collectCitationReport } from './collect.js'
import { loadPaperlensConfig } from './config.js'
import { createReportDocument, serializeReportDocument } from './report.js'
import { renderCitationMarkdown, renderCitationTable } from './output.js'
import type { ProviderCitationResult } from './types.js'

const usage = `Usage: paperlens [--config <path>] [--json | --markdown]

Options:
  -c, --config <path>  Read papers from a config file
      --json           Print a versioned JSON report
      --markdown       Print a Markdown report
  -h, --help           Show this help message`

export interface CliIo {
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export async function runCli (
  args: readonly string[],
  io: CliIo = { stdout: console.log, stderr: console.error }
): Promise<number> {
  let values: { config?: string, help?: boolean, json?: boolean, markdown?: boolean }

  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        config: { type: 'string', short: 'c' },
        help: { type: 'boolean', short: 'h' },
        json: { type: 'boolean' },
        markdown: { type: 'boolean' }
      },
      strict: true,
      allowPositionals: false
    }))
  } catch (error) {
    io.stderr(`paperlens: ${errorMessage(error)}`)
    return 1
  }

  if (values.json && values.markdown) {
    io.stderr('paperlens: --json and --markdown are mutually exclusive')
    return 1
  }

  if (values.help) {
    io.stdout(usage)
    return 0
  }

  try {
    const config = await loadPaperlensConfig(values.config)
    const report = await collectCitationReport(config.papers, {
      semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY,
      openAlexApiKey: process.env.OPENALEX_API_KEY,
      openAlexMailto: process.env.OPENALEX_MAILTO
    })
    const document = createReportDocument(report)
    io.stdout(values.json
      ? serializeReportDocument(document)
      : values.markdown ? renderCitationMarkdown(document) : renderCitationTable(document))
    for (const row of document.rows) {
      warnIfUnavailable(row.semanticScholar, io)
      warnIfUnavailable(row.openAlex, io)
    }
    return 0
  } catch (error) {
    io.stderr(`paperlens: ${errorMessage(error)}`)
    return 1
  }
}

function warnIfUnavailable (result: ProviderCitationResult, io: CliIo): void {
  if (!result.ok) io.stderr(`paperlens: ${result.source} unavailable: ${result.error}`)
}

function errorMessage (error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
