/** Shared prose transport only. Products own evidence, acceptance and mechanical copy. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const execute = promisify(execFile)
const bytes = await readFile(new URL('./policy.json', import.meta.url))
export const policy = JSON.parse(bytes)
if (policy.schema !== 'opl_release_note_writer.v1' || !Array.isArray(policy.providers)
  || !policy.providers.length || policy.providers.some((p) => !/^[a-z0-9._-]+$/.test(p.id)
    || !['copilot', 'gateway'].includes(p.type) || typeof p.model !== 'string')
  || !Number.isInteger(policy.timeout_ms) || policy.timeout_ms < 1
  || !/^\d+\.\d+\.\d+$/.test(policy.copilot.version)
  || !Number.isInteger(policy.copilot.max_ai_credits)
  || new URL(policy.gateway_endpoint).protocol !== 'https:') throw Error('invalid_writer_policy')

function subprocessEnv() {
  const env = {}
  for (const name of ['PATH', 'SystemRoot', 'TEMP', 'TMP', 'LANG', 'NODE_EXTRA_CA_CERTS'])
    if (process.env[name]) env[name] = process.env[name]
  return env
}

export async function runCopilotReleaseNotes(prompt, token, model = 'auto') {
  const home = await mkdtemp(join(tmpdir(), 'opl-release-notes-'))
  try {
    const { stdout } = await execute('copilot', [
      '--model', model, '--prompt', prompt, '--silent',
      '--deny-tool=shell', '--deny-tool=write', '--deny-tool=url', '--available-tools=ask_user',
      '--disable-builtin-mcps', '--no-custom-instructions', '--no-ask-user', '--disallow-temp-dir',
      '--no-auto-update', '--no-remote', '--no-remote-export', '--log-level', 'none',
      '--max-ai-credits', String(policy.copilot.max_ai_credits),
    ], { cwd: home, env: { ...subprocessEnv(), HOME: home, XDG_CONFIG_HOME: home, GITHUB_TOKEN: token },
      timeout: policy.timeout_ms, maxBuffer: 128 * 1024, killSignal: 'SIGKILL' })
    return stdout.trim()
  } catch (error) {
    const diagnostic = String(error.stderr ?? '')
    const code = error.killed ? 'copilot_timeout'
      : /quota|rate.limit|credits.*exhaust|insufficient.*credits/i.test(diagnostic) ? 'copilot_quota'
      : /max.ai.credits|session.*limit|budget/i.test(diagnostic) ? 'copilot_session_budget'
      : /authenticat|sign.in|log.in|invalid.token|unauthorized|403/i.test(diagnostic) ? 'copilot_authentication'
      : error.code === 'ENOENT' ? 'copilot_not_installed' : 'copilot_transport_or_cli'
    throw Object.assign(new Error(code), { code })
  } finally { await rm(home, { recursive: true, force: true }) }
}

/** Missing CLI, transport failure and product validation failure all advance to the next writer. */
export async function writeWithReleaseNoteFallback(prompt, accept, mechanical, options = {}) {
  const token = options.copilotToken ?? process.env.GITHUB_TOKEN
  const apiKey = options.apiKey ?? process.env.OPL_RELEASE_NOTES_CODEX_API_KEY
  const attempts = []
  const provenance = { repository: 'gaofeng21cn/one-person-lab',
    source_commit: process.env.OPL_RELEASE_NOTES_WRITER_SHA ?? null,
    policy_sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex') }
  const messages = typeof prompt === 'string' ? [{ role: 'user', content: prompt }] : prompt
  for (const provider of policy.providers) {
    if (!(provider.type === 'copilot' ? token : apiKey)) continue
    try {
      let content
      if (provider.type === 'copilot') {
        const text = messages.map((m) => m.content).join('\n\n')
        content = await (options.copilot ?? runCopilotReleaseNotes)(text, token, provider.model)
      } else {
        const response = await (options.request ?? fetch)(policy.gateway_endpoint, {
          method: 'POST', headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({ model: provider.model, reasoning_effort: policy.reasoning_effort, messages }),
          signal: AbortSignal.timeout(policy.timeout_ms),
        })
        if (!response.ok) throw Error('provider_http_' + response.status)
        const choice = (await response.json()).choices?.[0]
        if (choice?.finish_reason && choice.finish_reason !== 'stop') throw Error('provider_incomplete')
        content = choice?.message?.content
      }
      if (typeof content !== 'string' || [token, apiKey].some((s) => s && content.includes(s)))
        throw Error('invalid_writer_response')
      const value = accept(content, provider.id)
      attempts.push({ provider: provider.id, status: 'passed' })
      return { value, writer: { mode: 'online-ai', model: provider.id, attempts, policy: provenance } }
    } catch {
      // Never log model output, raw provider errors or credentials.
      attempts.push({ provider: provider.id, status: 'failed' })
    }
  }
  return { value: mechanical(), writer: { mode: 'mechanical', attempts,
    reason: 'providers_unavailable_or_invalid', policy: provenance } }
}

/** Optional bootstrap; an installation failure leaves Gateway and mechanical writers available. */
export async function prepareCopilot() {
  const home = await mkdtemp(join(tmpdir(), 'opl-writer-bootstrap-'))
  try {
    await execute('npm', ['install', '--global', '@github/copilot@' + policy.copilot.version], {
      env: { ...subprocessEnv(), HOME: home, XDG_CONFIG_HOME: home }, cwd: home,
      timeout: 120_000, maxBuffer: 128 * 1024, killSignal: 'SIGKILL',
    })
    console.log('Shared release-note Copilot CLI prepared.')
  } catch { console.log('Copilot CLI unavailable; Gateway and mechanical writers remain available.') }
  finally { await rm(home, { recursive: true, force: true }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === '--prepare')
  await prepareCopilot()
