import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { serializeReportDocument } from './report.js'
import type { CitationReportDocument } from './types.js'

export interface PersistedReportPaths {
  historyPath: string
  latestPath: string
}

const filesystemCodes = new Set(['EACCES', 'EPERM', 'ENOSPC', 'EIO', 'ENOTDIR', 'EEXIST', 'ENOENT', 'EROFS'])
const errorCode = (error: unknown): string => {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code && filesystemCodes.has(code) ? code : 'FILESYSTEM_ERROR'
}

/** Persist one complete snapshot, then replace latest. Coordinates local writers. */
export async function persistReportDocument (
  report: CitationReportDocument,
  outputDirectory: string
): Promise<PersistedReportPaths> {
  if (!outputDirectory.trim()) throw new Error('Report output directory must not be empty')
  const timestamp = new Date(report.generatedAt).toISOString().replace(/[:.]/g, '-')
  const json = `${serializeReportDocument(report)}\n`
  const directory = path.resolve(outputDirectory)
  const historyDirectory = path.join(directory, 'history')
  const latestPath = path.join(directory, 'latest.json')
  const lockPath = path.join(directory, '.paperlens.lock')
  let lock: Awaited<ReturnType<typeof fs.open>>
  try {
    await fs.mkdir(historyDirectory, { recursive: true })
  } catch (error) {
    // eslint-disable-next-line preserve-caught-error -- Do not expose raw filesystem paths or error text.
    throw new Error(`Could not prepare report output directory (${errorCode(error)})`)
  }
  try {
    lock = await fs.open(lockPath, 'wx')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      // eslint-disable-next-line preserve-caught-error -- Raw causes are intentionally excluded from public diagnostics.
      throw new Error('Report output directory is locked; confirm no writer is active before removing .paperlens.lock')
    }
    // eslint-disable-next-line preserve-caught-error -- Do not expose raw filesystem paths or error text.
    throw new Error(`Could not prepare report output directory (${errorCode(error)})`)
  }

  const temporaryFiles = new Set<string>()
  let historyPath: string | undefined
  let latestUpdated = false
  let failed = false
  let failure: unknown

  const writeTemporary = async (filename: string): Promise<void> => {
    const handle = await fs.open(filename, 'wx')
    temporaryFiles.add(filename)
    try {
      await handle.writeFile(json, 'utf8')
    } finally {
      await handle.close()
    }
  }
  const removeTemporary = async (filename: string): Promise<void> => {
    await fs.unlink(filename)
    temporaryFiles.delete(filename)
  }

  try {
    await lock.writeFile(`${process.pid}\n`, 'utf8')
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = path.join(historyDirectory, `${timestamp}-${crypto.randomUUID()}.json`)
      const temporary = `${candidate}.tmp`
      try {
        await writeTemporary(temporary)
        await fs.link(temporary, candidate)
        historyPath = candidate
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      } finally {
        if (temporaryFiles.has(temporary)) await removeTemporary(temporary)
      }
      if (historyPath) break
    }
    if (!historyPath) throw Object.assign(new Error('Snapshot filename collisions'), { code: 'EEXIST' })

    const temporaryLatest = path.join(directory, `.latest-${crypto.randomUUID()}.tmp`)
    await writeTemporary(temporaryLatest)
    await fs.rename(temporaryLatest, latestPath)
    temporaryFiles.delete(temporaryLatest)
    latestUpdated = true
  } catch (error) {
    failed = true
    failure = error
  } finally {
    // Attempt all cleanup even when an earlier cleanup operation fails.
    for (const filename of temporaryFiles) {
      try { await fs.unlink(filename) } catch (error) { failed = true; failure ??= error }
    }
    try { await lock.close() } catch (error) { failed = true; failure ??= error }
    try { await fs.unlink(lockPath) } catch (error) { failed = true; failure ??= error }
  }

  if (failed) {
    const state = latestUpdated
      ? 'Report saved, but cleanup failed; inspect the output directory'
      : historyPath
        ? 'History snapshot saved, but latest was not updated; previous latest is unchanged'
        : 'Report was not saved; previous latest is unchanged'
    throw new Error(`${state} (${errorCode(failure)})`)
  }
  return { historyPath: historyPath!, latestPath }
}
