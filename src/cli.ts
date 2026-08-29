import { parseArgs } from 'node:util'
import { collectCitationReport } from './collect.js'
import { loadPaperlensConfig } from './config.js'
import { renderCitationTable } from './output.js'
import type { ProviderCitationResult } from './types.js'

const usage = `Usage: paperlens [--config <path>]

Options:
  -c, --config <path>  Read papers from a config file
  -h, --help           Show this help message`

export interface CliIo {
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export async function runCli (
  args: readonly string[],
  io: CliIo = { stdout: console.log, stderr: console.error }
): Promise<number> {
  let values: { config?: string, help?: boolean }

  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        config: { type: 'string', short: 'c' },
        help: { type: 'boolean', short: 'h' }
      },
      strict: true,
      allowPositionals: false
    }))
  } catch (error) {
    io.stderr(`paperlens: ${errorMessage(error)}`)
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
    io.stdout(renderCitationTable(report))
    for (const row of report.rows) {
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
