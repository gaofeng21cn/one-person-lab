# OPL MVP Friction History Compression Closeout

Owner: `One Person Lab`
Purpose: `mvp_friction_history_compression_closeout`
State: `history_closeout`
Machine boundary: 本文是人读 docs-governance closeout。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned refs、App evidence 和 repo-native verification。
Date: `2026-06-08`

## Scope

本轮只治理 OPL 仓 `docs/history/process/**` 中的 OPL Foundry Agent MVP friction 历史长清单。写集限定为：

- `docs/history/process/plans/2026-06-04-opl-foundry-agent-mvp-friction-audit.md`
- `docs/history/process/plans/2026-06-08-opl-mvp-friction-history-compression-closeout.md`
- `docs/history/process/README.md`
- `docs/history/process/plans/README.md`

未修改 active truth、contracts、source、tests、runtime ledger、App evidence 或 domain repos。

## SSOT Decision

| Theme | Single Source of Truth | Decision |
| --- | --- | --- |
| OPL / Foundry Agent target operating architecture | `docs/active/opl-foundry-agent-target-operating-architecture.md` | 历史 audit 中的 greenfield primitives、runtime flow、migration phases 和 acceptance framing 不再作为当前 owner。 |
| Current progress / gaps / next baton | `docs/active/current-state-vs-ideal-gap.md` | 历史 audit 中的 `next`、implementation lanes 和 CLI count 不再作为当前执行计划。 |
| Docs lifecycle / compression policy | `docs/docs_portfolio_consolidation.md` | 历史长清单只保 compact provenance；dated proof、command transcript 和 worktree closeout 不回 active docs。 |
| Machine truth | contracts、source、tests、CLI/read-model、runtime ledger、domain owner refs、App evidence | doctor/readout 只作 preflight 或历史 evidence，不替代 live truth。 |

## Content Disposition

| Section class | Disposition |
| --- | --- |
| Historical question and MVP principle | 保留为 compact provenance。 |
| Fresh evidence readout | 压缩成 snapshot table，并标明历史计数不可复用。 |
| P0/P1 friction diagnosis | 保留主题级结论；删除逐条长展开和当时流水。 |
| Root cause / no-resurrection rules | 保留，因为它们仍可解释为什么 audit tail 不能恢复为 ordinary next action。 |
| External practice calibration | 已由 active target architecture 吸收；本文件不再重列外部来源长表。 |
| Target loops / implementation lanes | 保留名称和折回边界；当前 owner 回 active docs。 |
| Verification transcript | 删除逐条历史命令；当前验证记录留本 closeout 和 git history。 |

## Coverage

Reviewed peer refs before compression:

- `docs/docs_portfolio_consolidation.md`
- `docs/active/opl-foundry-agent-target-operating-architecture.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/active/README.md`
- `docs/history/process/README.md`
- `docs/history/process/plans/README.md`

Inbound links to the original history path are preserved. The path remains valid as historical provenance because active/support docs still cite it as a friction diagnostic source.

## Retired From This History File

- Dated CLI counters as current truth.
- Local checkout dirtiness notes as current repo state.
- Old `current` / `next` language as current owner instruction.
- Full command transcript and validation transcript.
- Long-form external practice table duplicated by active target architecture.
- Implementation lane detail that now belongs to active gap plan or live machine surfaces.

## Not Claimed

- This is not a fresh domain/runtime readiness audit.
- This is not production readiness, domain readiness, App release readiness, wrapper physical delete authority or owner receipt.
- `opl-doc-doctor` pass is only a shape/risk signal.
- Six-repo OPL Doc governance remains active; this tranche only closes one OPL history/process compression lane.

## Verification Boundary

Minimum verification for this closeout:

```bash
rtk git diff --check
rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs contracts
rtk opl-doc-doctor doctor /Users/gaofeng/workspace/one-person-lab/.worktrees/opl-mvp-friction-history-compress --format json
```

After absorption, rerun a six-repo status and doctor sweep from the root checkout. Any remaining docs-governance scope must stay in the active goal and next tranche ledger rather than being marked globally complete.
