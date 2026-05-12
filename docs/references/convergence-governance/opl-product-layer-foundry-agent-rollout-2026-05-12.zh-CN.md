# OPL 产品分层与 Foundry Agent 发布形态落地记录（2026-05-12）

Status: `completed_closeout_reference`
Owner: `One Person Lab`
Purpose: 记录 `OPL Framework -> One Person Lab App -> Foundry Agents` 三层产品模型的一次跨仓落地结果、验证结果与剩余风险。
Machine boundary: 本文是人读 closeout 证据，不是机器接口。机器真相继续归 `contracts/opl-framework/*.json`、各 domain 仓 `contracts/runtime-program/current-program.json`、CLI/API 行为、App 代码和 repo-native tests。

## 结论

本轮已把三层产品模型落到 OPL 主仓合同、One Person Lab App 可见信息架构，以及 MAS/MAG/RCA 三个首批 Foundry Agent 的公开文档与产品层 metadata。

- `OPL Framework`：智能体开发与运行框架，持有 stage-led runtime、typed queue、activation、projection、family contracts 和 domain discovery。
- `One Person Lab App`：普通用户与开发者工作台，消费 framework/domain projection，不拥有 runtime provider truth、domain truth、quality verdict 或 artifact authority。
- `Foundry Agents`：MAS/MAG/RCA 等基于 OPL Framework 的 OPL-compatible packages，保留 direct app skill 入口，不 vendor / fork OPL runtime。

## Planned

- 在 OPL 主仓补 machine-readable product-layer metadata，使 `OPL Framework`、`One Person Lab App`、`Foundry Agents` 能被合同和 CLI surface 直接识别。
- 在 App 中把可见入口、设置页、引导页、默认会话上下文与品牌资源对齐到“使用 One Person Lab / 管理 Foundry Agents / 开发 OPL Agent”。
- 在 MAS/MAG/RCA 中把现有 `single app skill + CLI/MCP/controller + manifest/projection` 表达为 `Foundry Agent / OPL-compatible package built on OPL Framework`。
- 保持 domain truth、quality verdict、runtime owner、artifact/publication/submission/export authority 留在各 domain 仓。
- 验证后提交到各自 `main`，不保留本轮临时 worktree / branch。

## Done

| Repo | Commit | Done |
| --- | --- | --- |
| `one-person-lab` | `44581e9 feat: publish OPL product layer contracts` | `domains.json` 新增 `product_layer=foundry_agent` 与 `foundry_agent_package`；`public-surface-index.json` 新增 App workbench 与 Foundry package surfaces；`opl contract domains/surfaces` 摘要输出产品层字段；README/docs/contracts 同步 stage-led / Agent executor / App consumer 边界。 |
| `opl-aion-shell` | `e8df30f0a feat(app): align OPL product layers` | App 设置、引导、默认技能上下文、i18n 与 PNG 品牌/Foundry 资产对齐三层产品模型。 |
| `med-autoscience` | `651c7f23 Update MAS positioning for OPL-compatible foundry package` | MAS README/docs/contracts/manifest surface 增加 Foundry Agent / OPL-compatible package 定位，并保留 MAS-owned research truth、quality、runtime 与 publication/artifact authority。 |
| `med-autogrant` | `f646479 Document MAG Foundry Agent package` | MAG README/docs/contracts/current-program 增加 Foundry Agent package metadata，并吸收品牌 PNG。 |
| `med-autogrant` | `6ef4f80 docs: align MAG executor boundary wording` | MAG core docs 将 `Codex-first` 默认表达收口为 stage-led / Agent executor / Codex CLI first-class executor。 |
| `redcube-ai` | `0cc3cd6 docs: publish RCA foundry agent package positioning` | RCA README/docs/contracts/current-program 增加 Foundry Agent package metadata，并吸收品牌 PNG。 |
| `redcube-ai` | `cc5a8d0 docs: align RCA executor boundary wording` | RCA `AGENTS.md` 对齐 stage-led / Agent executor / Codex CLI first-class executor 边界。 |

## Verification

| Repo | Verification |
| --- | --- |
| `one-person-lab` | `git diff --check` passed；`node scripts/test-lanes.mjs assert-coverage` passed；`npm run typecheck` passed；`npm run test:smoke` passed (`35 passed`)；`npm run test:fast -- tests/src/domain-definition-contract.test.ts tests/src/cli/cases/contracts-help.test.ts tests/src/cli/cases/contracts-entry.test.ts` passed (`139 passed`, `1 skipped`)；`npm run test:meta` passed (`139 passed`, `1 skipped`). |
| `opl-aion-shell` | `bun run i18n:types` passed；`node scripts/check-i18n.js` passed；`bunx tsc --noEmit` passed；focused Vitest passed (`114 tests`)；`git diff --check` passed；`bun run test` passed (`429 passed`, `8 skipped`; `4218 tests passed`, `38 skipped`, `22 todo`). |
| `med-autoscience` | `./scripts/verify.sh` passed (`4 passed`)；`./scripts/verify.sh meta` passed (`231 passed`, `3790 deselected`)；`git diff --check` passed. `./scripts/verify.sh structure` did not pass because current HEAD / concurrent gate-clearing changes raise complexity in `src/med_autoscience/controllers/gate_clearing_batch.py`; that file is outside this Foundry positioning commit. |
| `med-autogrant` | `./scripts/verify.sh` passed (`6 passed` smoke, `212 passed` fast core)；`./scripts/verify.sh smoke` passed；`./scripts/verify.sh meta` passed (`29 passed`)；`./scripts/verify.sh regression` passed (`290 passed`)；`git diff --check` passed. `./scripts/verify.sh structure` did not pass due existing structure debt outside this commit: `runtime_ops.py` complexity/god-file signals and oversized `schemas/v1/product-entry-manifest.schema.json`. |
| `redcube-ai` | `npm run test:smoke` passed (`38 passed`)；`npm run test:fast` passed；`npm run test:meta` passed (`228 passed`)；`npm run typecheck` passed；`git diff --check` passed；`npm run test:ci` passed. `npm run line-budget` did not pass due existing oversized files outside this commit: `packages/redcube-gateway/src/actions/get-product-entry-manifest.ts` and `tests/product-entry-cases/manifest-and-start-surfaces.test.ts`. |

## Deferred / Skipped

- No push was performed in this rollout; all commits are local mainline commits.
- `med-autoscience` still has non-rollout WIP in `src/med_autoscience/controllers/gate_clearing_batch.py`, `src/med_autoscience/controllers/gate_clearing_batch_currentness.py`, and `tests/test_gate_clearing_batch_cases/current_package_freshness.py`. These belong to a concurrent gate-clearing lane and were neither committed nor reverted here.
- Existing active MAS worktrees remain: `mas-delivery-currentness`, `mas-managed-write-auth`, and `mas-mcp-transport`. They predate or belong to concurrent work; this rollout did not delete them.
- MAG structure gate and RCA line-budget gate expose pre-existing maintenance debt. They are recorded here as residual risks, not as product-layer rollout blockers.
- This rollout did not split OPL into a new repo, did not embed OPL runtime into MAS/MAG/RCA, and did not promote One Person Lab App to runtime or domain authority.

## Current State

- OPL contracts now expose product-layer owner split in machine-readable form.
- App UI now names the user workflows around App / Foundry / Framework roles.
- MAS/MAG/RCA now publish their role as Foundry Agent packages while preserving direct skill paths and domain-owned authority.
- Cross-repo product semantics are aligned enough for downstream release notes, website copy, onboarding, and future package manifests to use the three-layer wording without re-litigating the boundary.
