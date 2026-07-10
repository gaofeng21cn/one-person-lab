# OPL Purpose-First History Compression Closeout

Owner: `One Person Lab`
Purpose: `purpose_first_history_compression_closeout`
State: `history_closeout`
Machine boundary: 本文是人读 docs-governance closeout。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned refs、App evidence 和 repo-native verification。
Date: `2026-06-08`

## Scope

本轮只治理 OPL 仓 `docs/history/process/**` 中的 OPL family purpose-first 历史长清单。写集限定为：

- `docs/history/process/plans/2026-06-03-opl-family-purpose-first-design-audit.md`
- `docs/history/process/plans/2026-06-08-opl-purpose-first-history-compression-closeout.md`
- `docs/history/process/README.md`
- `docs/history/process/plans/README.md`

未修改 active truth、contracts、source、tests、runtime ledger、App evidence 或 domain repos。

## SSOT Decision

| Theme | Single Source of Truth | Decision |
| --- | --- | --- |
| Current completion / gaps / next baton | `docs/active/current-state-vs-ideal-gap.md` | 历史 audit 中的 `next`、priority order 和 dynamic owner/counter 不再作为当前执行计划。 |
| Purpose-first stable audit standard | `docs/active/opl-foundry-agent-target-operating-architecture.md` | 历史逐仓长表只保 provenance；稳定判断回目标操作架构。 |
| Production closure evidence gates | `docs/active/production-framework-closure-gap-matrix.md` | 历史 provider/read-model/App evidence 只能作为当时 snapshot，不替代当前 closure gate。 |
| Current topology and boundary | `docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md` | 当前公开角色、runtime boundary、false authority 和 no-resurrection 规则回核心 docs。 |
| Docs lifecycle / compression policy | `docs/docs_portfolio_consolidation.md` | 历史长清单只保 compact provenance；dated proof、command transcript 和 worktree state 不回 active docs。 |

## Content Disposition

| Section class | Disposition |
| --- | --- |
| Historical audit question | 保留为 compact provenance。 |
| Dirty state and fresh snapshot | 压缩为不可复用边界；删除逐仓 dirty/ahead/behind 长清单。 |
| Live OPL readouts and dynamic counters | 压缩为 snapshot class；当前计数必须 fresh-read。 |
| Top-level purpose-first findings | 保留主题级结论，并指向 active support owner。 |
| Per-repo design audit | 压缩为 stable role / no-resurrection boundary 表。 |
| Priority recommendations | 保留为 historical priority stack，不作为当前 backlog。 |
| Verification transcript | 删除逐条历史命令；当前验证记录留本 closeout 和 git history。 |

## Coverage

Reviewed peer refs before compression:

- `docs/docs_portfolio_consolidation.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/active/opl-foundry-agent-target-operating-architecture.md`
- `docs/active/production-framework-closure-gap-matrix.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/active/README.md`
- `docs/history/process/README.md`
- `docs/history/process/plans/README.md`

Inbound links to the original history path are preserved. The path remains valid as historical provenance because active/support docs cite it as the 2026-06-03 purpose-first diagnostic source.

## Retired From This History File

- Dated repo dirty/ahead/behind state as current truth.
- Old `current` / `next` language as current owner instruction.
- Fixed CLI JSON paths and counters as current read-model truth.
- Per-repo long-form recommendations already folded into active support docs.
- Command transcript and validation transcript.
- Cross-repo implementation order that now belongs to active gap plan or repo-local owner docs.

## Not Claimed

- This is not a fresh cross-repo runtime readiness audit.
- This is not production readiness, domain readiness, App release readiness, wrapper physical delete authority or owner receipt.
- `opl-doc-doctor` pass is only a shape/risk signal.
- Six-repo OPL Doc governance remains active; this tranche only closes one OPL history/process compression lane.

## Verification Boundary

Minimum verification for this closeout:

```bash
rtk git diff --check
rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs contracts
rtk opl-doc-doctor doctor /Users/gaofeng/workspace/one-person-lab/.worktrees/opl-purpose-first-history-compress --format json
```

After absorption, rerun a six-repo status and doctor sweep from the root checkout. Remaining docs-governance scope stays in the active goal until every repo's README* and docs/**/*.md are section-level covered and folded into next prompts.
