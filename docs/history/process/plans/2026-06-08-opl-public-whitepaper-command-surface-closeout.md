# OPL Public Whitepaper And Command Surface Docs Closeout

Owner: `One Person Lab`
Purpose: `opl_public_whitepaper_command_surface_docs_closeout`
State: `history_provenance`
Machine boundary: 本文是人读 OPL Doc tranche closeout。当前执行目标、差距、完成口径和下一轮 baton 继续归 `docs/active/current-state-vs-ideal-gap.md`；文档生命周期治理归 `docs/docs_portfolio_consolidation.md`；机器真相继续归 `contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifest、App evidence 和真实验证 evidence。

## Semantic Theme

本轮治理主题是 `one-person-lab public whitepaper lifecycle / active command-surface wording`。

目标是把公开白皮书纳入长期文档生命周期头，并把 active/current 文档里的当前命令面读法从旧 Gateway/frontdoor 路线词汇中分离出来。合同字段名、source 结构、CLI 行为和测试断言不在本 docs-only lane 中改写。

## Single Source of Truth

| Theme | SSOT owner | Why it wins |
| --- | --- | --- |
| Public whitepaper narrative | `docs/public/whitepaper/opl-whitepaper.md` | 持有 OPL 面向用户、合作者、早期采用者和技术决策者的公开白皮书叙事。 |
| Docs lifecycle routing | `docs/docs_portfolio_consolidation.md` | 持有 lifecycle header、canonical taxonomy、长清单压缩和 active/support/history 分层规则。 |
| Current OPL status and active gap | `docs/status.md` and `docs/active/current-state-vs-ideal-gap.md` | 持有当前完成口径、当前 gap 和下一步 baton；support/history docs 不得覆盖。 |
| Current command-surface machine truth | `contracts/opl-framework/brand-cli-governance.json`, `contracts/opl-framework/foundry-agent-series-contract.json`, source and tests | 合同字段和源代码仍持有当前机器接口；docs-only lane 只改人读措辞。 |
| Retired Gateway/frontdoor route provenance | `docs/history/**` | 旧路线、旧词汇和过程 closeout 只在 history/provenance/negative-guard 语境中保留。 |

## Coverage Summary

| Theme | Current coverage |
| --- | --- |
| Semantic peer set | Root `README*`, `docs/**/*.md`, public whitepaper source/derived docs, active command-surface prose, process history index, docs governance owner, and active contract/source/test references were reviewed for this targeted theme. Detailed inventory counts stay in git history, not in active truth. |
| Current/public docs | Public whitepaper lifecycle metadata and active/current command-surface wording were updated in their owner docs. |
| History docs | This closeout and the process history index record the tranche as provenance only. |
| Reviewed but not edited | Docs governance, process history index, OPL family development reference, active machine contracts and source/test references kept their existing owner roles. |

## Edit Decision

- Added lifecycle metadata to `docs/public/whitepaper/opl-whitepaper.md`: owner, purpose, state and machine boundary.
- Rewrote active/current prose that described current module and Foundry Agent command surfaces with the retired route word. The current human wording now uses `command surface` / `command spine` / `ordinary entry`.
- Preserved machine contract truth. Current contract field names and source/test payload names remain unchanged because they are active machine interfaces, not stale docs prose.
- Left history/provenance wording in history layers. Old route vocabulary remains valid only as history, tombstone, provenance, negative guard or exact machine-field evidence.

## Unreviewed Docs

This tranche did not re-audit every one of the 233 current root `README*` and `docs/**/*.md` files section by section. It only covered the targeted public-whitepaper lifecycle and active command-surface wording theme. The global six-repo `/goal` remains open until every repo ledger has no unreviewed docs or unresolved stale/retire candidates.

## Remaining Stale Or Retire Candidates

- The current machine contracts and tests still expose field names containing `frontdoor` such as `platform_frontdoors`, `agent_cli_frontdoor_policy`, `frontdoor_spine` and related projections. They are active machine fields today. Retiring or renaming them requires a separate contract/source/test migration lane.
- Long-domain Foundry Agent commands remain described as machine-testable legacy compatibility commands rather than ordinary public entrypoints. If they become no-active-caller surfaces, retire them through source/contract/test deletion plus history provenance.
- Physical stale-surface deletion remains outside this docs-only closeout and still requires replacement parity, no-active-caller evidence, owner receipt or typed blocker, no-forbidden-write proof and tombstone/provenance.

## Next Write Scope

Next safe scope should either:

- continue OPL root with a machine-field rename/retirement lane for the remaining active `frontdoor` field names, if source and tests are intentionally in scope; or
- move to the next six-repo docs-governance lane with an isolated worktree when the target checkout is dirty or has concurrent work.

Do not treat this closeout as completion of the six-repo docs lifecycle goal.
