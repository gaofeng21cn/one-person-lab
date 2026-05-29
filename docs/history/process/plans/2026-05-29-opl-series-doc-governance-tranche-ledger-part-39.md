# OPL series docs governance tranche ledger part 39

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_39`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 shared domain contract、domain truth、quality/export verdict、artifact authority、owner receipt、standard domain-agent skeleton contract、family orchestration schema、runtime provider contract 或 production readiness oracle。当前 truth 回到 `docs/specs/shared-domain-contract.md`、`contracts/README.md`、核心五件套、active gap plan、contracts、source、tests、CLI/read-model、runtime ledger 和 domain-owned receipts。
Date: `2026-05-29`

## Scope

本轮处理 shared domain boundary 支撑文档与合同索引的 currentness drift：

- `docs/specs/shared-domain-contract.md`
- `contracts/README.md`
- process ledger index

目标是退役 `shared-domain-contract.md` 开头的固定 `2026-05-26` current-state anchor，把 Foundry Agent、MDS、Domain Gateway / Domain Harness OS 和 no-bypass 读法改成 live-reading policy；同时修正 `contracts/README.md` 中已经漂移的 `docs/active/shared-*-contract*.md` 路径，让合同目录索引指向当前 `docs/specs/` active support owner。

## Fresh Evidence

本轮 live evidence：

- 核心五件套和 active gap plan
  - 当前公开产品分层仍是 `OPL Framework -> One Person Lab App -> Foundry Agents`。
  - 当前 Foundry Agents 是 `MAS`、`MAG`、`RCA`；它们持有 domain truth、quality/export verdict、artifact authority、memory body 和 owner receipt。
  - `OPL Meta Agent` 是 Agent Foundry / new-agent builder/tester module，不持有 MAS/MAG/RCA 的 domain truth。
  - `MDS` 只作为 MAS 显式声明的 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 与 parity oracle reference 出现。
- `docs/specs/README.md`
  - 当前 active specs 列出 `shared-runtime-contract.md` 与 `shared-domain-contract.md`，均位于 `docs/specs/`。
  - 旧 Product API / ACP / frontdoor specs 不从本目录恢复。
- `docs/specs/shared-runtime-contract.md`
  - 已采用无固定日期的 currentness policy，并把历史日期校准和具体 counters 归到 `docs/history/**`。
  - Shared domain 文档应采用同类 live-reading 口径。
- `contracts/README.md`
  - 合同目录当前 machine-readable truth 归 `contracts/opl-framework/*.json` 和 `contracts/family-orchestration/*.schema.json`。
  - 该 README 仍把 shared runtime/domain 人读支撑路径写成 `docs/active/shared-*-contract*.md`，与当前 `docs/specs/` owner 不一致。
- `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`
  - Standard domain-agent skeleton 是当前 machine contract owner，而不是旧 Domain Gateway / Domain Harness OS。
- `contracts/family-orchestration/*.schema.json`
  - Family action graph、human gate、product-entry manifest v2、stage / route / checkpoint / owner-route 等 schema 是当前 shared orchestration machine surfaces。
- Source/tests:
  - `src/family-domain-agent-descriptor.ts` 聚合 domain-agent entry、standard skeleton、action catalog、stage control plane、memory、skill、runtime、session/progress/artifact surfaces。
  - `src/family-domain-agent-skeleton.ts` 只接受 `standard_domain_agent_skeleton` surface，并把 legacy cleanup / physical skeleton evidence 作为 refs-only gate。
  - Focused tests assert unified descriptor/skeleton current surfaces and no active default Gateway path.

## Changes

- `docs/specs/shared-domain-contract.md`
  - Replaced the fixed `2026-05-26` current-state note with a live-reading policy aligned with `shared-runtime-contract.md`.
  - Named the authoritative current inputs: core docs, active gap plan, `current-development-lines`, standard domain-agent skeleton contract, family orchestration schemas, source/tests and fresh CLI/read-model.
  - Kept the current product layering, MAS/MAG/RCA authority boundary, OMA role, MDS companion-only reading and old Domain Gateway / Domain Harness OS tombstone/provenance boundary without freezing dated counters.
- `contracts/README.md`
  - Replaced stale `docs/active/shared-runtime-contract*.md` and `docs/active/shared-domain-contract*.md` path references with `docs/specs/shared-runtime-contract.md` and `docs/specs/shared-domain-contract.md`.

No source, machine-readable contracts, tests, CLI behavior, runtime ledger, App repo files, domain repo files or release artifacts were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/specs/README.md`
- `docs/specs/shared-runtime-contract.md`
- `docs/specs/shared-domain-contract.md`
- `contracts/README.md`
- `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`
- `contracts/family-orchestration/*.schema.json` inventory
- `src/family-domain-agent-descriptor.ts`
- `src/family-domain-agent-skeleton.ts`
- `tests/src/cli/cases/workspace-domain.descriptor.test.ts`
- `tests/src/cli/cases/workspace-domain.stages.test.ts`
- process ledger index

Edited:

- `docs/specs/shared-domain-contract.md`
- `contracts/README.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-39.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned or deleted in this tranche.

## Remaining stale / retire candidates

- Continue checking `docs/specs/opl-domain-onboarding-contract.md` for fixed-date currentness anchors and candidate-domain statements that may have drifted against current OPL Framework / App / Foundry Agent topology.
- Continue checking App release support docs for stale release, runner, package channel, active-shell path or validation timing assumptions.
- Re-check `contracts/README.md` and other root/index docs when active support docs move between `docs/active/`, `docs/specs/`, `docs/runtime/` or `docs/references/`; prose paths must not become a second truth source.

## Verification

Fresh verification before absorb:

- `rtk npm ci` exited `0`, ran `npm run build`, and left the known npm audit state at 10 high severity vulnerabilities; dependency audit remediation is outside this tranche.
- `rtk git diff --check` exited `0`.
- Conflict-marker scan `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' docs contracts src tests README.md` returned no matches.
- `rtk node --experimental-strip-types --test tests/src/cli/cases/workspace-domain.descriptor.test.ts tests/src/cli/cases/workspace-domain.stages.test.ts tests/src/cli/cases/workspace-domain.lifecycle-cleanup.test.ts tests/src/verification-command-surfaces.test.ts` passed: `tests 38`, `pass 38`, `fail 0`.
- `rtk opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Next tranche write scope

- Continue small evidence-backed docs governance slices, prioritizing `docs/specs/opl-domain-onboarding-contract.md` if fresh source/contracts/tests show stale admitted-domain, MDS, Gateway/frontdoor, candidate-domain or fixed-date wording.
