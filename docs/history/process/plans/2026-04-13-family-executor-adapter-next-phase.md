# Family Executor Adapter Next Phase Implementation Plan

Owner: `One Person Lab`
Purpose: `historical_family_executor_adapter_followup_plan`
State: `historical_archive`
Machine boundary: 本文是人读 historical implementation plan。机器 truth 继续归当前 stage-level executor policy、contracts、source、CLI/API 行为、runtime ledger、provider receipt 和 explicit executor adapter receipts。
Date: `2026-04-13`

> Historical plan：本文记录 family executor adapter 下一阶段计划。当前默认 executor 是 `Codex CLI`；`hermes_agent`、`claude_code`、`antigravity_cli` 等只作为显式非默认 executor adapter/backend，以 receipt/audit/fail-closed 证明连接。

> **Historical worker instruction:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把家族统一执行器从“参考文档口径”推进成稳定的 contract-first 现实，并收掉 RedCube 吸收前后仍会继续制造第二真相的文档漂移。

**Historical architecture:** `OPL` 当时继续只持有顶层 gateway / federation / contract 语言，不接管 domain runtime owner。当时先把 family 默认执行器与 guardrail 固化成 machine-readable contract，同时同步 OPL / MDS 的根级 truth；RedCube 仍保持单独 gated absorb lane，`Hermes-native` proof 继续后置，不和当时默认主线混写。

**Tech Stack:** repo-tracked Markdown docs, JSON contracts, Node.js contract tests, Python doc-only sync

---

### Task 1: OPL Central Truth Refresh

**Files:**
- Modify: `docs/status.md`
- Modify: `docs/references/family-executor-adapter-defaults.md`
- Modify: `docs/history/process/convergence-governance/four-repo-executor-follow-up-and-hermes-evaluation-2026-04.md`

- [ ] 把已经完成的 `MedAutoGrant` critique truth、`MedDeepScientist` inherit-local-default truth 从“待完成”移出
- [ ] 明确当前仍未完成的是 `RedCube AI` 主 checkout 吸收、central reference sync 与 `Hermes-native` proof lane
- [ ] 在 `docs/status.md` 中把 family executor-adapter default 同时挂到 reference doc 与 machine-readable contract
- [ ] 运行 `scripts/verify.sh meta`

### Task 2: Materialize The Family Executor Contract

**Files:**
- Create: `contracts/opl-framework/family-executor-adapter-defaults.json`
- Modify: `contracts/opl-framework/README.md`
- Modify: `contracts/opl-framework/README.zh-CN.md`
- Modify: `contracts/opl-framework/public-surface-index.json`
- Modify: `tests/src/opl-domain-onboarding-execution-model-alignment.test.ts`

- [ ] 新增 family-level machine-readable contract，冻结 `default_executor / default_model / default_reasoning_effort` 与三条 non-default route label
- [ ] 让 contract README 与 public-surface-index 都能发现这个 surface
- [ ] 补测试，断言新 contract 与 `domain-onboarding-readiness.schema.json` 的 execution-model constants 保持一致
- [ ] 运行 `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/opl-domain-onboarding-execution-model-alignment.test.ts`

### Task 3: Sync MDS Root Truth

**Files:**
- Modify: `/Users/gaofeng/workspace/med-deepscientist/docs/status.md`
- Modify: `/Users/gaofeng/workspace/med-deepscientist/docs/architecture.md`

- [ ] 在 `docs/status.md` 明确 `CodexRunner -> codex exec autonomous agent loop` 才是最底层 AI 执行路径
- [ ] 在 `docs/status.md` 明确默认 `model / reasoning` 继承本机 Codex 默认，不再把 repo-local pin 写成 family truth
- [ ] 在 `docs/architecture.md` 补上 runner / command 装配层的边界，避免把 daemon API 与真实执行器断开
- [ ] 运行 `uv run pytest tests/test_codex_runner.py tests/test_config_testing.py tests/test_runner_runtime_overrides.py tests/test_daemon_api.py::test_run_create_allows_explicit_none_reasoning_effort tests/test_init_and_quest.py::test_init_creates_required_files -q`

### Task 4: RedCube Safe Absorb Lane

**Files:**
- External dependency lane; no repo-local implementation in this batch

- [ ] 等 `redcube-ai` 主 checkout 上的重叠本地改动被吸收或转移
- [ ] 吸收已经完成的 `Codex CLI autonomous` 默认执行器提交
- [ ] 同步 `README*`、`docs/status.md`、`docs/architecture.md` 与 `contracts/runtime-program/current-program.json`
- [ ] 运行 RedCube 自身验证，再回写 `OPL` central reference sync surface

### Task 5: Hermes-Native Proof Lane

**Files:**
- Future tranche after RedCube absorb

- [ ] 只允许基于真实 `Hermes AIAgent` full agent loop 或等价 `/v1/runs` surface 开 proof
- [ ] 不允许 `chat relay`、单次 `chat_completions`、或 repo-local prompt relay 冒充 `Hermes-native`
- [ ] 单独记录 provider / reasoning / skill / browser / delegation 能力差异，不把“可配置”写成“已等价”
- [ ] proof 通过前，不改 family 默认执行器
