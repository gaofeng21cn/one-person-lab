import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, mkdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { policy, writeWithReleaseNoteFallback, runCopilotReleaseNotes } from '../scripts/release-note-writer/writer.mjs'

const options = { copilotToken: 'copilot-test-key', apiKey: 'gateway-test-key' }
const accept = (content) => {
  const parsed = JSON.parse(content)
  if (!parsed.overview) throw Error('invalid_product_copy')
  return parsed
}
const mechanical = () => ({ overview: 'Recorded changes only.' })
const valid = JSON.stringify({ overview: 'Drafts are preserved.' })

test('each valid writer stops the chain; invalid product copy advances in policy order', async () => {
  for (const winner of policy.providers.map((p) => p.id)) {
    const called = []
    const result = await writeWithReleaseNoteFallback('Public Git evidence', accept, mechanical, {
      ...options,
      copilot: async () => { called.push(policy.providers[0].id); return winner === policy.providers[0].id ? valid : '{}'; },
      request: async (url, init) => {
        assert.equal(url, policy.gateway_endpoint)
        assert.ok(init.signal instanceof AbortSignal)
        const body = JSON.parse(init.body)
        assert.equal(body.reasoning_effort, policy.reasoning_effort)
        called.push(body.model)
        return Response.json({ choices: [{ finish_reason: 'stop', message: { content: winner === body.model ? valid : '{}' } }] })
      },
    })
    assert.equal(result.writer.model, winner)
    assert.deepEqual(called, policy.providers.map((p) => p.id).slice(0, policy.providers.findIndex((p) => p.id === winner) + 1))
    assert.match(result.writer.policy.policy_sha256, /^sha256:[a-f0-9]{64}$/)
  }
})

test('quota, HTTP errors, incomplete output, malformed JSON and secret-bearing output reach mechanical copy', async () => {
  for (const request of [
    async () => { throw Error(options.apiKey) },
    async () => new Response('', { status: 429 }),
    async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: valid } }] }),
    async () => Response.json({ choices: [{ message: { content: 'not JSON' } }] }),
    async () => Response.json({ choices: [{ message: { content: JSON.stringify({ overview: options.apiKey }) } }] }),
  ]) {
    const result = await writeWithReleaseNoteFallback('Evidence', accept, mechanical, {
      ...options, copilot: async () => { throw Error(options.copilotToken) }, request,
    })
    assert.equal(result.writer.mode, 'mechanical')
    assert.deepEqual(result.value, mechanical())
    assert.deepEqual(result.writer.attempts.map((p) => p.provider), policy.providers.map((p) => p.id))
    assert.ok(!JSON.stringify(result).includes(options.apiKey))
    assert.ok(!JSON.stringify(result).includes(options.copilotToken))
  }
})

test('changing the single policy changes real routing without editing consumer code', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'opl-writer-policy-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'writer.mjs'), await readFile(new URL('../scripts/release-note-writer/writer.mjs', import.meta.url)))
  await writeFile(join(root, 'policy.json'), JSON.stringify({ ...policy,
    providers: [{ id: 'test-central-model', type: 'gateway', model: 'test-central-model' }] }))
  const shared = await import(pathToFileURL(join(root, 'writer.mjs')).href)
  const result = await shared.writeWithReleaseNoteFallback('Evidence', accept, mechanical, {
    ...options, copilot: async () => assert.fail('Central policy removed Copilot'),
    request: async (_url, init) => {
      assert.equal(JSON.parse(init.body).model, 'test-central-model')
      return Response.json({ choices: [{ message: { content: valid } }] })
    },
  })
  assert.equal(result.writer.model, 'test-central-model')
})

test('Copilot uses an isolated directory, denied tools and only its own provider credential', { skip: process.platform === 'win32' }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'opl-copilot-env-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = join(root, 'bin')
  await mkdir(bin)
  await writeFile(join(bin, 'copilot'), `#!${process.execPath}\nconsole.log(JSON.stringify({cwd:process.cwd(),home:require('node:fs').realpathSync(process.env.HOME),gateway:process.env.OPL_RELEASE_NOTES_CODEX_API_KEY,other:process.env.GH_TOKEN,token:!!process.env.GITHUB_TOKEN,args:process.argv.slice(2)}))\n`, { mode: 0o700 })
  const old = { PATH: process.env.PATH, GH_TOKEN: process.env.GH_TOKEN, OPL_RELEASE_NOTES_CODEX_API_KEY: process.env.OPL_RELEASE_NOTES_CODEX_API_KEY }
  t.after(() => { for (const [key, value] of Object.entries(old)) value === undefined ? delete process.env[key] : process.env[key] = value })
  process.env.PATH = bin + ':' + process.env.PATH
  process.env.GH_TOKEN = 'unrelated-test-secret'
  process.env.OPL_RELEASE_NOTES_CODEX_API_KEY = options.apiKey
  const result = JSON.parse(await runCopilotReleaseNotes('Evidence', options.copilotToken))
  assert.equal(result.home, result.cwd)
  assert.notEqual(result.cwd, process.cwd())
  assert.equal(result.gateway, undefined)
  assert.equal(result.other, undefined)
  assert.equal(result.token, true)
  for (const arg of ['--deny-tool=shell', '--deny-tool=write', '--deny-tool=url', '--disable-builtin-mcps', '--no-custom-instructions']) assert.ok(result.args.includes(arg))
  await assert.rejects(access(result.cwd))
})
