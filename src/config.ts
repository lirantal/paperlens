import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Paper, PaperlensConfig } from './types.js'

const paperKeys = new Set(['id', 'title', 'arxivId'])
const configKeys = new Set(['papers'])
const arxivIdPattern = /^\d{4}\.\d{4,5}$/

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validationError (configPath: string, message: string): Error {
  return new Error(`Config validation failed at ${configPath}: ${message}`)
}

function validatePaper (value: unknown, index: number, configPath: string): Paper {
  if (!isRecord(value)) {
    throw validationError(configPath, `papers[${index}] must be an object`)
  }

  const unknownKey = Object.keys(value).find((key) => !paperKeys.has(key))
  if (unknownKey !== undefined) {
    throw validationError(configPath, `papers[${index}] has unknown field ${unknownKey}`)
  }

  for (const key of paperKeys) {
    if (!(key in value)) {
      throw validationError(configPath, `papers[${index}] is missing ${key}`)
    }
    if (typeof value[key] !== 'string' || value[key].trim() === '') {
      throw validationError(configPath, `papers[${index}].${key} must be a non-empty string`)
    }
  }

  const paper = value as unknown as Paper
  if (!arxivIdPattern.test(paper.arxivId)) {
    throw validationError(configPath, `papers[${index}].arxivId must match YYYY.NNNN or YYYY.NNNNN`)
  }

  return paper
}

function validateConfig (value: unknown, configPath: string): PaperlensConfig {
  if (!isRecord(value)) {
    throw validationError(configPath, 'root must be an object')
  }

  const unknownKey = Object.keys(value).find((key) => !configKeys.has(key))
  if (unknownKey !== undefined) {
    throw validationError(configPath, `unknown root field ${unknownKey}`)
  }

  if (!Array.isArray(value.papers)) {
    throw validationError(configPath, 'papers must be an array')
  }
  if (value.papers.length === 0) {
    throw validationError(configPath, 'papers must be non-empty')
  }

  const papers = value.papers.map((paper, index) => validatePaper(paper, index, configPath))
  const ids = new Set<string>()
  for (const paper of papers) {
    if (ids.has(paper.id)) {
      throw validationError(configPath, `paper IDs must be unique; duplicate id ${paper.id}`)
    }
    ids.add(paper.id)
  }

  return { papers }
}

export async function loadPaperlensConfig (configPath?: string): Promise<PaperlensConfig> {
  const resolvedPath = path.resolve(configPath ?? path.resolve(process.cwd(), 'paperlens.json'))
  let contents: string

  try {
    contents = await readFile(resolvedPath, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not read config at ${resolvedPath}: ${message}`, { cause: error })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(contents) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Config at ${resolvedPath} is not valid JSON: ${message}`, { cause: error })
  }

  return validateConfig(parsed, resolvedPath)
}
