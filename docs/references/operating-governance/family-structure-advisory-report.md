# OPL Family Structure Advisory Report

Owner: `One Person Lab`
Purpose: `references_operating_governance_family_structure_advisory`
State: `support_reference`
Machine boundary: 本文是人读 advisory support。当前机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、真实 evidence，以及 `scripts/family-structure-advisory.mjs` 的 fresh 输出。

## Reading Rules

- 本报告是 structure advisory 的稳定读法，不是 tracked output snapshot、结构阻断门或 fresh finding ledger。复用精确文件清单、line count、`needs_design_pass`、`mechanical_residue` 或 `public_surface_risk` 前必须重跑 fresh advisory command。
- `family:structure-advisory` 的默认 scope、repo role、excluded repositories、threshold 和 JSON/Markdown shape 由 `scripts/family-structure-advisory.mjs` 及其 tests 持有；本文不复制生成输出。
- 若 sibling repo dirty、ahead、最近一小时有写入、存在活跃进程、远端/PR owner 信号，命令输出只能作为本地 read-only preflight；精确 line count 或 findings 写入对应 repo owner doc 前必须由该 repo owner lane 刷新并验证。
- Advisory findings 只能进入 design-pass、contract-surface review 或 cleanup candidate queue；不能直接变成 fail-closed backlog、机械拆分任务、domain ready 判断或 production ready 判断。
- 结构 landing 的逐提交 evidence、worktree cleanup、验证命令长清单和历史 closeout 不属于本 support reference 的当前正文；它们只作为 `docs/history/**` provenance 阅读。

## Fresh Read Commands

Default family preflight:

```bash
npm run --silent family:structure-advisory -- --format=json
npm run --silent family:structure-advisory -- --format=markdown
```

Focused repo preflight:

```bash
npm run --silent family:structure-advisory -- --repo one-person-lab=/Users/gaofeng/workspace/one-person-lab --format=json
```

Current JSON shape:

- `repositories` is an array. Each repo entry uses `repo`, `repo_role`, `status`, `categories` and `summary`.
- Per-repo findings live under `categories.safe_to_keep`、`categories.needs_design_pass`、`categories.mechanical_residue` and `categories.public_surface_risk`.
- Do not query stale `repo_key`, top-level `items` or top-level `findings` paths when refreshing this report.

## Current Interpretation

- A clean advisory scan only means the scanner's current pattern set did not find matching structural risk in that scope; it does not mean all structure is ideal.
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

Support repos can be lighter but should still be recognizable: `one-person-lab` is the framework / shared governance owner; `one-person-lab-app` is product / release / GUI candidate policy owner; `opl-aion-shell` is the current App GUI mainline implementation support; `opl-agui-codex-shell` is archived AG-UI/CopilotKit technical-proof replay support, not a foreground candidate; `opl-doc` and `opl-flow` are plugin / workflow support repos; `homebrew-one-person-lab` is distribution transport support; `OPL-PPT` is artifact reference support.

## Focused Readout Policy

The per-file advisory lists are intentionally not copied into this support report. Focused source or contract work must read fresh JSON from `family:structure-advisory` for the target repo, then inspect the owning source, callers, tests and repo-local owner docs before opening a write lane.

For OPL-owned follow-up, use:

```bash
npm run --silent family:structure-advisory -- --repo one-person-lab=/Users/gaofeng/workspace/one-person-lab --format=json
```

For MAS, App or shell follow-up, run the same command with that repo's current checkout. Do not use this Markdown report as a machine oracle for exact file lists, generated public-surface risk entries, line counts or source-shape queues.

## External Calibration

- ESLint `max-lines` treats large files as a maintainability signal, notes that there is no objective universal maximum, and offers configurable `max` plus blank/comment skipping. This supports a ratchet / review policy instead of a universal physical split rule: <https://archive.eslint.org/docs/rules/max-lines>
- Checkstyle `FileLength` frames long files as hard to understand and says they should usually be refactored into classes with a specific task; it also uses a configurable `max` and file-extension scope. This supports semantic refactoring, not arbitrary chunks: <https://checkstyle.org/checks/sizes/filelength.html>
- Thoughtworks' fitness-function guidance treats architectural checks as automated health signals, while warning that overly strict or poorly defined functions can impose unnecessary rigidity. This supports keeping line-budget/Sentrux as fitness signals with explicit escape/ratchet semantics: <https://www.thoughtworks.com/insights/decoder/f/fitness-functions>

## Operating Rule

Treat `needs_design_pass` and `public_surface_risk` as review queue inputs. Treat `mechanical_residue` as cleanup candidates only after reading the owning code path and confirming the split is mechanical rather than a valid domain term.
