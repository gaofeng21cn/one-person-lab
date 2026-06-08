# OPL Family Structure Advisory Report

Owner: `One Person Lab`
Purpose: `references_operating_governance_family_structure_advisory_report`
State: `active_support_dated_snapshot`
Machine boundary: 本文是人读 advisory snapshot。当前机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、真实 evidence，以及 `scripts/family-structure-advisory.mjs` 的 fresh 输出。

## Reading Rules

- 本报告是 tracked advisory snapshot，不是结构阻断门。复用精确文件清单、line count、`needs_design_pass`、`mechanical_residue` 或 `public_surface_risk` 前必须重跑 fresh advisory command。
- `family:structure-advisory` 默认 scope 覆盖当前 OPL-related 十一仓：`one-person-lab`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`、`opl-agui-codex-shell`、`opl-doc`、`opl-flow`、`homebrew-one-person-lab`、`OPL-PPT`。`opl-aion-shell` 是用户明确排除的外部 fork / App shell implementation carrier；`med-deepscientist` 和 `DeepScientist` 只按 archive/reference/fixture 语境读取。
- 若 sibling repo dirty、ahead、最近一小时有写入、存在活跃进程、远端/PR owner 信号，命令输出只能作为本地 read-only preflight；精确 line count 或 findings 写入对应 repo owner doc 前必须由该 repo owner lane 刷新并验证。
- Advisory findings 只能进入 design-pass、contract-surface review 或 cleanup candidate queue；不能直接变成 fail-closed backlog、机械拆分任务、domain ready 判断或 production ready 判断。
- 结构 landing 的逐提交 evidence、worktree cleanup、验证命令长清单和历史 closeout 不属于本 support reference 的当前正文；它们只作为 `docs/history/**` provenance 阅读。

## 2026-06-08 Current Snapshot

Fresh command:

```bash
npm run --silent family:structure-advisory -- --format=json
```

Fresh eleven-repo local summary from `2026-06-08T09:10:19Z` after root checkout revalidation:

| Repo | needs_design_pass | mechanical_residue | public_surface_risk | missing_verify_entry |
| --- | ---: | ---: | ---: | --- |
| `one-person-lab` | 16 | 0 | 6 | `false` |
| `med-autoscience` | 34 | 0 | 5 | `false` |
| `med-autogrant` | 1 | 0 | 5 | `false` |
| `redcube-ai` | 0 | 0 | 9 | `false` |
| `opl-meta-agent` | 0 | 0 | 1 | `false` |
| `one-person-lab-app` | 0 | 0 | 3 | `false` |
| `opl-agui-codex-shell` | 0 | 0 | 0 | `false` |
| `opl-doc` | 0 | 0 | 0 | `false` |
| `opl-flow` | 0 | 0 | 0 | `false` |
| `homebrew-one-person-lab` | 0 | 0 | 0 | `false` |
| `OPL-PPT` | 0 | 0 | 0 | `false` |

Current scope:

- Included standard / Foundry Agent repos: `med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`。
- Included framework / product / shell / support repos: `one-person-lab`、`one-person-lab-app`、`opl-agui-codex-shell`、`opl-doc`、`opl-flow`、`homebrew-one-person-lab`、`OPL-PPT`。
- Excluded: `opl-aion-shell`、`med-deepscientist`、`DeepScientist`。

## Current Interpretation

- Fresh scan shows no scanner-detected mechanical split residue or missing verify entry in the included eleven-repo scope. That means no tracked `chunk_*` / `part_001` / nested `*_parts/*_parts` class hard split remains in the scanner's current pattern set; it does not mean all structure is ideal.
- Line budget remains a maintainability fitness function, advisory for ordinary development and blocking only in explicit strict maintenance. The strict maintenance unit is `new over-limit growth`、`baseline growth`、`stale baseline`、`retired baseline` or `missing reviewed owner/reason`; repair must be a natural semantic split, owner-boundary move, generated/source separation, or approved reviewed baseline.
- `parts/` is acceptable when it names a real owner subdomain. `*_parts/*_parts` or nested `parts` stacks are review signals; they become cleanup tasks only after reading the caller and confirming the directory name is merely a mechanical consequence of the budget.
- Public-surface risk is usually generated contract/schema pressure or large shared helper bucket pressure. Treat it as generator/source modularity or shared-helper ownership review, not as physical JSON shard work.

## Family Morphology

Standard / Foundry Agent repos should visibly share the same repo-source shape:

- `agent/` holds stage prompt / skill / tool affordance / knowledge / quality-gate refs.
- `contracts/` holds machine-readable domain descriptors and schemas.
- `runtime/` holds sidecar / projection / lifecycle adapters as source only.
- `src` or `packages` holds domain implementation and authority functions.
- `docs/` holds owner truth and policy.
- `scripts/verify.sh` is the repo-native verification entry.

Support repos can be lighter but should still be recognizable: `one-person-lab` is the framework / shared governance owner; `one-person-lab-app` is product / release / shell-candidate owner; `opl-agui-codex-shell` is App-owned shell-candidate implementation support; `opl-doc` and `opl-flow` are plugin / workflow support repos; `homebrew-one-person-lab` is distribution transport support; `OPL-PPT` is artifact reference support.

## Repo Disposition

| Repo | Current structure finding | Action |
| --- | --- | --- |
| `one-person-lab` | Fresh scan now reports 16 `needs_design_pass` source/test files and 6 public-surface risks. No mechanical residue and no missing verify entry. | Treat as OPL-owned natural source-boundary queue. Prioritize `contracts.ts` / public command specs / workspace diagnostics / domain-pack compiler / runtime enqueue / workspace lifecycle when their owner surfaces are next touched; do not turn this support snapshot into a blocking backlog. |
| `med-autoscience` | Fresh scan reports 34 `needs_design_pass` items and 5 public-surface risks. No mechanical residue and no missing verify entry. | MAS remains the highest residual source-shape advisory queue. Handle only from MAS owner lanes with fresh repo state, especially domain action materializer, owner-route handoff/reconcile, domain health diagnostic, study progress / progress-first projection and dispatch surfaces. |
| `med-autogrant` | Fresh scan reports one source-shape item, `src/med_autogrant/opl_standard_pack.py`, plus 5 public-surface risks. | Treat as MAG owner-boundary review for standard-pack extraction and generated schema/contract modularity; no OPL-side physical edit is authorized by this snapshot. |
| `redcube-ai` | Fresh scan has no source-shape finding; public-surface risk remains in generated/public contracts and two shared buckets. | Continue generated/public-surface modularity and shared-bucket ownership review from RCA lanes; no source split is currently implied. |
| `opl-meta-agent` | Fresh scan has no source-shape finding; public-surface risk remains in `contracts/stage_control_plane.json`. | Keep source/parts direction; contract modularity remains generator/source concern. |
| `one-person-lab-app` | Fresh scan has no source-shape finding; public-surface risk remains in three App contracts. | Keep App source-shape advisory. Future growth should split by product release boundary, active-shell validation phases, package builder phases, release notes, readiness summary and user-path evidence. |
| `opl-agui-codex-shell` | No source-shape, mechanical residue, public-surface or missing-verify finding. | Keep shell-local implementation thin and App-owned product truth out of the shell. |
| `opl-doc` | No current finding. | Keep as support/plugin morphology example: thin command entry plus named doctor responsibility modules. |
| `opl-flow` | No current finding. | Keep verify entry thin and repo-native; no extra structure gate is needed until active source growth appears. |
| `homebrew-one-person-lab` | No current finding; verify entry is not required by policy. | Keep lightweight as distribution transport support. |
| `OPL-PPT` | No current finding; verify entry is not required by policy. | Keep as artifact reference support; if scratch graduates into maintained support code, preserve route/build-phase/comparison module shape. |

## Detailed Readout

The `one-person-lab` section is kept detailed because `tests/src/family-structure-advisory.test.ts` uses it to guard tracked report alignment with generated public-surface risk output.

### one-person-lab

needs_design_pass:

- `src/contracts.ts` (`1945`, `source_file_over_1000_lines`)
- `src/cli/cases/public-command-specs.ts` (`1450`, `source_file_over_1000_lines`)
- `src/workspace-diagnostics.ts` (`1293`, `source_file_over_1000_lines`)
- `tests/src/cli/cases/workspace-domain.initializer.test.ts` (`1277`, `source_file_over_1000_lines`)
- `src/domain-pack-compiler/generated-interface-read-model.ts` (`1218`, `source_file_over_1000_lines`)
- `tests/src/verification-command-surfaces.test.ts` (`1165`, `source_file_over_1000_lines`)
- `tests/src/cli/cases/domain-pack-compiler-generated-interfaces.test.ts` (`1142`, `source_file_over_1000_lines`)
- `tests/src/cli/cases/agents-conformance.test.ts` (`1139`, `source_file_over_1000_lines`)
- `src/opl-skills.ts` (`1101`, `source_file_over_1000_lines`)
- `tests/src/cli/cases/family-runtime-provider-slo.test.ts` (`1094`, `source_file_over_1000_lines`)
- `tests/src/cli/cases/family-runtime-provider-hosted-attempts-cases/mas-default-executor-single-flight.ts` (`1091`, `source_file_over_1000_lines`)
- `src/domain-pack-compiler.ts` (`1086`, `source_file_over_1000_lines`)
- `src/family-runtime-enqueue.ts` (`1073`, `source_file_over_1000_lines`)
- `src/workspace-initializer.ts` (`1049`, `source_file_over_1000_lines`)
- `tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts` (`1020`, `source_file_over_1000_lines`)
- `src/workspace-lifecycle.ts` (`1013`, `source_file_over_1000_lines`)

mechanical_residue:

- none

public_surface_risk:

- `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`
- `contracts/opl-framework/brand-module-surfaces.json`
- `contracts/family-orchestration/family-product-entry-manifest-v2.schema.json`
- `contracts/opl-framework/workspace-index.schema.json`
- `contracts/family-orchestration/family-stage-proof-bundle.schema.json`
- `contracts/opl-framework/agent-lab-contract.json`

Interpretation: OPL framework source/test shape has fresh source-boundary advisory items again after later feature growth. These are not fail-closed blockers and not proof of poor functionality. Future cleanup should choose semantic owners such as contract loader, public command spec cases, workspace diagnostics, generated-interface read model, skills registry, runtime enqueue and workspace lifecycle.

### med-autoscience

Fresh scan reports 34 `needs_design_pass` items and 5 `public_surface_risk` items. Exact current paths must be read from fresh `family:structure-advisory` JSON before a MAS owner lane writes source or docs.

## External Calibration

- ESLint `max-lines` treats large files as a maintainability signal, notes that there is no objective universal maximum, and offers configurable `max` plus blank/comment skipping. This supports a ratchet / review policy instead of a universal physical split rule: <https://archive.eslint.org/docs/rules/max-lines>
- Checkstyle `FileLength` frames long files as hard to understand and says they should usually be refactored into classes with a specific task; it also uses a configurable `max` and file-extension scope. This supports semantic refactoring, not arbitrary chunks: <https://checkstyle.org/checks/sizes/filelength.html>
- Thoughtworks' fitness-function guidance treats architectural checks as automated health signals, while warning that overly strict or poorly defined functions can impose unnecessary rigidity. This supports keeping line-budget/Sentrux as fitness signals with explicit escape/ratchet semantics: <https://www.thoughtworks.com/insights/decoder/f/fitness-functions>

## Operating Rule

Use default eleven-repo scope for read-only preflight:

```bash
npm run --silent family:structure-advisory -- --format=json
npm run --silent family:structure-advisory -- --format=markdown
```

Use explicit repo scope for commit-bound docs or focused design work:

```bash
npm run --silent family:structure-advisory -- --repo one-person-lab=/Users/gaofeng/workspace/one-person-lab --format=json
```

Treat `needs_design_pass` and `public_surface_risk` as review queue inputs. Treat `mechanical_residue` as cleanup candidates only after reading the owning code path and confirming the split is mechanical rather than a valid domain term.
