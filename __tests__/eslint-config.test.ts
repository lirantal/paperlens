import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ESLint } from 'eslint'

test('ESLint resolves emitted JavaScript paths to TypeScript source without allowing missing imports', async () => {
  const eslint = new ESLint()
  const options = { filePath: 'src/lint-config-probe.ts' }

  const [existing] = await eslint.lintText("import './config.js'\n", options)
  assert.ok(existing)
  assert.equal(existing.errorCount, 0)

  const [missing] = await eslint.lintText("import './nonexistent-lint-config-probe.js'\n", options)
  assert.ok(missing)
  assert.equal(missing.messages.filter(message => message.ruleId === 'n/no-missing-import' && message.severity === 2).length, 1)
})
