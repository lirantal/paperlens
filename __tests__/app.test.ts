import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  collectCitationReport,
  loadPaperlensConfig,
  renderCitationTable
} from '../src/main.js'

test('exports the citation MVP library API', () => {
  assert.equal(typeof loadPaperlensConfig, 'function')
  assert.equal(typeof collectCitationReport, 'function')
  assert.equal(typeof renderCitationTable, 'function')
})