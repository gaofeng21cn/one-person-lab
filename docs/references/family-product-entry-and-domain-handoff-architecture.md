# OPL 家族产品入口与 Domain Handoff 架构

## 1. 要解决的问题

`OPL` 的 direct product entry 问题并不是单仓问题，而是四仓共同问题。

当前更准确的真相是：

- `OPL` 已经有了本地 direct product-entry shell，但还没有 hosted / web 级别的完整用户前台；
- 三个业务仓虽然有的已经有 `CLI` / runtime baseline，但大多仍停留在 `operator entry` 或 `agent entry`；
- 如果只把 `OPL` 做成入口，而不同时冻结每个 domain 仓自己的 lightweight direct entry 与 handoff 关系，后续仍会出现顶层一套入口、业务仓三套入口语义各自漂移的情况。

所以这里冻结的是四仓 family-level 的入口架构，而不是只讲 `OPL` 自己。

## 2. 统一入口 taxonomy

### `operator entry`

- 面向工程操作者；
- 典型形态是命令、脚本、调试入口和运维入口；
- 适合懂系统的人直接操控，但不是普通用户产品入口。

### `agent entry`

- 面向 `Codex`、Claude Code、OpenClaw 这类 host-agent；
- 典型形态是 `CLI`、`MCP`、内部 `controller` 可调用面；
- 适合让 agent 稳定调用，但不等于普通用户已经在直接使用产品。

### `product entry`

- 面向最终用户；
- 用户不需要先理解底层 runtime 拼装、目录结构或开发宿主；
- 入口本身就承载启动、恢复、会话、路由与用户交互语义；
- 这才是独立产品形态。

当前四仓共同的真相是：

- 前两层已经不同程度存在；
- 第三层现在已经在 `OPL` 顶层先落下一版本地入口壳：`opl` 作为默认 front desk、`opl <request...>` 作为 quick ask、`opl start / doctor / ask / chat / web` 作为顶层入口，而 `opl contract ... / domain ... / status ... / workspace ... / frontdesk ... / session ... / runtime repair-gateway` 作为显式分组命令面；
- 但全家族都还没有真正成熟。

## 3. 家族级目标结构

### 顶层入口

`OPL` 已经开始成为整个 family 的 direct product entry：

`User -> OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Handoff -> Domain Product Entry / Domain Gateway`

### Domain 入口

每个业务仓未来也都应拥有自己的 lightweight direct entry：

`User -> Domain Product Entry -> Domain Gateway -> Hermes Kernel -> Domain Harness OS`

也就是说：

- `OPL` 是 family-level 总入口；
- `RedCube AI`、`Med Auto Science`、`Med Auto Grant` 也都要成为各自 scope 内可直接进入的轻量产品。

## 4. 为什么必须双层同时存在

### 只做顶层入口不够

如果只有 `OPL` 有 direct entry，而 domain 仓都只是内部能力层：

- domain 仓不再像独立产品；
- 顶层会被迫吞掉大量 domain-specific 交互逻辑；
- 单仓独立测试、独立交付、独立演化都会变弱。

### 只做 domain 入口也不够

如果每个 domain 仓都自己长入口，而顶层不先冻结 handoff 语言：

- 四仓会出现四套不同入口语义；
- `OPL` 后续再接时很容易漂移；
- 顶层切 domain 的体验会断裂。

### 正确方向

- `OPL` 和 domain 仓同时冻结 product-entry architecture；
- 顶层负责 family 入口与 handoff；
- domain 负责各自 lightweight direct entry；
- 共享同一个 runtime substrate 与 handoff envelope。

## 5. 统一 handoff envelope

`OPL -> domain` 的 handoff 不应只是“调用一个命令”，而应是冻结清楚的 envelope。

最小公共字段至少包括：

- `target_domain_id`
- `task_intent`
- `entry_mode`
- `workspace_locator`
- `runtime_session_contract`
- `return_surface_contract`

在这层公共 envelope 之下，再叠加 domain-specific payload：

- `RedCube AI`
  - `deliverable_family`、`topic_id`、`deliverable_id`
- `Med Auto Science`
  - `study_id`、`journal_target`、`evidence_boundary`
- `Med Auto Grant`
  - `workspace_id`、`draft_id`、`funding_call`

## 6. 各仓角色

### `OPL`

- 持有 family-level product entry；
- 持有 `OPL Gateway`；
- 持有共享 handoff envelope；
- 不吞掉 domain-specific product semantics。

### `RedCube AI`

- 持有 visual-only lightweight direct entry；
- 既可从 `OPL` handoff 进入，也可独立服务纯视觉交付用户。

### `Med Auto Science`

- 持有 research-only lightweight direct entry；
- 既可从 `OPL` handoff 进入，也可独立服务纯研究主线用户。

### `Med Auto Grant`

- 持有 grant-only lightweight direct entry；
- 既可从 `OPL` handoff 进入，也可独立服务纯基金申请主线用户。

## 7. 当前真相与目标真相

### 当前真相

- `OPL` 仍主要通过 `Codex + CLI / MCP` 被间接调用；
- domain 仓有的已经有可运行 `CLI` / runtime baseline；
- 但四仓都还没有成熟的 product entry。

### 目标真相

- 顶层：`OPL Product Entry`
- 单仓：`Domain Product Entry`
- 内核：共享 external `Hermes` kernel
- 衔接：统一 handoff envelope
- `Codex`：开发宿主 / operator brain，不再是产品前提

## 8. 实施顺序

### F1. 冻结 family-level truth

- 先把顶层入口、domain lightweight entry、handoff envelope 写进 repo-tracked docs 与 tests。

### F2. 先做 entry shell

- `OPL` 形成 direct entry shell；
- 各 domain 仓形成各自 lightweight direct entry shell。

### F3. 接上 Hermes-backed runtime

- 让这些入口都不再依赖 `Codex` 才能成立；
- `Codex` 退回开发宿主与高级 operator。

### F4. 再进入 hosted / web 化

- 顶层与 domain 入口都沿同一 substrate 迁移到 hosted shape。

当前这一步的顶层 hosted / web 入口已冻结为：

- 先走 `LibreChat-first` pilot
- 再回收到 `OPL` 自有 web front desk

而家族级 direct entry 的四仓推进节奏，统一参考：

- `docs/references/family-lightweight-direct-entry-rollout-board.md`

## 9. MAS 顶层切换板

`Med Auto Science` 当前不是普通的 lightweight domain entry 问题。
它还带着更重的 research runtime 与 `MedDeepScientist` backend 事实，因此顶层还需要一份单独的切换板来约束：

- `OPL` 只冻结 family-level front desk、handoff envelope 与 top-level truth；
- `MAS` 主线只推进论文配图以外的 research runtime / adapter cutover；
- display / 配图资产化支线不混入这条主线；
- 任何把 repo-side seam 误写成“已经完全脱离 `MedDeepScientist`”的叙述都视为 truth drift。

对应板面见：

- `mas-top-level-cutover-board.md`

## 10. 一句话结论

四仓后续不应再按“只有顶层像产品，业务仓只是内部能力”来演进。
正确方向是：

- `OPL` 成为 family-level direct product entry；
- 每个业务仓同时拥有自己的 lightweight direct entry；
- 两层入口通过统一 `Domain Handoff` envelope 衔接；
- 共享同一个 external `Hermes` kernel。
