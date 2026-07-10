# OPL 过度设计退役与收薄计划

Owner: `One Person Lab`
Purpose: `active_cleanup_plan`
State: `active_plan`
Machine boundary: 本文只记录当前清理目标、完成度和 blocker。机器真相归 source、contracts、CLI/readback、provider receipt、domain owner surface 与 repo-native verification。

## 目标边界

本轮按 Ponytail ultra 执行：删除优先，能回到 Node 标准库或既有 OPL primitive 就不保留私有实现。清理不能删掉 authority、currentness、replay、receipt、typed blocker、human gate、不可逆写保护或真实 active caller。

主模块是 `OPL Runway`、`OPL Console`、`OPL Connect/CLI`、`OPL Ledger`。协同模块是 `Workspace`、`Pack`、`Stagecraft`、`Foundry Lab`。不触碰 AionUI upstream body，也不把 domain truth、quality verdict、artifact authority 或 owner acceptance 上收到 OPL。

## 当前净变化

相对原审计基线 `98e34ec687a1` 的当前集成树：

| 范围 | Added | Deleted | Net |
| --- | ---: | ---: | ---: |
| `tests/**` | 13,182 | 25,187 | `-12,005` |
| 非测试 | 14,960 | 28,451 | `-13,491` |
| 合计 | 28,142 | 53,638 | `-25,496` |

其中 `tests/src/cli/**` 为 `+7,026/-19,973`，净删 `12,947` 行；`docs/active/*.md` 净删 `1,286` 行。净删量只说明体量变化，不替代行为、authority 或跨仓 caller 验收。

## 原始 12 条候选完成度

| # | 候选 | 状态 | 当前结果与边界 |
| ---: | --- | --- | --- |
| 1 | 收拢 `docs/active` | done | 从原审计 23 份 / 4,327 行收拢为 17 份 / 3,041 行；重复 target/support 计划已归并或删除，active 层只保当前 owner 文档。 |
| 2 | 删除纯转发与伪入口 | done | 零调用 re-export、MAG alias、`system-installation.ts`、ScholarSkills 私有入口等已删除；仍保留的 module index/public entry 是真实 package boundary。 |
| 3 | 用 Node 原生 glob 替代 walker/正则 | done | Stagecraft source hygiene 与 test lane stable groups 已改用 `fs.globSync`；不再维护同类递归 walker。 |
| 4 | 停止虚假宣称 Daytona/Modal supported | done | 实现面只广告 E2B；Daytona/Modal 仅保留 reference candidate/no-ready 示例，不声明 runner 已实现。 |
| 5 | 删除 reuse-first 历史 full-scan 系统 | done | 592 行历史 worklist 已删除；scanner/test 从约 1,478 行收薄为 446 行，只保 strict diff gate。 |
| 6 | 退役 framework tranche backlog | done | 第二套 backlog source、CLI 与 5 个专属测试已删除。 |
| 7 | 清理四个未接线 Runway 策略 | partial | anti-spin、stop-loss successor、paper supervisor consumer、dead-letter redrive 已删除，currentness由当前StageRun/Runway主链承担。通用no-progress budget没有canonical consumer；当前machine contract明确只允许advisory，禁止其block/exhaust StageRun，因此不能把旧correctness设想写成已落地。 |
| 8 | receipt ledgers 复用 JSON ledger helper | done | 通用 ledger 已复用 `readJsonReceiptLedger` / `writeJsonReceiptLedger` / `upsertJsonReceipts`；`external-evidence-ledger` 保留独有的 lock + atomic rename，不为统一外观删除并发保护。 |
| 9 | 合并 Console operator action route 构造 | done | 10 组 route 共用现有 builder/value helper，相关 Console + Ledger 提交净删 260 行；authority boundary 仍逐 route 显式保留。 |
| 10 | 收薄 `test-lanes.mjs` | done | stable test groups 使用原生 glob；当前 821 行中的显式路径是 lane ownership/成本分层，不再按“估算应删 300-500 行”强行改变 suite 语义。全文件统计的 46 次重复出现包含同一测试被不同成本 lane复用，不能直接按重复代码删除。 |
| 11 | CLI parser 回归 `node:util.parseArgs` | done | safe pure-options parser 已迁移，最后两条 lane 的CLI source为`+392/-1,180`，净删788行；含新增回归测试后总净删655行。手写arg loop从105降到20。保留的20个loop均承担positionals、alias出现顺序、跨flag累积、`--`分隔或dry-run/apply状态机。共享adapter对unknown/positional/missing/空字符串fail-closed，保留raw whitespace。 |
| 12 | CLI 测试按语义合并 | done | `tests/src/cli/**` 净删 12,947 行；authority/currentness/no-authority/replay/admission owner coverage保留。删除收益按 path-filtered 统计，不再引用旧 mixed-commit `8,008` 下界。 |

## 明确拒绝与外部 blocker

| 项目 | 状态 | 证据与停止条件 |
| --- | --- | --- |
| 删除整个 `DomainProgressTransitionRuntime` | rejected | MAS 仍真实消费 `opl_domain_progress_transition_runtime_live_readback` 与对应 contract。只有 MAS consumer 迁到 StageRun/Temporal/current-control 等价 ABI，或落地真正接线的 compatibility adapter 后，才可重新评估物理删除。 |
| Runway no-progress enforcement | rejected_by_current_contract | `stage-run-kernel-contract.json` 当前声明 `canonical_admission_consumer=null`、`enforcement=advisory_only_outside_stage_run_reducer`、`can_block_or_exhaust_stage_run=false`。只有Runway owner先修改canonical admission contract并给出consumer/回归，才能重开correctness实现。 |
| OBF source-byproduct caller cutover | blocked | `opl-bookforge/scripts/verify.sh` 仍两处调用 `bookforge_project_hygiene.py --source-byproduct-check`。OPL 的 Workspace source guard 已落地，但 OBF caller 未切换，不能声明 List 1 #13 完成。 |
| OBF native-helper 私有 shell 退役 | partial | OPL 已提供 `opl pack native-helper probe` receipt envelope；OBF renderer/export authority应留在 OBF。只有 OBF 默认 caller 切到 OPL primitive并删除重复通用 shell后才能关闭。 |

## Fresh 结构 readback

当前 `opl agents default-callers --family-defaults --json` 返回：

- `blocked_count=2`
- `active_deletion_evidence_worklist_count=8`
- `closed_surface_retirement_gate_count=16`
- `default_caller_delete_ready=false`
- `physical_delete_authorized=false`
- `no_further_opl_default_caller_delete_work=false`

当前 `opl agents conformance --family-defaults --json` 返回：

- `passed_count=3`
- `blocked_count=3`
- `structural_conformance_status=blocked`
- `structural_contract_status=blocked`
- `family_live_conformance_probe_status=blocked`

因此旧的 `passed_count=6 / blocked_count=0`、`no_further_opl_default_caller_delete_work=true` 和 Runway `95%` 均已撤销。结构 blocker 与 live owner evidence 分账；任一 readback 都不能授权 domain physical delete 或声明 production ready。

## 下一步停止条件

OPL 仓内原始 12 条 overengineering 候选中，11条已关闭；Runway旧策略的物理清理已完成，但follow-up no-progress enforcement按当前contract明确不落地。后续只在以下条件成立时重开：

1. OBF owner 完成 caller cutover并给出 source guard/native-helper no-active-caller evidence。
2. MAS owner 迁移 `DomainProgressTransitionRuntime` consumer ABI，允许重新审计 runtime retirement。
3. Runway owner为no-progress enforcement指定canonical admission consumer并修改当前advisory-only contract。
4. fresh source/readback 发现新的零调用实现、第二真相源或标准库替代机会。

Live provider long-soak、真实 App 用户路径、domain owner acceptance、Brand L5 和 release-ready 继续作为后置证据，不属于本清理计划的功能结构完成声明。
