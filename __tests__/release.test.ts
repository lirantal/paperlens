import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rm, symlink, writeFile, mkdir, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../', import.meta.url))

test('release version script generates a formatted changelog without publishing or credentials', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'paperlens-release-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest))
  await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir')
  await copyFile(path.join(root, '.prettierrc.json'), path.join(directory, '.prettierrc.json'))
  await copyFile(path.join(root, 'pnpm-workspace.yaml'), path.join(directory, 'pnpm-workspace.yaml'))
  await mkdir(path.join(directory, '.changeset'))
  const config = JSON.parse(await readFile(path.join(root, '.changeset/config.json'), 'utf8'))
  // Replace only remote changelog lookups; run the real version script and formatter.
  config.changelog = ['../changelog.cjs', {}]
  await writeFile(path.join(directory, '.changeset/config.json'), JSON.stringify(config))
  await writeFile(path.join(directory, 'changelog.cjs'), 'module.exports = { getReleaseLine: async () => "A release smoke check.", getDependencyReleaseLine: async () => "" }\n')
  await writeFile(path.join(directory, '.changeset/smoke.md'), `---\n"${manifest.name}": patch\n---\n\nA release smoke check.\n`)
  // The version step needs no GitHub/npm credentials and must never publish.
  const environment = { ...process.env }
  delete environment.GITHUB_TOKEN
  delete environment.NPM_TOKEN
  const result = spawnSync('pnpm', ['run', 'version'], {
    cwd: directory, env: environment, encoding: 'utf8', timeout: 30_000
  })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const versioned = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
  const [major, minor, patch] = manifest.version.split('.').map(Number)
  assert.equal(versioned.version, `${major}.${minor}.${patch + 1}`)
  const changelog = await readFile(path.join(directory, 'CHANGELOG.md'), 'utf8')
  assert.match(changelog, /A release smoke check\./)
  assert.ok(changelog.includes(`## ${versioned.version}`))
  assert.deepEqual(await readdir(path.join(directory, '.changeset')), ['config.json'])
  const formatted = spawnSync('pnpm', ['exec', 'prettier', '--check', 'CHANGELOG.md'], {
    cwd: directory, env: environment, encoding: 'utf8', timeout: 30_000
  })
  assert.equal(formatted.status, 0, formatted.stdout + formatted.stderr)
  assert.equal(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version, manifest.version)
})
