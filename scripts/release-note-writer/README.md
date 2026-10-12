# Shared release-note writer

This directory owns the prose provider policy and transport for OPL DSH and
One Person Lab App Stable/Nightly. It does not own product releases or qualification.

Edit **[policy.json](policy.json)** once to change provider order, Gateway endpoint,
reasoning effort, timeout, Copilot CLI version or credit budget. All three consumers
resolve Framework `main` once when preparing new notes and download this policy and
`writer.mjs` from that immutable commit. No consumer model list or CLI version needs
synchronization. Already frozen notes remain unchanged.

The current route is Copilot `auto`, Gateway `deepseek-flash`, Gateway `gpt-6-luna`,
then product mechanical copy. Transport errors, missing credentials, quota exhaustion,
incomplete responses, secret-bearing output and product validation errors advance to
the next provider. Missing or invalid shared source selects mechanical copy directly.
A failed optional CLI installation still permits Gateway calls. Mechanical copy is
always supplied by the product and cannot be disabled in policy.

The dependency-free Node 24 module exports `writeWithReleaseNoteFallback(prompt,
accept, mechanical, options)`. `prompt` may be text or Chat Completions messages.
`accept(content, providerId)` validates the product format and fixed evidence; throwing
rejects the response. `mechanical()` supplies publishable deterministic copy. Options
may inject `copilotToken`, `apiKey`, `copilot` and `request` for verification.
Credentials otherwise come from `GITHUB_TOKEN` and `OPL_RELEASE_NOTES_CODEX_API_KEY`.
The Copilot subprocess receives only its token and an isolated home; it cannot see
the Gateway key, product checkout, tools, custom instructions or MCP servers.

Consumers keep only a small public-source downloader and product adapter. The
downloader sets `OPL_RELEASE_NOTES_WRITER_MODULE` and `OPL_RELEASE_NOTES_WRITER_SHA`
in the job environment; the writer receipt includes that commit and the policy
SHA-256. Shared files live in runner temporary storage and are not shipped in DSH
or App payloads. Each caller retains its own Secrets and minimum job permissions.
This is intentionally separate from the frozen product Framework cohort: a new notes
preparation picks up policy changes without upgrading the product runtime.

Run `node --test tests/release-note-writer.test.mjs` here. Product integration tests
can use `OPL_RELEASE_NOTES_WRITER_MODULE=/absolute/path/to/writer.mjs`; absent shared
source still exercises mechanical behavior. The two existing product writer-check
workflows additionally exercise real Copilot and Gateway writers without publishing.
