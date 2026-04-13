# Family Orchestration 合同吸收说明

## 背景

这一轮对 `CrewAI` 的评估，结论不是“把它直接接成四仓共同依赖”，而是“把它最值得学的 orchestration 能力收编进 `OPL` 顶层 shared contracts”。

原因很直接：

1. `Codex CLI autonomous` 已经是家族默认执行器主线，能力与语义都比 `CrewAI` 自带的 agent / LLM wrapper 路径更贴近当前目标。
2. `Hermes-Agent`、`Codex CLI`、`OPL`、各 domain 仓之间已经形成了比较清楚的 owner split；如果再塞一个框架进去，容易把 runtime substrate、executor、authority、truth 混成一层。
3. 现在真正缺的不是“再来一层 agent framework”，而是“把跨仓已经反复出现的 orchestration 语义，冻结成 contract-first、machine-readable、可验证的统一 surface”。

## 结论

结论固定为：

- 不把 `CrewAI` 引入为 `OPL` family runtime dependency
- 不让 `CrewAI` 接管默认 LLM / executor / runtime owner 语义
- 只吸收它在 flow、event、checkpoint、human gate、graph introspection 这些方面最成熟的思想
- 由 `OPL` 顶层把这些思想冻结成 family orchestration companion contracts

## 当前收编的 5 类 contract

### runtime-oriented

1. `family event envelope`
   - 统一跨仓 event correlation、producer、session、audit ref 的包裹方式
2. `family checkpoint lineage`
   - 统一 checkpoint ancestry、resume、state ref 的包裹方式

### domain-oriented

3. `family action graph`
   - 统一 action graph、node、edge、checkpoint policy 的表达方式
4. `family human gate`
   - 统一 human review 的 request / decision / resume 语义
5. `family product-entry manifest v2`
   - 统一 direct entry、operator loop、human gate、resume contract 与 runtime companion 的发现面

## 明确不吸收的层

下面这些层不作为本轮 family 收编目标：

- `CrewAI` 的 `Crew` / `Agent` runtime object model
- `CrewAI` 自带的 LLM wrapper / provider assumption
- `CrewAI` 的 memory owner 语义
- `CrewAI` 的 AMP / A2A 默认 handoff 路线
- 任何把 `OPL` 改写成 domain runtime owner 的抽象

换句话说，吸收的是 orchestration contract，不是整个 framework runtime。

## 四仓 adoption 顺序

### `one-person-lab`

- 发布 family orchestration schemas
- 把 shared runtime / shared domain companion docs 与顶层 status / decisions 对齐
- 继续维持 `gateway + federation + contract authority`

### `med-autogrant`

- 第一条 adoption line
- 重点对齐 `grant-progress / grant-cockpit / grant-direct-entry / grant-user-loop`
- 主要吸收 `family action graph / family human gate / family product-entry manifest v2`

### `med-autoscience`

- 第二条 adoption line
- 重点对齐 `study_runtime_status / runtime_watch / controller_decisions/latest.json`
- 主要吸收 `family event envelope / family checkpoint lineage / family human gate`

### `redcube-ai`

- 第三条 adoption line
- 重点对齐 `product-entry manifest / session continuity / operator loop`
- 主要吸收 `family action graph / family human gate / family product-entry manifest v2`
- `event envelope / checkpoint lineage` 在这里更多是 continuity companion，而不是单独的 runtime owner surface

## 这轮交付的意义

这轮最关键的价值不是“又多了五个 schema 文件”，而是：

- 把家族级 orchestration 语义从口头共识提升成 repo-tracked contract
- 让四仓以后新增功能时优先接同一套 surface，而不是各自再发明一遍
- 为后续轻量代码对齐提供稳定锚点
- 明确告诉未来实现者：该复用的是成熟软件的长处，但 owner split 不能乱

## 后续建议

1. 先在各 domain 仓把 docs / status / architecture 对齐到这 5 类 contract。
2. 再选各仓最合适的一个 machine-readable surface 做第一批实装。
3. 在真实 adoption 稳定后，再决定哪些 helper 值得回抽，而不是先引入新框架。
