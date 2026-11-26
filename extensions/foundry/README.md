# OPL Foundry (`opl-foundry`)

Official zero-dependency `opl.package.v2` extension providing dynamic `opl foundry` CLI workflows:

- `opl foundry init <dir> --id <id> [--intent <agent|app|extension|channel>]`: Scaffold a compliant `opl.package.v2` package (`opl-package.json`, `README.md`, `skills/<id>/SKILL.md`, and for agents `agent/stages.json` + `eval/suite.json`).
- `opl foundry validate <dir>`: Validate `opl-package.json` schema conformance, safe POSIX relative paths, declared entrypoints/skills, `ui` cross-references, forbidden `plugins/<name>/` source mirrors, `stages_ref`, `eval/suite.json`, and `opl-release.lock.json` integrity.
- `opl foundry eval <dir> [--suite <path>] [--state-dir <dir>]`: Run deterministic frozen-plan evaluation, emit a SHA-256 hash-chained `opl-foundry-run-event.v1` ledger and `EvidenceBundle` under `${OPL_STATE_DIR:-~/.opl/state}/foundry/` without mutating the target package directory.
- `opl foundry compare --baseline <dir> --candidate <dir> [--regression-tolerance <n>]`: Recompute blueprint risk tier (`low` / `medium` / `high`), enforce non-weakening evaluation policy invariants, and detect score regressions.
- `opl foundry promote <targetAgentId> --run-id <runId> [--expected-revision <n>] [--authority-receipt-ref <ref>]`: Atomically advance the activation pointer with CAS `expected_revision` and owner-gate enforcement on medium/high risk.
- `opl foundry rollback <targetAgentId> [--to-version <ver> | --version-digest <sha256:...>] --expected-revision <n> --authority-receipt-ref <ref>`: Atomically restore a prior immutable agent version under fail-closed CAS and owner authority checks.
