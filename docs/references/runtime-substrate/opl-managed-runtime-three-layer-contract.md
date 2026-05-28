# OPL 托管运行时三层合同

Owner: `One Person Lab`
Purpose: `references_runtime_substrate_opl_managed_runtime_three_layer_contract`
State: `support_reference`
Machine boundary: 本文是人读边界参考；机器可读事实必须使用 `contracts/`、source code、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 或 App/workbench projection。

## 当前读法

本文保留“三层 owner split”作为人读解释。机器合同归 `contracts/opl-framework/managed-runtime-three-layer-contract.json`，读取和校验实现归 `src/managed-runtime-contract.ts` 与相关测试；不要从本文复制字段值、已准入 repo 列表或 readiness 计数作为机器接口。

当前长期口径是 provider-backed family runtime：Temporal-backed provider 是 production online runtime 的必需 substrate；`local_sqlite` 只允许作为 dev/CI/offline diagnostic baseline。`hermes_agent`、`claude_code` 与 `antigravity_cli` 属于显式非默认 executor adapter/backend，必须独立 receipt / audit / fail-closed；旧 Hermes provider / Gateway / readiness / compat 面只作为 history/provenance/diagnostic source ref、fixture 或负向 guard。

当前 default family、conformance、framework readiness、App/operator projection 和 evidence worklist 必须从 fresh read-model 读取：

```bash
rtk opl agents conformance --family-defaults --json
rtk opl framework readiness --family-defaults --json
rtk opl runtime app-operator-drilldown --json
rtk opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
```

这些读面可以证明 owner envelope、provider SLO、refs-only worklist、App/operator drilldown 和 standard-agent structural conformance 的当前形状；它们不能授权 domain ready、production ready、artifact authority、quality/export verdict、memory body access、artifact mutation 或 domain truth write。

## 三层 Envelope

机器合同固定的是 owner envelope 与 fail-closed 规则，不是某个 domain 的运行完成状态：

- `runtime_owner`：provider-backed family runtime owner，负责 wakeup、signal/webhook、delivery、approval transport、stage attempt ledger、query projection 和 execution history。
- `domain_owner`：domain supervision owner，负责 progress truth、quality gates、recovery judgment、owner receipt、typed blocker 和最终 domain verdict。
- `executor_owner`：具体执行 owner，负责 stage 内 domain work output 与本地副作用；默认第一公民 executor 仍是 `Codex CLI`，非默认 executor 只能通过显式 adapter/backend 接入。
- `supervision_status_surface`、`attention_queue_surface`、`recovery_contract_surface`：domain-owned 或 product-entry manifest 暴露的 locator surface，OPL 只读取和投影。
- canonical fail-closed rules：domain supervision 不能绕过 runtime；executor 不能声明 global gate clear；runtime 不能发明 domain publishability truth。

## 为什么需要这层合同

如果 hosted runtime owner、domain supervision owner 和 executor owner 混在一起，就会反复出现两类错误：

- domain 层不知道 live run 是 paused、stale 还是已经掉线
- domain 层绕过 runtime，自己维护 scheduler、retry、attempt ledger 或后半段 execution
- executor 完成、provider completion、read-model ready 或 graph visible 被误写成 domain ready / quality ready / publication ready

这份合同把边界直接写死：

- runtime / provider / attempt ledger / readiness / projection 归 OPL provider-backed family runtime 和 Runtime Manager。
- domain truth、quality/export/submission verdict、artifact authority、memory body、owner receipt 与 typed blocker 归 domain repo。
- executor binding 只说明 stage 内谁执行；它不授予 executor 关闭 domain gate、签 owner receipt 或声明 production ready 的权限。

## Family 读取方式

当前 admitted family 的具体 repo、domain id、manifest owner 字段、generated surface、conformance status 和 production evidence tail 都由 live read-model 决定。默认读取顺序：

1. 用 `opl agents conformance --family-defaults --json` 读取当前 default family 的 structural conformance、production evidence tail 和 authority boundary。
2. 用 `opl framework readiness --family-defaults --json` 读取 framework control-plane availability、provider SLO、operator attention 和 hard blocker。
3. 用 `opl runtime app-operator-drilldown --json` 读取 App/operator refs-only projection、route/action counts、domain owner payload summary、stage production evidence、Developer Mode、OMA 和 Codex App runtime evidence。
4. 用 `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` 读取 open/closed refs-only worklist、payload-required route、typed blocker grouping 和 fixed authority flags。

本文不冻结任何 `open_worklist_item_count`、blocked envelope、receipt count、default family count、attempt id、stage id 或 App/operator counter。worklist 为 0 只表示当前没有 OPL 可执行 safe-action route；worklist 大于 0 只表示等待 domain/App/live owner payload 或 typed blocker；两者都不是 domain ready、production ready 或 global completion claim。

## 非目标

- 不是 runtime control plane
- 不是共享 truth store
- 不是 App/workbench release plan
- 不是 domain readiness、publication readiness、grant submission readiness、visual export readiness 或 production readiness oracle
- 不等于当前 family agents 已经共用同一套 executor 实现
- 不把 `Hermes-Agent` 恢复为默认目标 runtime substrate
